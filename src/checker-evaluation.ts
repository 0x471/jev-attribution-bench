import { performance } from "node:perf_hooks";

import { sha256 } from "./artifacts.js";
import type {
  CheckerAssessment,
  EvidenceRelationChecker,
  RelationInput,
} from "./evidence-review.js";

export const EVALUATION_RELATIONS = ["supports", "contradicts", "says_nothing"] as const;
export type EvaluationRelation = (typeof EVALUATION_RELATIONS)[number];

export interface EvidenceRelationCase {
  id: string;
  claim: string;
  context: string;
  expectedRelation: EvaluationRelation;
  phenomenon: string;
}

export type EvidenceRelationDatasetSource =
  | {
      kind: "synthetic";
      name: string;
    }
  | {
      kind: "public-benchmark";
      name: string;
      split: string;
      license: string;
      sourceUrl: string;
      sourceRevision: string;
      sourceSha256: string;
      preparation: string;
    };

export interface EvidenceRelationDataset {
  schemaVersion: "0.3.0";
  dataPolicy: {
    containsPrivateOrConfidentialData: false;
    mayContainPublicPersonalData: boolean;
  };
  source: EvidenceRelationDatasetSource;
  cases: EvidenceRelationCase[];
}

export interface EvidenceRelationCaseResult {
  id: string;
  phenomenon: string;
  expectedRelation: EvaluationRelation;
  predictedRelation: EvaluationRelation;
  correct: boolean;
  probabilities: CheckerAssessment["probabilities"];
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  requestedModel: string;
  resolvedModel: string;
  rubricVersion: string;
  assessmentRunAt: string;
  providerRequestId?: string;
}

interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface EvidenceRelationEvaluationReport {
  reportVersion: "0.3.0";
  createdAt: string;
  dataset: {
    schemaVersion: string;
    sha256: string;
    cases: number;
    source: EvidenceRelationDatasetSource;
    dataPolicy: EvidenceRelationDataset["dataPolicy"];
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
    verifiedAt: "2026-09-24";
  };
  summary: {
    accuracy: number;
    macroF1: number;
    multiclassBrier: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedInputCostUsd: number;
    averageLatencyMs: number | null;
    latencyMeasurement: "fresh-provider-calls" | "mixed-cache-not-reported";
  };
  confusionMatrix: Record<EvaluationRelation, Record<EvaluationRelation, number>>;
  byClass: Record<EvaluationRelation, ClassMetrics>;
  results: EvidenceRelationCaseResult[];
}

const JEV_INPUT_USD_PER_MILLION_TOKENS = 0.042;

function isRelation(value: unknown): value is EvaluationRelation {
  return typeof value === "string" && (EVALUATION_RELATIONS as readonly string[]).includes(value);
}

export function assertEvidenceRelationDataset(value: unknown): asserts value is EvidenceRelationDataset {
  if (typeof value !== "object" || value === null) throw new Error("Evaluation dataset must be an object");
  const candidate = value as Partial<EvidenceRelationDataset>;
  if (
    candidate.schemaVersion !== "0.3.0" ||
    typeof candidate.dataPolicy !== "object" ||
    candidate.dataPolicy === null ||
    candidate.dataPolicy.containsPrivateOrConfidentialData !== false ||
    typeof candidate.dataPolicy.mayContainPublicPersonalData !== "boolean" ||
    typeof candidate.source !== "object" ||
    candidate.source === null ||
    !Array.isArray(candidate.cases) ||
    candidate.cases.length === 0
  ) {
    throw new Error(
      "Live evaluation requires a non-empty v0.3.0 dataset with provenance and an explicit data policy",
    );
  }
  if (
    candidate.source.kind !== "synthetic" &&
    candidate.source.kind !== "public-benchmark"
  ) {
    throw new Error("Evaluation dataset source must be synthetic or public-benchmark");
  }
  if (typeof candidate.source.name !== "string" || candidate.source.name.length === 0) {
    throw new Error("Evaluation dataset source needs a name");
  }
  if (
    candidate.source.kind === "public-benchmark" &&
    (typeof candidate.source.split !== "string" ||
      typeof candidate.source.license !== "string" ||
      typeof candidate.source.sourceUrl !== "string" ||
      typeof candidate.source.sourceRevision !== "string" ||
      !/^[a-f0-9]{64}$/u.test(candidate.source.sourceSha256) ||
      typeof candidate.source.preparation !== "string")
  ) {
    throw new Error("Public benchmark datasets need complete source, license, split, and preparation provenance");
  }
  const ids = new Set<string>();
  for (const testCase of candidate.cases) {
    if (
      typeof testCase?.id !== "string" ||
      testCase.id.length === 0 ||
      typeof testCase.claim !== "string" ||
      testCase.claim.length === 0 ||
      typeof testCase.context !== "string" ||
      testCase.context.length === 0 ||
      typeof testCase.phenomenon !== "string" ||
      testCase.phenomenon.length === 0 ||
      !isRelation(testCase.expectedRelation)
    ) {
      throw new Error("Every evaluation case needs an id, claim, context, phenomenon, and valid label");
    }
    if (ids.has(testCase.id)) throw new Error(`Duplicate evaluation case id ${testCase.id}`);
    ids.add(testCase.id);
  }
}

