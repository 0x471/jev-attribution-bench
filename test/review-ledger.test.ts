import { describe, expect, it } from "vitest";

import type { ReviewManifest } from "../src/manifest.js";
import { ReviewLedger, certificationStatus, reviewStateDigest } from "../src/review-ledger.js";

function baseManifest(): ReviewManifest {
  return {
    schemaVersion: "0.1.0",
    reviewId: "review-1",
    createdAt: "2026-09-23T10:00:00.000Z",
    publication: { fixture: true, containsSensitiveData: false },
    document: {
      id: "document-v1",
      role: "document",
      name: "draft.md",
      mediaType: "text/markdown",
      byteLength: 10,
      sha256: "1".repeat(64),
    },
    sources: [
      {
        id: "source-v1",
        role: "source",
        name: "source.md",
        mediaType: "text/markdown",
        byteLength: 20,
        sha256: "2".repeat(64),
      },
    ],
    claims: [
      {
        id: "claim-1",
        text: "A supported claim.",
        origin: {
          artifactId: "document-v1",
          start: 0,
          end: 10,
          textSha256: "3".repeat(64),
          offsetEncoding: "unicode-code-point",
        },
        kind: "stated",
        proposedBy: "human",
        proposalModel: null,
      },
    ],
    evidenceRelations: [
      {
        id: "relation-1",
        claimId: "claim-1",
        evidence: {
          sourceArtifactId: "source-v1",
          proposedQuote: "Support.",
          text: "Support.",
          anchor: {
            artifactId: "source-v1",
            start: 0,
            end: 8,
            textSha256: "4".repeat(64),
            offsetEncoding: "unicode-code-point",
          },
        },
        assessment: {
          relation: "supports",
          exactMatch: true,
          requestedModel: "jev-1.13.0",
          resolvedModel: "jev-1.13.0",
          rubricVersion: "evidence-relation-v1",
          inputSha256: "5".repeat(64),
          probabilities: { supports: 0.9, contradicts: 0.05, says_nothing: 0.05 },
          confidence: 0.85,
          inputTokens: 100,
          outputTokens: 12,
          runAt: "2026-09-23T10:00:00.000Z",
        },
      },
    ],
    argumentEdges: [],
    reviewActions: [],
    certification: null,
    toolchain: {
      claimLedgerVersion: "0.0.0",
      nodeVersion: "22.22.0",
      sdkVersion: "0.6.0",
    },
  };
}

const reviewer = { displayName: "Reviewer A", identityAssurance: "self-asserted" as const };

describe("ReviewLedger seam", () => {
  it("requires explicit human actions for every reviewable subject before certification", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();

    expect(() => ledger.certify(manifest, reviewer)).toThrow(/claim-1.*relation-1/s);

    manifest = ledger.record(manifest, {
      subjectType: "claim",
      subjectId: "claim-1",
      decision: "approve",
      reason: null,
      reviewer,
    });
    expect(manifest.certification).toBeNull();

    manifest = ledger.record(manifest, {
      subjectType: "evidence-relation",
      subjectId: "relation-1",
      decision: "approve",
      reason: null,
      reviewer,
    });
    manifest = ledger.certify(manifest, reviewer);

    expect(manifest.certification?.reviewStateSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(certificationStatus(manifest)).toEqual({ valid: true });
    expect(manifest.reviewActions.at(-1)).toMatchObject({
      subjectType: "document",
      subjectId: "document-v1",
      decision: "approve",
      reviewer,
    });
  });

  it("invalidates certification and actions when an artifact digest changes", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();
    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, {
        subjectType,
        subjectId,
        decision: "approve",
        reason: null,
        reviewer,
      });
    }
    manifest = ledger.certify(manifest, reviewer);

    const changed = structuredClone(manifest);
    changed.document.sha256 = "9".repeat(64);

    expect(certificationStatus(changed)).toMatchObject({ valid: false, reason: "artifact-changed" });
  });

  it("preserves stale history but permits fresh review actions for changed artifacts", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();
    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, { subjectType, subjectId, decision: "approve", reason: null, reviewer });
    }
    manifest = ledger.certify(manifest, reviewer);
    manifest.sources[0]!.sha256 = "8".repeat(64);
    expect(certificationStatus(manifest)).toMatchObject({ valid: false, reason: "artifact-changed" });
    expect(() => ledger.certify(manifest, reviewer)).toThrow(/claim-1.*relation-1/s);

    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, { subjectType, subjectId, decision: "approve", reason: null, reviewer });
    }
    manifest = ledger.certify(manifest, reviewer);
    expect(certificationStatus(manifest)).toEqual({ valid: true });
    expect(manifest.reviewActions.length).toBe(6);
  });

  it("binds source identity as well as the digest multiset", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();
    manifest.sources.push({
      id: "source-v2", role: "source", name: "second.md", mediaType: "text/markdown",
      byteLength: 20, sha256: "6".repeat(64),
    });
    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, { subjectType, subjectId, decision: "approve", reason: null, reviewer });
    }
    manifest = ledger.certify(manifest, reviewer);
    const first = manifest.sources[0]!.sha256;
    manifest.sources[0]!.sha256 = manifest.sources[1]!.sha256;
    manifest.sources[1]!.sha256 = first;

    expect(certificationStatus(manifest)).toMatchObject({ valid: false, reason: "artifact-changed" });
  });

  it("requires re-review when an automated assessment or rubric changes", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();
    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, { subjectType, subjectId, decision: "approve", reason: null, reviewer });
    }
    manifest = ledger.certify(manifest, reviewer);
    manifest.evidenceRelations[0]!.assessment.rubricVersion = "evidence-relation-v2";

    expect(certificationStatus(manifest)).toMatchObject({ valid: false });
    expect(() => ledger.certify(manifest, reviewer)).toThrow(/relation-1/);
  });

  it("requires a reason for a human waiver", () => {
    const ledger = new ReviewLedger();
    expect(() =>
      ledger.record(baseManifest(), {
        subjectType: "claim",
        subjectId: "claim-1",
        decision: "waive",
        reason: null,
        reviewer,
      }),
    ).toThrow(/reason/i);
  });

  it("rejects a forged certification when reviewable subjects are unresolved", () => {
    const ledger = new ReviewLedger({ now: () => new Date("2026-09-23T11:00:00.000Z") });
    let manifest = baseManifest();
    for (const [subjectType, subjectId] of [
      ["claim", "claim-1"],
      ["evidence-relation", "relation-1"],
    ] as const) {
      manifest = ledger.record(manifest, {
        subjectType,
        subjectId,
        decision: "approve",
        reason: null,
        reviewer,
      });
    }
    manifest = ledger.certify(manifest, reviewer);
    manifest.reviewActions = manifest.reviewActions.filter(
      (action) => action.subjectType === "document",
    );
    manifest.certification!.reviewStateSha256 = reviewStateDigest(manifest);

    expect(certificationStatus(manifest)).toEqual({
      valid: false,
      reason: "unresolved-subjects",
    });
  });
});
