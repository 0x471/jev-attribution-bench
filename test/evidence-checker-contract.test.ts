import { describe, expect, it } from "vitest";

import type { EvidenceRelationChecker, RelationInput } from "../src/evidence-review.js";
import { FixtureEvidenceRelationChecker } from "../src/fixture-checker.js";
import { JevEvidenceRelationChecker } from "../src/jev-checker.js";

const input: RelationInput = {
  relationId: "relation-contract",
  sourceArtifactId: "source-v1",
  sourceSha256: "a".repeat(64),
  evidenceAnchor: { start: 0, end: 8, textSha256: "b".repeat(64) },
  claim: { id: "claim-1", text: "A supported claim." },
  context: "Support.",
  rubricVersion: "evidence-relation-v1",
};

function checkerFactories(): Array<[string, () => EvidenceRelationChecker]> {
  return [
    [
      "offline fixture",
      () =>
        new FixtureEvidenceRelationChecker(
          {
            "relation-contract": {
              relation: "supports",
              probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
              confidence: 0.84,
              inputTokens: 12,
              outputTokens: 3,
            },
          },
          () => new Date("2026-09-23T12:00:00.000Z"),
        ),
    ],
    [
      "Jev adapter with mocked transport",
      () =>
        new JevEvidenceRelationChecker(
          {
            systemOne: async () => ({
              model: "jev-1.13.0",
              answers: {
                relation: {
                  type: "choice",
                  choice: "supports",
                  probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
                  confidence: 0.84,
                },
              },
              usage: { input_tokens: 12, output_tokens: 3 },
            }),
          },
          {
            model: "jev-1.13.0",
            rubricVersion: "evidence-relation-v1",
            now: () => new Date("2026-09-23T12:00:00.000Z"),
          },
        ),
    ],
  ];
}

describe.each(checkerFactories())("EvidenceRelationChecker contract: %s", (_name, create) => {
  it("returns the complete narrow assessment contract", async () => {
    await expect(create().check(input)).resolves.toMatchObject({
      relation: "supports",
      requestedModel: expect.any(String),
      resolvedModel: expect.any(String),
      rubricVersion: "evidence-relation-v1",
      probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
      confidence: 0.84,
      inputTokens: 12,
      outputTokens: 3,
      runAt: "2026-09-23T12:00:00.000Z",
    });
  });
});
