import { describe, expect, it } from "vitest";

import { ingestTextArtifact } from "../src/artifacts.js";
import {
  EvidenceReviewEngine,
  locateNormalizedQuote,
  type EvidenceRelationChecker,
  type RelationInput,
} from "../src/evidence-review.js";

class RecordingChecker implements EvidenceRelationChecker {
  readonly calls: RelationInput[] = [];

  async check(input: RelationInput) {
    this.calls.push(input);
    return {
      relation: "supports" as const,
      requestedModel: "fixture-v1",
      resolvedModel: "fixture-v1",
      rubricVersion: "evidence-relation-v1",
      probabilities: { supports: 0.9, contradicts: 0.03, says_nothing: 0.07 },
      confidence: 0.86,
      inputTokens: 42,
      outputTokens: 3,
      runAt: "2026-09-23T10:00:00.000Z",
    };
  }
}

describe("EvidenceReviewEngine seam", () => {
  it("records Unicode code-point offsets when astral characters precede a quote", () => {
    const source = "🔒 Prefix. Evidence supports the claim.";
    expect(locateNormalizedQuote(source, "Evidence supports the claim.")).toEqual({
      start: 10,
      end: 38,
      text: "Evidence supports the claim.",
    });
  });

  it("locates normalized quotation text in code before asking the checker", async () => {
    const source = ingestTextArtifact({
      id: "source-v1",
      role: "source",
      name: "agreement.md",
      mediaType: "text/markdown",
      bytes: new TextEncoder().encode(
        "Section 4\n\nNorthstar may recover documented,\nnon-cancellable costs “directly incurred” before termination.",
      ),
    });
    const checker = new RecordingChecker();
    const engine = new EvidenceReviewEngine(checker, {
      rubricVersion: "evidence-relation-v1",
      contextCharacters: 500,
    });

    const review = await engine.review({
      id: "relation-1",
      claim: {
        id: "claim-1",
        text: "Northstar may recover documented non-cancellable costs incurred before termination.",
      },
      source,
      proposedQuote:
        'Northstar may recover documented, non-cancellable costs "directly incurred" before termination.',
    });

    expect(review.assessment.relation).toBe("supports");
    expect(review.assessment.exactMatch).toBe(true);
    expect(review.evidence.anchor).not.toBeNull();
    expect(review.evidence.text).toContain("“directly incurred”");
    expect(checker.calls).toHaveLength(1);
    expect(checker.calls[0]).toMatchObject({
      relationId: "relation-1",
      sourceArtifactId: "source-v1",
    });
    expect(checker.calls[0]?.context).toContain("Section 4");
    expect(review).not.toHaveProperty("approval");
  });

  it("marks a missing quotation fabricated without calling the model checker", async () => {
    const source = ingestTextArtifact({
      id: "source-v1",
      role: "source",
      name: "agreement.txt",
      mediaType: "text/plain",
      bytes: new TextEncoder().encode("The agreement says something else."),
    });
    const checker = new RecordingChecker();
    const engine = new EvidenceReviewEngine(checker, {
      rubricVersion: "evidence-relation-v1",
      contextCharacters: 500,
    });

    const review = await engine.review({
      id: "relation-2",
      claim: { id: "claim-2", text: "The agreement permits termination." },
      source,
      proposedQuote: "Either party may terminate immediately.",
    });

    expect(review.evidence.anchor).toBeNull();
    expect(review.assessment).toMatchObject({
      relation: "fabricated",
      exactMatch: false,
      requestedModel: null,
      resolvedModel: null,
      probabilities: null,
      confidence: null,
      inputTokens: null,
      outputTokens: null,
    });
    expect(checker.calls).toHaveLength(0);
  });
});
