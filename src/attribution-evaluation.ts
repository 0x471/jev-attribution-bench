import { performance } from "node:perf_hooks";

import { sha256 } from "./artifacts.js";
import {
  ATTRIBUTIONBENCH_ARTIFACTS,
  ATTRIBUTIONBENCH_CODE_REVISION,
  ATTRIBUTIONBENCH_DATA_REVISION,
  ATTRIBUTION_LABELS,
  type AttributionCase,
  type AttributionDataset,
  type AttributionLabel,
} from "./attributionbench.js";
import type {
  AttributionAssessment,
  AttributionChecker,
  AttributionInput,
} from "./jev-attribution-checker.js";

interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface AttributionCaseResult {
  id: string;
  groupId: string;
  sourceLine: number;
  sourceDataset: string;
  expectedLabel: AttributionLabel;
  predictedLabel: AttributionLabel;
  correct: boolean;
  probabilities: AttributionAssessment["probabilities"];
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  requestedModel: string;
  resolvedModel: string;
  rubricVersion: string;
  assessmentRunAt: string;
  providerRequestId?: string;
  cacheStatus: "hit" | "miss" | "unknown";
}

interface MetricSet {
  cases: number;
  accuracy: number;
  macroF1: number;
  confusionMatrix: Record<AttributionLabel, Record<AttributionLabel, number>>;
  byClass: Record<AttributionLabel, ClassMetrics>;
}

export interface AttributionEvaluationReport {
  reportVersion: "0.2.0";
  createdAt: string;
  dataset: {
    schemaVersion: string;
    sha256: string;
    sourceRows: number;
    evaluatedCases: number;
    exclusions: AttributionDataset["exclusions"];
    source: AttributionDataset["source"];
    dataPolicy: AttributionDataset["dataPolicy"];
  };
  toolchain: {
    requestedModels: string[];
    resolvedModels: string[];
    rubricVersions: string[];
    sdkVersion: "0.6.0";
  };
  pricing: {
    inputUsdPerMillionTokens: 0.042;
    outputUsdPerMillionTokens: 0;
    source: "https://docs.typesafe.ai/models";
    verifiedAt: "2026-09-29";
  };
  summary: {
    coverage: number;
    accuracy: number;
    accuracyWilson95: [number, number];
    groupedBootstrapAccuracy95: [number, number];
    groupedBootstrapMacroF195: [number, number];
    endToEndAccuracyLowerBound: number;
    macroF1: number;
    binaryBrier: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedInputCostUsd: number;
    averageLatencyMs: number | null;
    latencyMeasurement: "fresh-provider-calls" | "mixed-cache-not-reported";
    freshProviderCalls: number;
    cacheHits: number;
    unknownCacheStatus: number;
    sourceMacroF1Mean: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
  };
  confusionMatrix: MetricSet["confusionMatrix"];
  byClass: MetricSet["byClass"];
  bySource: Record<string, MetricSet & { sourceRows: number; coverage: number }>;
  selectivePerformance: Array<{ confidenceThreshold: number; cases: number; coverage: number; accuracy: number | null }>;
  results: AttributionCaseResult[];
}

const JEV_INPUT_USD_PER_MILLION_TOKENS = 0.042;

