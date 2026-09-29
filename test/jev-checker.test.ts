import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CachedEvidenceRelationChecker,
  FileAssessmentCache,
  JevEvidenceRelationChecker,
  LimitedEvidenceRelationChecker,
  type SystemOneClient,
} from "../src/jev-checker.js";

const input = {
  relationId: "relation-1",
  sourceArtifactId: "source-v1",
  sourceSha256: "a".repeat(64),
  evidenceAnchor: { start: 0, end: 57, textSha256: "b".repeat(64) },
  claim: { id: "claim-1", text: "The agreement permits termination." },
  context: "Either party may terminate on thirty days' written notice.",
  rubricVersion: "evidence-relation-v1",
};

describe("EvidenceRelationChecker seam", () => {
  it("rejects a different Jev version even when it is a versioned identifier", () => {
    expect(
      () =>
        new JevEvidenceRelationChecker({ systemOne: async () => { throw new Error("unused"); } }, {
          model: "jev-1.14.0",
          rubricVersion: "evidence-relation-v1",
        }),
    ).toThrow(/jev-1\.13\.0/u);
  });

  it("asks one pinned three-way Choice and preserves its complete distribution", async () => {
    const systemOne = vi.fn(async (_request: unknown) => ({
      model: "jev-1.13.0",
      answers: {
        relation: {
          type: "choice" as const,
          choice: "supports",
          probabilities: { supports: 0.91, contradicts: 0.02, says_nothing: 0.07 },
          confidence: 0.88,
        },
      },
      usage: { input_tokens: 120, output_tokens: 12 },
      providerRequestId: "req_test_123",
    }));
    const client: SystemOneClient = { systemOne };
    const checker = new JevEvidenceRelationChecker(client, {
      model: "jev-1.13.0",
      rubricVersion: "evidence-relation-v1",
      timeoutMs: 15_000,
      maxRetries: 2,
      now: () => new Date("2026-09-23T10:00:00.000Z"),
    });

    await expect(checker.check(input)).resolves.toEqual({
      relation: "supports",
      requestedModel: "jev-1.13.0",
      resolvedModel: "jev-1.13.0",
      rubricVersion: "evidence-relation-v1",
      probabilities: { supports: 0.91, contradicts: 0.02, says_nothing: 0.07 },
      confidence: 0.88,
      inputTokens: 120,
      outputTokens: 12,
      runAt: "2026-09-23T10:00:00.000Z",
      providerRequestId: "req_test_123",
    });

    expect(systemOne).toHaveBeenCalledWith(
      {
        model: "jev-1.13.0",
        state: { claim: input.claim.text, evidence_context: input.context },
        questions: {
          relation: {
            type: "choice",
            instructions:
              "How does `evidence_context` relate to `claim`? Judge only the supplied evidence context.",
            criteria: {
              supports: "The evidence context states the claim or directly implies that it is true.",
              contradicts:
                "The evidence context states the opposite of the claim or directly implies that it is false.",
              says_nothing:
                "The evidence context does not establish or contradict what the claim asserts.",
            },
          },
        },
      },
      { timeout: 15_000, retry: { maxRetries: 2 } },
    );
  });

  it("caches immutable assessments by complete semantic input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-cache-"));
    const inner = {
      check: vi.fn(async () => ({
        relation: "says_nothing" as const,
        requestedModel: "fixture-v1",
        resolvedModel: "fixture-v1",
        rubricVersion: "evidence-relation-v1",
        probabilities: { supports: 0.1, contradicts: 0.1, says_nothing: 0.8 },
        confidence: 0.7,
        inputTokens: 20,
        outputTokens: 4,
        runAt: "2026-09-23T10:00:00.000Z",
      })),
    };
    const checker = new CachedEvidenceRelationChecker(
      inner,
      new FileAssessmentCache(directory),
      "fixture-v1",
    );

    const first = await checker.check(input);
    const second = await checker.check(input);

    expect(second).toEqual(first);
    expect(inner.check).toHaveBeenCalledTimes(1);
    await checker.check({ ...input, sourceSha256: "c".repeat(64) });
    expect(inner.check).toHaveBeenCalledTimes(2);
    const index = JSON.parse(await readFile(join(directory, "index.json"), "utf8")) as object;
    expect(Object.keys(index)).toHaveLength(2);
  });

  it("enforces a hard logical provider-call limit and counts failed attempts", async () => {
    const inner = {
      check: vi
        .fn()
        .mockRejectedValueOnce(new Error("provider unavailable"))
        .mockResolvedValueOnce({
          relation: "supports" as const,
          requestedModel: "jev-1.13.0",
          resolvedModel: "jev-1.13.0",
          rubricVersion: "evidence-relation-v1",
          probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
          confidence: 0.8,
          inputTokens: 10,
          outputTokens: 2,
          runAt: "2026-09-23T10:00:00.000Z",
        }),
    };
    const limited = new LimitedEvidenceRelationChecker(inner, 1);

    await expect(limited.check(input)).rejects.toThrow(/provider unavailable/u);
    await expect(limited.check(input)).rejects.toThrow(/provider call limit of 1/u);
    expect(inner.check).toHaveBeenCalledTimes(1);
  });

  it("places the cache outside the call limiter so cache hits spend no provider calls", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-limited-cache-"));
    const inner = {
      check: vi.fn(async () => ({
        relation: "supports" as const,
        requestedModel: "jev-1.13.0",
        resolvedModel: "jev-1.13.0",
        rubricVersion: "evidence-relation-v1",
        probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
        confidence: 0.8,
        inputTokens: 10,
        outputTokens: 2,
        runAt: "2026-09-23T10:00:00.000Z",
      })),
    };
    const cached = new CachedEvidenceRelationChecker(
      new LimitedEvidenceRelationChecker(inner, 1),
      new FileAssessmentCache(directory),
      "jev-1.13.0:evidence-relation-v1:sdk-0.6.0",
    );

    await cached.check(input);
    await cached.check(input);
    expect(inner.check).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed provider probabilities rather than coercing them", async () => {
    const client: SystemOneClient = {
      systemOne: async () => ({
        model: "jev-1.13.0",
        answers: {
          relation: {
            type: "choice",
            choice: "supports",
            probabilities: { supports: 2, contradicts: 0, says_nothing: 0 },
            confidence: 1,
          },
        },
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    };
    const checker = new JevEvidenceRelationChecker(client, {
      model: "jev-1.13.0",
      rubricVersion: "evidence-relation-v1",
    });

    await expect(checker.check(input)).rejects.toThrow(/probabilities/i);
  });

  it("rejects a provider response that resolves to an unpinned model alias", async () => {
    const checker = new JevEvidenceRelationChecker(
      {
        systemOne: async () => ({
          model: "jev-latest",
          answers: {
            relation: {
              type: "choice",
              choice: "supports",
              probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
              confidence: 0.8,
            },
          },
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      },
      { model: "jev-1.13.0", rubricVersion: "evidence-relation-v1" },
    );

    await expect(checker.check(input)).rejects.toThrow(/jev-latest.*jev-1\.13\.0/u);
  });

  it("keeps prompt-injection text inert inside state without changing the rubric or model", async () => {
    const adversarial = JSON.parse(
      await readFile(
        new URL("../fixtures/adversarial/prompt-injection.json", import.meta.url),
        "utf8",
      ),
    ) as { claim: string; context: string; expectedRelation: "supports" };
    const systemOne = vi.fn(async (_request: unknown) => ({
      model: "jev-1.13.0",
      answers: {
        relation: {
          type: "choice" as const,
          choice: adversarial.expectedRelation,
          probabilities: { supports: 0.9, contradicts: 0.02, says_nothing: 0.08 },
          confidence: 0.8,
        },
      },
      usage: { input_tokens: 30, output_tokens: 3 },
    }));
    const checker = new JevEvidenceRelationChecker({ systemOne }, {
      model: "jev-1.13.0",
      rubricVersion: "evidence-relation-v1",
    });

    await checker.check({ ...input, claim: { ...input.claim, text: adversarial.claim }, context: adversarial.context });
    const [request] = systemOne.mock.calls[0]! as unknown as [
      { model: string; state: { claim: string; evidence_context: string }; questions: Record<string, unknown> },
    ];
    expect(request).toMatchObject({
      model: "jev-1.13.0",
      state: { claim: adversarial.claim, evidence_context: adversarial.context },
    });
    expect(JSON.stringify(request.questions)).not.toContain("IGNORE THE RUBRIC");
    expect(Object.keys(request.questions)).toEqual(["relation"]);
  });
});
