import { describe, expect, it } from "vitest";

import {
  assertAttributionDataset,
  assertAttributionDatasetApproval,
  evaluateAttributionChecker,
} from "../src/attribution-evaluation.js";
import type { AttributionDataset } from "../src/attributionbench.js";
import {
  ATTRIBUTIONBENCH_ARTIFACTS,
  ATTRIBUTIONBENCH_CODE_REVISION,
  ATTRIBUTIONBENCH_DATA_REVISION,
} from "../src/attributionbench.js";
import { sha256 } from "../src/artifacts.js";

function dataset(): AttributionDataset {
  const rows = Object.entries(ATTRIBUTIONBENCH_ARTIFACTS.sampled500.sourceLabelCounts).flatMap(
    ([sourceDataset, [positiveCount, negativeCount]]) => [
      ...Array.from({ length: positiveCount }, () => ({
        sourceDataset,
        expectedLabel: "attributable" as const,
      })),
      ...Array.from({ length: negativeCount }, () => ({
        sourceDataset,
        expectedLabel: "not_attributable" as const,
      })),
    ],
  );
  return {
    schemaVersion: "0.1.0",
    dataPolicy: {
      containsPrivateOrConfidentialData: false,
      mayContainPublicPersonalData: true,
      mayContainUntrustedWebText: true,
    },
    source: {
      kind: "public-benchmark",
      artifact: "sampled500",
      name: "AttributionBench official balanced 500-row standalone sample",
      split: "standalone-sampled500",
      license: "Apache-2.0 dataset card; aggregated upstream terms still apply",
      sourceUrl: "https://example.test",
      sourceRevision: ATTRIBUTIONBENCH_DATA_REVISION,
      codeRevision: ATTRIBUTIONBENCH_CODE_REVISION,
      sourceSha256: ATTRIBUTIONBENCH_ARTIFACTS.sampled500.sha256,
      preparation: "test-v1",
    },
    sourceRows: 500,
    exclusions: [],
    cases: rows.map((row, index) => ({
      id: `case-${index}`,
      groupId: sha256(`${row.sourceDataset}\0Question ${index % 2}`),
      sourceLine: index + 1,
      question: `Question ${index % 2}`,
      claim: `Claim ${index}`,
      references: [`Reference ${index}`],
      expectedLabel: row.expectedLabel,
      sourceDataset: row.sourceDataset,
    })),
  };
}

describe("AttributionBench evaluation", () => {
  it("computes binary, coverage, source, usage, and cost metrics", async () => {
    let calls = 0;
    let clock = 0;
    const testDataset = dataset();
    const report = await evaluateAttributionChecker(
      {
        check: async (input) => {
          const index = Number(input.id.slice("case-".length));
          calls += 1;
          const expected = testDataset.cases[index]!.expectedLabel;
          const label =
            index === 250
              ? expected === "attributable"
                ? "not_attributable"
                : "attributable"
              : expected;
          return {
            label,
            probabilities:
              label === "attributable"
                ? { attributable: 0.8, not_attributable: 0.2 }
                : { attributable: 0.1, not_attributable: 0.9 },
            confidence: 0.8,
            inputTokens: 100,
            outputTokens: 5,
            requestedModel: "jev-1.13.0",
            resolvedModel: "jev-1.13.0",
            rubricVersion: "attributionbench-binary-v1",
            runAt: "2026-09-29T00:00:00.000Z",
          };
        },
      },
      testDataset,
      () => (clock += 2),
    );

    expect(calls).toBe(500);
    expect(report.summary.coverage).toBe(1);
    expect(report.summary.accuracy).toBe(499 / 500);
    expect(report.summary.endToEndAccuracyLowerBound).toBe(499 / 500);
    expect(report.summary.totalInputTokens).toBe(50_000);
    expect(report.summary.estimatedInputCostUsd).toBeCloseTo(0.0021);
    expect(report.summary.averageLatencyMs).toBe(2);
    expect(report.confusionMatrix.not_attributable.attributable).toBe(1);
    expect(report.bySource.AttributedQA!.cases).toBe(72);
    expect(report.summary.accuracyWilson95[0]).toBeLessThan(report.summary.accuracy);
    expect(report.summary.groupedBootstrapAccuracy95).toHaveLength(2);
    expect(report.selectivePerformance[0]).toMatchObject({ cases: 500, coverage: 1 });
  });

  it("requires all three outbound approvals", () => {
    const value = dataset();
    expect(() => assertAttributionDataset(value)).not.toThrow();
    expect(() =>
      assertAttributionDatasetApproval(value, {
        allowPublicBenchmark: true,
        allowPublicPersonalData: true,
        allowUntrustedWebText: false,
      }),
    ).toThrow(/untrusted web text/u);
    expect(() =>
      assertAttributionDatasetApproval(value, {
        allowPublicBenchmark: true,
        allowPublicPersonalData: true,
        allowUntrustedWebText: true,
      }),
    ).not.toThrow();
  });

  it("rejects missing provenance and duplicate ids", () => {
    const value = dataset();
    expect(() => assertAttributionDataset({ ...value, sourceRows: 499 })).toThrow(/provenance-complete/u);
    expect(() =>
      assertAttributionDataset({
        ...value,
        cases: [value.cases[0], value.cases[0], ...value.cases.slice(2)],
      }),
    ).toThrow(/Duplicate/u);
  });
});