export function assertAttributionDataset(value: unknown): asserts value is AttributionDataset {
  if (typeof value !== "object" || value === null) throw new Error("Attribution dataset must be an object");
  const candidate = value as Partial<AttributionDataset>;
  const artifact = candidate.source?.artifact;
  const specification =
    typeof artifact === "string" && artifact in ATTRIBUTIONBENCH_ARTIFACTS
      ? ATTRIBUTIONBENCH_ARTIFACTS[artifact as keyof typeof ATTRIBUTIONBENCH_ARTIFACTS]
      : null;
  if (
    candidate.schemaVersion !== "0.1.0" ||
    !Number.isInteger(candidate.sourceRows) ||
    (candidate.sourceRows ?? 0) < 1 ||
    typeof candidate.dataPolicy !== "object" ||
    candidate.dataPolicy === null ||
    candidate.dataPolicy.containsPrivateOrConfidentialData !== false ||
    candidate.dataPolicy.mayContainPublicPersonalData !== true ||
    candidate.dataPolicy.mayContainUntrustedWebText !== true ||
    typeof candidate.source !== "object" ||
    candidate.source === null ||
    candidate.source.kind !== "public-benchmark" ||
    specification === null ||
    candidate.source.name !== specification.name ||
    candidate.source.split !== specification.split ||
    candidate.source.sourceSha256 !== specification.sha256 ||
    candidate.source.sourceRevision !== ATTRIBUTIONBENCH_DATA_REVISION ||
    candidate.source.codeRevision !== ATTRIBUTIONBENCH_CODE_REVISION ||
    candidate.sourceRows !== specification.rows ||
    !Array.isArray(candidate.exclusions) ||
    !Array.isArray(candidate.cases) ||
    candidate.cases.length === 0 ||
    candidate.cases.length + candidate.exclusions.length !== candidate.sourceRows
  ) {
    throw new Error("Attribution evaluation requires a provenance-complete public dataset");
  }
  const ids = new Set<string>();
  const sourceLines = new Set<number>();
  for (const testCase of candidate.cases) {
    if (
      typeof testCase.id !== "string" ||
      typeof testCase.groupId !== "string" ||
      !/^[a-f0-9]{64}$/u.test(testCase.groupId) ||
      !Number.isInteger(testCase.sourceLine) ||
      testCase.sourceLine < 1 ||
      typeof testCase.question !== "string" ||
      typeof testCase.claim !== "string" ||
      testCase.claim.length === 0 ||
      !Array.isArray(testCase.references) ||
      testCase.references.length === 0 ||
      testCase.references.some((reference) => typeof reference !== "string" || reference.length === 0) ||
      !ATTRIBUTION_LABELS.includes(testCase.expectedLabel) ||
      typeof testCase.sourceDataset !== "string" ||
      testCase.sourceDataset.length === 0
    ) {
      throw new Error("Every attribution case needs valid source fields, references, and label");
    }
    if (ids.has(testCase.id)) throw new Error(`Duplicate attribution case id ${testCase.id}`);
    if (sourceLines.has(testCase.sourceLine)) {
      throw new Error(`Duplicate attribution source line ${testCase.sourceLine}`);
    }
    if (testCase.sourceLine > candidate.sourceRows) {
      throw new Error(`Attribution source line ${testCase.sourceLine} is out of range`);
    }
    if (testCase.groupId !== sha256(`${testCase.sourceDataset}\0${testCase.question}`)) {
      throw new Error(`Attribution case ${testCase.id} has an invalid group id`);
    }
    ids.add(testCase.id);
    sourceLines.add(testCase.sourceLine);
  }
  for (const exclusion of candidate.exclusions) {
    if (ids.has(exclusion.id)) throw new Error(`Attribution id ${exclusion.id} is both included and excluded`);
    ids.add(exclusion.id);
    if (
      typeof exclusion.groupId !== "string" ||
      !/^[a-f0-9]{64}$/u.test(exclusion.groupId) ||
      !Number.isInteger(exclusion.sourceLine) ||
      exclusion.sourceLine < 1 ||
      !ATTRIBUTION_LABELS.includes(exclusion.expectedLabel) ||
      typeof exclusion.sourceDataset !== "string" ||
      exclusion.sourceDataset.length === 0 ||
      !Number.isInteger(exclusion.contextCharacters) ||
      exclusion.contextCharacters < 0 ||
      (exclusion.reason !== "adapter-context-character-cap" &&
        exclusion.reason !== "empty-references")
    ) {
      throw new Error("Every attribution exclusion needs a group id and source line");
    }
    if (sourceLines.has(exclusion.sourceLine)) {
      throw new Error(`Duplicate attribution source line ${exclusion.sourceLine}`);
    }
    if (exclusion.sourceLine > candidate.sourceRows) {
      throw new Error(`Attribution source line ${exclusion.sourceLine} is out of range`);
    }
    sourceLines.add(exclusion.sourceLine);
  }
  const allRows = [...candidate.cases, ...candidate.exclusions];
  for (const [sourceDataset, [expectedPositive, expectedNegative]] of Object.entries(
    specification.sourceLabelCounts,
  )) {
    const positive = allRows.filter(
      (row) => row.sourceDataset === sourceDataset && row.expectedLabel === "attributable",
    ).length;
    const negative = allRows.filter(
      (row) => row.sourceDataset === sourceDataset && row.expectedLabel === "not_attributable",
    ).length;
    if (positive !== expectedPositive || negative !== expectedNegative) {
      throw new Error(`Attribution source/label counts do not match ${artifact}`);
    }
  }
  if (sourceLines.size !== candidate.sourceRows) {
    throw new Error("Attribution source-line coverage is incomplete");
  }
}

export function assertAttributionDatasetApproval(
  dataset: AttributionDataset,
  approval: {
    allowPublicBenchmark: boolean;
    allowPublicPersonalData: boolean;
    allowUntrustedWebText: boolean;
  },
): void {
  if (!approval.allowPublicBenchmark) {
    throw new Error("Approve the public benchmark with --allow-public-benchmark true");
  }
  if (dataset.dataPolicy.mayContainPublicPersonalData && !approval.allowPublicPersonalData) {
    throw new Error("Approve public personal data with --allow-public-personal-data true");
  }
  if (dataset.dataPolicy.mayContainUntrustedWebText && !approval.allowUntrustedWebText) {
    throw new Error("Approve untrusted web text with --allow-untrusted-web-text true");
  }
}

