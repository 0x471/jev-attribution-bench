import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ManifestExporter } from "../src/manifest-exporter.js";
import { buildReviewProject } from "../src/project-builder.js";

describe("project build workflow", () => {
  it("builds a reproducible unapproved manifest from text artifacts and hand-authored claims", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-project-"));
    await writeFile(
      join(directory, "draft.md"),
      "# Memo\n\nThe agreement permits termination on thirty days' notice.\n",
    );
    await writeFile(
      join(directory, "source.md"),
      "# Agreement\n\nEither party may terminate on thirty days' written notice.\n",
    );
    await writeFile(
      join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: "0.1.0",
        reviewId: "review-demo",
        publication: { fixture: true, containsSensitiveData: false },
        document: {
          id: "document-v1",
          path: "draft.md",
          mediaType: "text/markdown",
        },
        sources: [
          {
            id: "source-v1",
            path: "source.md",
            mediaType: "text/markdown",
          },
        ],
        claims: [
          {
            id: "claim-1",
            text: "The agreement permits termination on thirty days' notice.",
            originText: "The agreement permits termination on thirty days' notice.",
            kind: "stated",
            proposedBy: "human",
            proposalModel: null,
            evidence: [
              {
                id: "relation-1",
                sourceId: "source-v1",
                quote: "Either party may terminate on thirty days' written notice.",
              },
            ],
          },
        ],
        argumentEdges: [],
      }),
    );
    await writeFile(
      join(directory, "assessments.json"),
      JSON.stringify({
        "relation-1": {
          relation: "supports",
          probabilities: { supports: 0.94, contradicts: 0.01, says_nothing: 0.05 },
          confidence: 0.91,
          inputTokens: 64,
        },
      }),
    );

    const manifest = await buildReviewProject({
      projectPath: join(directory, "project.json"),
      checker: { type: "fixture", assessmentsPath: join(directory, "assessments.json") },
      now: () => new Date("2026-09-23T12:00:00.000Z"),
    });

    expect(manifest.document.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(manifest.claims[0]?.origin).toMatchObject({
      artifactId: "document-v1",
      offsetEncoding: "unicode-code-point",
    });
    expect(manifest.evidenceRelations[0]?.assessment.relation).toBe("supports");
    expect(manifest.reviewActions).toEqual([]);
    expect(manifest.certification).toBeNull();
    expect((await ManifestExporter.create()).verify(manifest)).toEqual({
      valid: true,
      errors: [],
    });

    expect(JSON.parse(await readFile(join(directory, "assessments.json"), "utf8"))).toHaveProperty(
      "relation-1",
    );
  });

  it("fails when a hand-authored claim cannot be anchored to the draft", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-project-"));
    await writeFile(join(directory, "draft.txt"), "No matching sentence.");
    await writeFile(join(directory, "source.txt"), "Some source.");
    await writeFile(
      join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: "0.1.0",
        reviewId: "review-bad",
        publication: { fixture: true, containsSensitiveData: false },
        document: { id: "document-v1", path: "draft.txt", mediaType: "text/plain" },
        sources: [
          { id: "source-v1", path: "source.txt", mediaType: "text/plain" },
        ],
        claims: [
          {
            id: "claim-1",
            text: "Invented claim.",
            originText: "Invented claim.",
            kind: "stated",
            proposedBy: "human",
            proposalModel: null,
            evidence: [],
          },
        ],
        argumentEdges: [],
      }),
    );
    await writeFile(join(directory, "assessments.json"), "{}");

    await expect(
      buildReviewProject({
        projectPath: join(directory, "project.json"),
        checker: { type: "fixture", assessmentsPath: join(directory, "assessments.json") },
      }),
    ).rejects.toThrow(/claim-1.*not found in the document/i);
  });

  it("rejects malformed fixture assessments at the checker seam", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-project-"));
    await writeFile(join(directory, "draft.txt"), "A supported claim.");
    await writeFile(join(directory, "source.txt"), "Evidence for the claim.");
    await writeFile(
      join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: "0.1.0",
        reviewId: "review-malformed-assessment",
        publication: { fixture: true, containsSensitiveData: false },
        document: { id: "document-v1", path: "draft.txt", mediaType: "text/plain" },
        sources: [{ id: "source-v1", path: "source.txt", mediaType: "text/plain" }],
        claims: [{
          id: "claim-1", text: "A supported claim.", originText: "A supported claim.",
          kind: "stated", proposedBy: "human", proposalModel: null,
          evidence: [{ id: "relation-1", sourceId: "source-v1", quote: "Evidence for the claim." }],
        }],
        argumentEdges: [],
      }),
    );
    await writeFile(
      join(directory, "assessments.json"),
      JSON.stringify({
        "relation-1": {
          relation: "supports",
          probabilities: { supports: 2, contradicts: 0, says_nothing: 0 },
          confidence: 1,
          inputTokens: 0,
        },
      }),
    );

    await expect(
      buildReviewProject({
        projectPath: join(directory, "project.json"),
        checker: { type: "fixture", assessmentsPath: join(directory, "assessments.json") },
      }),
    ).rejects.toThrow(/probabilities/i);
  });

  it("rejects artifact symlinks that escape the project directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-project-"));
    const outside = await mkdtemp(join(tmpdir(), "claim-ledger-outside-"));
    await writeFile(join(directory, "draft.txt"), "A claim.");
    await writeFile(join(outside, "source.txt"), "External source material.");
    await symlink(join(outside, "source.txt"), join(directory, "source.txt"));
    await writeFile(join(directory, "assessments.json"), "{}");
    await writeFile(
      join(directory, "project.json"),
      JSON.stringify({
        schemaVersion: "0.1.0",
        reviewId: "review-path-escape",
        publication: { fixture: true, containsSensitiveData: false },
        document: { id: "document-v1", path: "draft.txt", mediaType: "text/plain" },
        sources: [{ id: "source-v1", path: "source.txt", mediaType: "text/plain" }],
        claims: [{
          id: "claim-1", text: "A claim.", originText: "A claim.", kind: "stated",
          proposedBy: "human", proposalModel: null, evidence: [],
        }],
        argumentEdges: [],
      }),
    );

    await expect(
      buildReviewProject({
        projectPath: join(directory, "project.json"),
        checker: { type: "fixture", assessmentsPath: join(directory, "assessments.json") },
      }),
    ).rejects.toThrow(/escapes the project directory/i);
  });

  it("refuses live Jev processing for projects that are not synthetic and non-sensitive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-live-policy-"));
    const original = JSON.parse(
      await readFile(new URL("../fixtures/synthetic/project.json", import.meta.url), "utf8"),
    ) as { publication: { fixture: boolean; containsSensitiveData: boolean } };
    original.publication = { fixture: false, containsSensitiveData: true };
    await writeFile(join(directory, "project.json"), JSON.stringify(original));

    await expect(
      buildReviewProject({
        projectPath: join(directory, "project.json"),
        checker: {
          type: "jev",
          cacheDirectory: join(directory, "cache"),
          liveApproved: true,
          maxProviderCalls: 1,
        },
      }),
    ).rejects.toThrow(/synthetic, non-sensitive/u);
  });
});
