import { describe, expect, it } from "vitest";

import {
  assertEvidenceRelationDataset,
  assertEvidenceRelationDatasetApproval,
  evaluateEvidenceRelationChecker,
  type EvidenceRelationDataset,
} from "../src/checker-evaluation.js";

const dataset: EvidenceRelationDataset = {
  schemaVersion: "0.3.0",
  dataPolicy: {
    containsPrivateOrConfidentialData: false,
    mayContainPublicPersonalData: false,
  },
  source: { kind: "synthetic", name: "test fixture" },
  cases: [
    { id: "s", claim: "s", context: "s", expectedRelation: "supports", phenomenon: "test" },
    { id: "c", claim: "c", context: "c", expectedRelation: "contradicts", phenomenon: "test" },
    { id: "n", claim: "n", context: "n", expectedRelation: "says_nothing", phenomenon: "test" },
  ],
};

describe("evidence relation checker evaluation", () => {
  it("computes balanced metrics, usage, cost, and confusion counts", async () => {
    const outputs = [
      { relation: "supports" as const, probabilities: { supports: 1, contradicts: 0, says_nothing: 0 } },
      { relation: "supports" as const, probabilities: { supports: 0.6, contradicts: 0.4, says_nothing: 0 } },
      { relation: "says_nothing" as const, probabilities: { supports: 0, contradicts: 0, says_nothing: 1 } },
    ];
    let call = 0;
    let clock = 0;
    const report = await evaluateEvidenceRelationChecker(
      {
        check: async () => {
          const output = outputs[call++]!;
          return {
            ...output,
            requestedModel: "jev-1.13.0",
            resolvedModel: "jev-1.13.0",
            rubricVersion: "evidence-relation-v1",
            confidence: 0.8,
            inputTokens: 100,
            outputTokens: 10,
            runAt: "2026-09-24T00:00:00.000Z",
          };
        },
      },
      dataset,
      () => (clock += 5),
    );

    expect(report.summary.accuracy).toBeCloseTo(2 / 3);
    expect(report.summary.macroF1).toBeCloseTo((2 / 3 + 0 + 1) / 3);
    expect(report.summary.totalInputTokens).toBe(300);
    expect(report.summary.totalOutputTokens).toBe(30);
    expect(report.summary.estimatedInputCostUsd).toBeCloseTo(0.0000126);
    expect(report.summary.averageLatencyMs).toBe(5);
    expect(report.summary.latencyMeasurement).toBe("fresh-provider-calls");
    expect(report.confusionMatrix.contradicts.supports).toBe(1);
    expect(report.byClass.contradicts.support).toBe(1);
    expect(report.dataset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.toolchain).toEqual({
      requestedModels: ["jev-1.13.0"],
      resolvedModels: ["jev-1.13.0"],
      rubricVersions: ["evidence-relation-v1"],
      sdkVersion: "0.6.0",
    });
    expect(report.pricing.inputUsdPerMillionTokens).toBe(0.042);
  });

  it("suppresses latency when a report mixes provider calls and cache hits", async () => {
    const report = await evaluateEvidenceRelationChecker(
      {
        check: async () => ({
          relation: "supports",
          requestedModel: "jev-1.13.0",
          resolvedModel: "jev-1.13.0",
          rubricVersion: "evidence-relation-v1",
          probabilities: { supports: 1, contradicts: 0, says_nothing: 0 },
          confidence: 1,
          inputTokens: 1,
          outputTokens: 1,
          runAt: "2026-09-24T00:00:00.000Z",
        }),
      },
      { ...dataset, cases: [dataset.cases[0]!] },
      () => 1,
      "mixed-cache-not-reported",
    );

    expect(report.summary.averageLatencyMs).toBeNull();
    expect(report.summary.latencyMeasurement).toBe("mixed-cache-not-reported");
  });

  it("rejects missing provenance or duplicate-id datasets before any provider call", () => {
    expect(() =>
      assertEvidenceRelationDataset({ ...dataset, dataPolicy: undefined }),
    ).toThrow(/data policy/u);
    expect(() =>
      assertEvidenceRelationDataset({ ...dataset, cases: [dataset.cases[0], dataset.cases[0]] }),
    ).toThrow(/Duplicate/u);
  });

  it("requires complete provenance for public benchmarks", () => {
    expect(() =>
      assertEvidenceRelationDataset({
        ...dataset,
        source: { kind: "public-benchmark", name: "incomplete" },
      }),
    ).toThrow(/complete source/u);
  });

  it("requires separate approval for a public benchmark and public personal data", () => {
    const publicDataset: EvidenceRelationDataset = {
      ...dataset,
      dataPolicy: {
        containsPrivateOrConfidentialData: false,
        mayContainPublicPersonalData: true,
      },
      source: {
        kind: "public-benchmark",
        name: "public test",
        split: "dev",
        license: "CC BY 4.0",
        sourceUrl: "https://example.test",
        sourceRevision: "revision",
        sourceSha256: "a".repeat(64),
        preparation: "test-v1",
      },
    };

    expect(() =>
      assertEvidenceRelationDatasetApproval(publicDataset, {
        allowPublicBenchmark: false,
        allowPublicPersonalData: false,
      }),
    ).toThrow(/public benchmark/u);
    expect(() =>
      assertEvidenceRelationDatasetApproval(publicDataset, {
        allowPublicBenchmark: true,
        allowPublicPersonalData: false,
      }),
    ).toThrow(/public personal data/u);
    expect(() =>
      assertEvidenceRelationDatasetApproval(publicDataset, {
        allowPublicBenchmark: true,
        allowPublicPersonalData: true,
      }),
    ).not.toThrow();
  });
});