function blankConfusion(): Record<AttributionLabel, Record<AttributionLabel, number>> {
  return Object.fromEntries(
    ATTRIBUTION_LABELS.map((expected) => [
      expected,
      Object.fromEntries(ATTRIBUTION_LABELS.map((predicted) => [predicted, 0])),
    ]),
  ) as Record<AttributionLabel, Record<AttributionLabel, number>>;
}

function metrics(rows: AttributionCaseResult[]): MetricSet {
  const confusionMatrix = blankConfusion();
  for (const row of rows) confusionMatrix[row.expectedLabel][row.predictedLabel] += 1;
  const byClass = Object.fromEntries(
    ATTRIBUTION_LABELS.map((label) => {
      const truePositive = confusionMatrix[label][label];
      const falsePositive = ATTRIBUTION_LABELS
        .filter((expected) => expected !== label)
        .reduce((sum, expected) => sum + confusionMatrix[expected][label], 0);
      const falseNegative = ATTRIBUTION_LABELS
        .filter((predicted) => predicted !== label)
        .reduce((sum, predicted) => sum + confusionMatrix[label][predicted], 0);
      const support = ATTRIBUTION_LABELS.reduce(
        (sum, predicted) => sum + confusionMatrix[label][predicted],
        0,
      );
      const precision = truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
      const recall = support === 0 ? 0 : truePositive / support;
      const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
      return [label, { precision, recall, f1, support }];
    }),
  ) as Record<AttributionLabel, ClassMetrics>;
  return {
    cases: rows.length,
    accuracy: rows.length === 0 ? 0 : rows.filter((row) => row.correct).length / rows.length,
    macroF1: ATTRIBUTION_LABELS.reduce((sum, label) => sum + byClass[label].f1, 0) / 2,
    confusionMatrix,
    byClass,
  };
}

function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function groupedBootstrap95(
  rows: AttributionCaseResult[],
  repetitions = 2_000,
): { accuracy: [number, number]; macroF1: [number, number] } {
  const groups = [...new Set(rows.map((row) => row.groupId))].sort();
  const grouped = new Map(groups.map((group) => [group, rows.filter((row) => row.groupId === group)]));
  let state = 0x41_54_54_52;
  const random = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const accuracies: number[] = [];
  const macroF1s: number[] = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sample: AttributionCaseResult[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[Math.floor(random() * groups.length)]!;
      sample.push(...grouped.get(group)!);
    }
    const sampleMetrics = metrics(sample);
    accuracies.push(sampleMetrics.accuracy);
    macroF1s.push(sampleMetrics.macroF1);
  }
  return {
    accuracy: [quantile(accuracies, 0.025), quantile(accuracies, 0.975)],
    macroF1: [quantile(macroF1s, 0.025), quantile(macroF1s, 0.975)],
  };
}

function wilson95(successes: number, total: number): [number, number] {
  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total));
  return [center - margin, center + margin];
}

function inputFor(testCase: AttributionCase): AttributionInput {
  return {
    id: testCase.id,
    claim: testCase.claim,
    references: testCase.references,
    rubricVersion: "attributionbench-binary-v1",
  };
}

