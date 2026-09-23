import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildReviewProject, verifyProjectArtifacts } from "../src/project-builder.js";

describe("project artifact verification", () => {
  it("detects any byte change after a manifest is built", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-verify-"));
    await writeFile(join(directory, "draft.md"), "The notice period is 30 days.\n");
    await writeFile(join(directory, "source.md"), "Notice must be given 30 days in advance.\n");
    await writeFile(
      join(directory, "assessments.json"),
      JSON.stringify({
        "evidence-1": {
          relation: "supports",
          requestedModel: "fixture",
          resolvedModel: "fixture-v1",
          rubricVersion: "evidence-relation-v1",
          probabilities: { supports: 1, contradicts: 0, says_nothing: 0 },
          confidence: 1,
          inputTokens: 0,
        },
      }),
    );
    const projectPath = join(directory, "project.json");
    await writeFile(
      projectPath,
      JSON.stringify({
        schemaVersion: "0.1.0",
        reviewId: "review-verify",
        publication: { fixture: true, containsSensitiveData: false },
        document: { id: "draft", path: "draft.md", mediaType: "text/markdown" },
        sources: [{ id: "source", path: "source.md", mediaType: "text/markdown" }],
        claims: [
          {
            id: "claim-1",
            text: "The notice period is 30 days.",
            originText: "The notice period is 30 days.",
            kind: "stated",
            proposedBy: "human",
            proposalModel: null,
            evidence: [
              { id: "evidence-1", sourceId: "source", quote: "Notice must be given 30 days in advance." },
            ],
          },
        ],
        argumentEdges: [],
      }),
    );

    const manifest = await buildReviewProject({
      projectPath,
      checker: { type: "fixture", assessmentsPath: join(directory, "assessments.json") },
    });
    expect(await verifyProjectArtifacts(projectPath, manifest)).toEqual({ valid: true, errors: [] });

    const tamperedPolicy = structuredClone(manifest);
    tamperedPolicy.publication.fixture = false;
    expect((await verifyProjectArtifacts(projectPath, tamperedPolicy)).errors.join("\n")).toMatch(
      /publication policy/i,
    );

    const tamperedMetadata = structuredClone(manifest);
    tamperedMetadata.document.mediaType = "application/pdf" as "text/plain";
    tamperedMetadata.document.byteLength += 1;
    expect((await verifyProjectArtifacts(projectPath, tamperedMetadata)).errors.join("\n")).toMatch(
      /artifact metadata/i,
    );

    const tamperedAnchor = structuredClone(manifest);
    tamperedAnchor.claims[0]!.origin.start += 1;
    const anchorResult = await verifyProjectArtifacts(projectPath, tamperedAnchor);
    expect(anchorResult.valid).toBe(false);
    expect(anchorResult.errors.join("\n")).toMatch(/claim-1.*anchor/i);

    const injected = structuredClone(manifest);
    injected.claims.push({ ...structuredClone(injected.claims[0]!), id: "claim-injected" });
    injected.evidenceRelations.push({
      ...structuredClone(injected.evidenceRelations[0]!),
      id: "evidence-injected",
      claimId: "claim-injected",
    });
    injected.argumentEdges.push({
      id: "edge-injected",
      fromClaimId: "claim-1",
      toClaimId: "claim-injected",
      relation: "supports",
      proposedBy: "human",
    });
    const injectionResult = await verifyProjectArtifacts(projectPath, injected);
    expect(injectionResult.valid).toBe(false);
    expect(injectionResult.errors.join("\n")).toMatch(/claim-injected.*absent from the project/i);
    expect(injectionResult.errors.join("\n")).toMatch(/evidence-injected.*absent from the project/i);
    expect(injectionResult.errors.join("\n")).toMatch(/argument edges do not match/i);

    await writeFile(join(directory, "source.md"), "Notice must be given 31 days in advance.\n");
    const result = await verifyProjectArtifacts(projectPath, manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/source.*sha256/i);
  });
});