export function assertEvidenceRelationDatasetApproval(
  dataset: EvidenceRelationDataset,
  approval: { allowPublicBenchmark: boolean; allowPublicPersonalData: boolean },
): void {
  if (dataset.source.kind === "public-benchmark" && !approval.allowPublicBenchmark) {
    throw new Error(
      "Sending a public benchmark to Jev must be explicitly approved with --allow-public-benchmark true",
    );
  }
  if (
    dataset.dataPolicy.mayContainPublicPersonalData &&
    !approval.allowPublicPersonalData
  ) {
    throw new Error(
      "This public benchmark may contain public personal data; explicitly approve with --allow-public-personal-data true",
    );
  }
}

function blankConfusion(): Record<EvaluationRelation, Record<EvaluationRelation, number>> {
  return Object.fromEntries(
    EVALUATION_RELATIONS.map((expected) => [
      expected,
      Object.fromEntries(EVALUATION_RELATIONS.map((predicted) => [predicted, 0])),
    ]),
  ) as Record<EvaluationRelation, Record<EvaluationRelation, number>>;
}

function classMetrics(
  confusion: Record<EvaluationRelation, Record<EvaluationRelation, number>>,
  relation: EvaluationRelation,
): ClassMetrics {
  const truePositive = confusion[relation][relation];
  const falsePositive = EVALUATION_RELATIONS
    .filter((expected) => expected !== relation)
    .reduce((sum, expected) => sum + confusion[expected][relation], 0);
  const falseNegative = EVALUATION_RELATIONS
    .filter((predicted) => predicted !== relation)
    .reduce((sum, predicted) => sum + confusion[relation][predicted], 0);
  const support = EVALUATION_RELATIONS.reduce(
    (sum, predicted) => sum + confusion[relation][predicted],
    0,
  );
  const precision = truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
  const recall = support === 0 ? 0 : truePositive / support;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, support };
}

function relationInput(testCase: EvidenceRelationCase): RelationInput {
  const codePointLength = Array.from(testCase.context).length;
  return {
    relationId: testCase.id,
    sourceArtifactId: `evaluation:${testCase.id}`,
    sourceSha256: sha256(testCase.context),
    evidenceAnchor: {
      start: 0,
      end: codePointLength,
      textSha256: sha256(testCase.context),
    },
    claim: { id: `claim:${testCase.id}`, text: testCase.claim },
    context: testCase.context,
    rubricVersion: "evidence-relation-v1",
  };
}

export async function evaluateEvidenceRelationChecker(
  checker: EvidenceRelationChecker,
  dataset: EvidenceRelationDataset,
  nowMs: () => number = () => performance.now(),
  latencyMeasurement: "fresh-provider-calls" | "mixed-cache-not-reported" =
    "fresh-provider-calls",
): Promise<EvidenceRelationEvaluationReport> {
  assertEvidenceRelationDataset(dataset);
  const results: EvidenceRelationCaseResult[] = [];
  for (const testCase of dataset.cases) {
    const startedAt = nowMs();
    const assessment = await checker.check(relationInput(testCase));
    const latencyMs = Math.max(0, nowMs() - startedAt);
    results.push({
      id: testCase.id,
      phenomenon: testCase.phenomenon,
      expectedRelation: testCase.expectedRelation,
      predictedRelation: assessment.relation,
      correct: assessment.relation === testCase.expectedRelation,
      probabilities: assessment.probabilities,
      confidence: assessment.confidence,
      inputTokens: assessment.inputTokens,
      outputTokens: assessment.outputTokens,
      latencyMs: latencyMeasurement === "fresh-provider-calls" ? latencyMs : null,
      requestedModel: assessment.requestedModel,
      resolvedModel: assessment.resolvedModel,
      rubricVersion: assessment.rubricVersion,
      assessmentRunAt: assessment.runAt,
      ...(assessment.providerRequestId
        ? { providerRequestId: assessment.providerRequestId }
        : {}),
    });
  }

  const confusionMatrix = blankConfusion();
  for (const result of results) {
    confusionMatrix[result.expectedRelation][result.predictedRelation] += 1;
  }
  const byClass = Object.fromEntries(
    EVALUATION_RELATIONS.map((relation) => [relation, classMetrics(confusionMatrix, relation)]),
  ) as Record<EvaluationRelation, ClassMetrics>;
  const totalInputTokens = results.reduce((sum, result) => sum + result.inputTokens, 0);
  const totalOutputTokens = results.reduce((sum, result) => sum + result.outputTokens, 0);
  const multiclassBrier =
    results.reduce(
      (sum, result) =>
        sum +
        EVALUATION_RELATIONS.reduce(
          (caseSum, relation) =>
            caseSum +
            (result.probabilities[relation] - (result.expectedRelation === relation ? 1 : 0)) ** 2,
          0,
        ),
      0,
    ) / results.length;

  return {
    reportVersion: "0.3.0",
    createdAt: new Date().toISOString(),
    dataset: {
      schemaVersion: dataset.schemaVersion,
      sha256: sha256(JSON.stringify(dataset)),
      cases: results.length,
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
      verifiedAt: "2026-09-24",
    },
    summary: {
      accuracy: results.filter((result) => result.correct).length / results.length,
      macroF1:
        EVALUATION_RELATIONS.reduce((sum, relation) => sum + byClass[relation].f1, 0) /
        EVALUATION_RELATIONS.length,
      multiclassBrier,
      totalInputTokens,
      totalOutputTokens,
      estimatedInputCostUsd: (totalInputTokens * JEV_INPUT_USD_PER_MILLION_TOKENS) / 1_000_000,
      averageLatencyMs:
        latencyMeasurement === "fresh-provider-calls"
          ? results.reduce((sum, result) => sum + (result.latencyMs ?? 0), 0) / results.length
          : null,
      latencyMeasurement,
    },
    confusionMatrix,
    byClass,
    results,
  };
}