export async function evaluateAttributionChecker(
  checker: AttributionChecker,
  dataset: AttributionDataset,
  nowMs: () => number = () => performance.now(),
  latencyMeasurement: "fresh-provider-calls" | "mixed-cache-not-reported" =
    "fresh-provider-calls",
): Promise<AttributionEvaluationReport> {
  assertAttributionDataset(dataset);
  const results: AttributionCaseResult[] = [];
  for (const testCase of dataset.cases) {
    const startedAt = nowMs();
    const assessment = await checker.check(inputFor(testCase));
    const observedLatencyMs = Math.max(0, nowMs() - startedAt);
    results.push({
      id: testCase.id,
      groupId: testCase.groupId,
      sourceLine: testCase.sourceLine,
      sourceDataset: testCase.sourceDataset,
      expectedLabel: testCase.expectedLabel,
      predictedLabel: assessment.label,
      correct: assessment.label === testCase.expectedLabel,
      probabilities: assessment.probabilities,
      confidence: assessment.confidence,
      inputTokens: assessment.inputTokens,
      outputTokens: assessment.outputTokens,
      latencyMs: latencyMeasurement === "fresh-provider-calls" ? observedLatencyMs : null,
      requestedModel: assessment.requestedModel,
      resolvedModel: assessment.resolvedModel,
      rubricVersion: assessment.rubricVersion,
      assessmentRunAt: assessment.runAt,
      cacheStatus: assessment.cacheStatus ?? "unknown",
      ...(assessment.providerRequestId ? { providerRequestId: assessment.providerRequestId } : {}),
    });
  }

  const aggregate = metrics(results);
  const sourceNames = [
    ...new Set([
      ...dataset.cases.map((testCase) => testCase.sourceDataset),
      ...dataset.exclusions.map((exclusion) => exclusion.sourceDataset),
    ]),
  ].sort();
  const bySource = Object.fromEntries(
    sourceNames.map((sourceName) => {
      const sourceResults = results.filter((result) => result.sourceDataset === sourceName);
      const sourceRows =
        sourceResults.length +
        dataset.exclusions.filter((exclusion) => exclusion.sourceDataset === sourceName).length;
      return [
        sourceName,
        {
          ...metrics(sourceResults),
          sourceRows,
          coverage: sourceResults.length / sourceRows,
        },
      ];
    }),
  );
  const totalInputTokens = results.reduce((sum, result) => sum + result.inputTokens, 0);
  const totalOutputTokens = results.reduce((sum, result) => sum + result.outputTokens, 0);
  const correct = results.filter((result) => result.correct).length;
  const binaryBrier =
    results.reduce(
      (sum, result) =>
        sum +
        (result.probabilities.attributable -
          (result.expectedLabel === "attributable" ? 1 : 0)) ** 2,
      0,
    ) / results.length;
  const groupedBootstrap = groupedBootstrap95(results);
  const sourceMacroF1Mean =
    Object.values(bySource).reduce((sum, source) => sum + source.macroF1, 0) /
    Object.keys(bySource).length;
  const falsePositives = aggregate.confusionMatrix.not_attributable.attributable;
  const falseNegatives = aggregate.confusionMatrix.attributable.not_attributable;
  const negativeSupport = aggregate.byClass.not_attributable.support;
  const positiveSupport = aggregate.byClass.attributable.support;
  const selectivePerformance = [0, 0.5, 0.7, 0.8, 0.9, 0.95].map((confidenceThreshold) => {
    const selected = results.filter((result) => result.confidence >= confidenceThreshold);
    return {
      confidenceThreshold,
      cases: selected.length,
      coverage: selected.length / results.length,
      accuracy:
        selected.length === 0
          ? null
          : selected.filter((result) => result.correct).length / selected.length,
    };
  });

  return {
    reportVersion: "0.2.0",
    createdAt: new Date().toISOString(),
    dataset: {
      schemaVersion: dataset.schemaVersion,
      sha256: sha256(JSON.stringify(dataset)),
      sourceRows: dataset.sourceRows,
      evaluatedCases: results.length,
      exclusions: dataset.exclusions,
      source: dataset.source,
      dataPolicy: dataset.dataPolicy,
    },
    toolchain: {
      requestedModels: [...new Set(results.map((result) => result.requestedModel))].sort(),
      resolvedModels: [...new Set(results.map((result) => result.resolvedModel))].sort(),
      rubricVersions: [...new Set(results.map((result) => result.rubricVersion))].sort(),
      sdkVersion: "0.6.0",
    },
    pricing: {
      inputUsdPerMillionTokens: JEV_INPUT_USD_PER_MILLION_TOKENS,
      outputUsdPerMillionTokens: 0,
      source: "https://docs.typesafe.ai/models",
      verifiedAt: "2026-09-29",
    },
    summary: {
      coverage: results.length / dataset.sourceRows,
      accuracy: aggregate.accuracy,
      accuracyWilson95: wilson95(correct, results.length),
      groupedBootstrapAccuracy95: groupedBootstrap.accuracy,
      groupedBootstrapMacroF195: groupedBootstrap.macroF1,
      endToEndAccuracyLowerBound: correct / dataset.sourceRows,
      macroF1: aggregate.macroF1,
      binaryBrier,
      totalInputTokens,
      totalOutputTokens,
      estimatedInputCostUsd: (totalInputTokens * JEV_INPUT_USD_PER_MILLION_TOKENS) / 1_000_000,
      averageLatencyMs:
        latencyMeasurement === "fresh-provider-calls"
          ? results.reduce((sum, result) => sum + (result.latencyMs ?? 0), 0) / results.length
          : null,
      latencyMeasurement,
      freshProviderCalls: results.filter((result) => result.cacheStatus === "miss").length,
      cacheHits: results.filter((result) => result.cacheStatus === "hit").length,
      unknownCacheStatus: results.filter((result) => result.cacheStatus === "unknown").length,
      sourceMacroF1Mean,
      falsePositiveRate: negativeSupport === 0 ? 0 : falsePositives / negativeSupport,
      falseNegativeRate: positiveSupport === 0 ? 0 : falseNegatives / positiveSupport,
    },
    confusionMatrix: aggregate.confusionMatrix,
    byClass: aggregate.byClass,
    bySource,
    selectivePerformance,
    results,
  };
}
