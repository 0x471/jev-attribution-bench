import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { sha256 } from "../src/artifacts.js";
import {
  EVALUATION_RELATIONS,
  type EvaluationRelation,
  type EvidenceRelationEvaluationReport,
} from "../src/checker-evaluation.js";

function options(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || parsed.has(flag)) {
      throw new Error("Expected unique --name value arguments");
    }
    parsed.set(flag, value);
  }
  return parsed;
}

function required(parsed: Map<string, string>, name: string): string {
  const value = parsed.get(name);
  if (!value) throw new Error(`Missing required option ${name}`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

type Result = EvidenceRelationEvaluationReport["results"][number];

function contractId(id: string): string {
  const match = /^contractnli-[^-]+-d(?<document>[0-9]+)-nda-[0-9]+$/u.exec(id);
  if (!match?.groups?.document) throw new Error(`Cannot parse ContractNLI case id ${id}`);
  return match.groups.document;
}

function hypothesisId(id: string): string {
  const match = /-(?<hypothesis>nda-[0-9]+)$/u.exec(id);
  if (!match?.groups?.hypothesis) throw new Error(`Cannot parse ContractNLI hypothesis id ${id}`);
  return match.groups.hypothesis;
}

function accuracy(rows: Result[]): number {
  return rows.filter((row) => row.correct).length / rows.length;
}

function macroF1(rows: Result[]): number {
  return (
    EVALUATION_RELATIONS.reduce((sum, relation) => {
      const truePositive = rows.filter(
        (row) => row.expectedRelation === relation && row.predictedRelation === relation,
      ).length;
      const falsePositive = rows.filter(
        (row) => row.expectedRelation !== relation && row.predictedRelation === relation,
      ).length;
      const falseNegative = rows.filter(
        (row) => row.expectedRelation === relation && row.predictedRelation !== relation,
      ).length;
      const precision =
        truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
      const recall =
        truePositive + falseNegative === 0 ? 0 : truePositive / (truePositive + falseNegative);
      return sum + (precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall));
    }, 0) / EVALUATION_RELATIONS.length
  );
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(values: number[], proportion: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * proportion)]!;
}

function groupedBootstrap(
  rows: Result[],
  repetitions: number,
  seedText: string,
): { accuracy95: [number, number]; macroF195: [number, number] } {
  const grouped = new Map<string, Result[]>();
  for (const row of rows) {
    const id = contractId(row.id);
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  const clusters = [...grouped.values()];
  const random = mulberry32(Number.parseInt(sha256(seedText).slice(0, 8), 16));
  const accuracies: number[] = [];
  const macroF1s: number[] = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sample = Array.from({ length: clusters.length }, () =>
      clusters[Math.floor(random() * clusters.length)]!,
    ).flat();
    accuracies.push(accuracy(sample));
    macroF1s.push(macroF1(sample));
  }
  return {
    accuracy95: [percentile(accuracies, 0.025), percentile(accuracies, 0.975)],
    macroF195: [percentile(macroF1s, 0.025), percentile(macroF1s, 0.975)],
  };
}

const parsed = options(process.argv.slice(2));
const allowed = new Set(["--report", "--out", "--bootstrap-repetitions"]);
const unknown = [...parsed.keys()].filter((name) => !allowed.has(name));
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
const reportPath = required(parsed, "--report");
const outputPath = required(parsed, "--out");
const repetitions = positiveInteger(
  parsed.get("--bootstrap-repetitions") ?? "10000",
  "--bootstrap-repetitions",
);
const report = JSON.parse(await readFile(reportPath, "utf8")) as EvidenceRelationEvaluationReport;
if (report.dataset.source.kind !== "public-benchmark" || !report.dataset.source.name.startsWith("ContractNLI")) {
  throw new Error("Expected a ContractNLI public-benchmark report");
}

const thresholds = [0, 0.5, 0.7, 0.8, 0.9, 0.95].map((threshold) => {
  const retained = report.results.filter((result) => result.confidence >= threshold);
  return {
    threshold,
    cases: retained.length,
    coverage: retained.length / report.results.length,
    accuracy: retained.length === 0 ? null : accuracy(retained),
  };
});
const byHypothesis = [...new Set(report.results.map((result) => hypothesisId(result.id)))]
  .map((id) => {
    const rows = report.results.filter((result) => hypothesisId(result.id) === id);
    return { id, cases: rows.length, accuracy: accuracy(rows), errors: rows.filter((row) => !row.correct).length };
  })
  .sort((left, right) => left.accuracy - right.accuracy || left.id.localeCompare(right.id));
const confidence = {
  correctMean:
    report.results.filter((result) => result.correct).reduce((sum, result) => sum + result.confidence, 0) /
    report.results.filter((result) => result.correct).length,
  incorrectMean:
    report.results.filter((result) => !result.correct).reduce((sum, result) => sum + result.confidence, 0) /
    report.results.filter((result) => !result.correct).length,
  highConfidenceErrors: report.results.filter((result) => !result.correct && result.confidence >= 0.8).length,
};
const summary = {
  analysisVersion: "0.1.0",
  createdAt: new Date().toISOString(),
  reportSha256: sha256(await readFile(reportPath, "utf8")),
  cases: report.results.length,
  contracts: new Set(report.results.map((result) => contractId(result.id))).size,
  metrics: report.summary,
  confidenceIntervals: {
    method: `percentile cluster bootstrap by contract; ${repetitions} deterministic resamples`,
    ...groupedBootstrap(
      report.results,
      repetitions,
      `${report.dataset.source.sourceSha256}:contractnli-cluster-bootstrap-v1`,
    ),
  },
  confusionMatrix: report.confusionMatrix,
  byClass: report.byClass,
  confidence,
  selectiveDiagnostics: thresholds,
  byHypothesis,
};
await atomicJson(outputPath, summary);
process.stdout.write(`Written to ${outputPath}\n`);
