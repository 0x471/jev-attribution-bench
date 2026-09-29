import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  assertEvidenceRelationDataset,
  assertEvidenceRelationDatasetApproval,
  evaluateEvidenceRelationChecker,
  type EvidenceRelationDataset,
} from "../src/checker-evaluation.js";
import {
  CachedEvidenceRelationChecker,
  FileAssessmentCache,
  LimitedEvidenceRelationChecker,
  PINNED_JEV_MODEL,
  createJevCheckerFromEnvironment,
} from "../src/jev-checker.js";

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

async function archiveRecoveredFailure(outputPath: string): Promise<boolean> {
  try {
    await rename(`${outputPath}.failure.json`, `${outputPath}.recovered-failure.json`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function safeErrorMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const candidate = error as Error & {
    status?: unknown;
    requestId?: unknown;
    retryAfterMs?: unknown;
    timeoutMs?: unknown;
  };
  return {
    name: error.name,
    ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    ...(typeof candidate.requestId === "string" ? { requestId: candidate.requestId } : {}),
    ...(typeof candidate.retryAfterMs === "number"
      ? { retryAfterMs: candidate.retryAfterMs }
      : {}),
    ...(typeof candidate.timeoutMs === "number" ? { timeoutMs: candidate.timeoutMs } : {}),
  };
}

const parsed = options(process.argv.slice(2));
const allowed = new Set([
  "--allow-live",
  "--allow-public-benchmark",
  "--allow-public-personal-data",
  "--dataset",
  "--cache",
  "--out",
  "--max-provider-calls",
  "--timeout-ms",
  "--latency-mode",
]);
const unknown = [...parsed.keys()].filter((name) => !allowed.has(name));
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
if (parsed.get("--allow-live") !== "true") {
  throw new Error("A live Jev evaluation must be explicitly approved with --allow-live true");
}

const datasetPath = parsed.get("--dataset") ?? "fixtures/evaluation/evidence-relations-dev.json";
const cacheDirectory = parsed.get("--cache") ?? ".cache/jev-eval";
const outputPath = required(parsed, "--out");
const maxProviderCalls = positiveInteger(required(parsed, "--max-provider-calls"), "--max-provider-calls");
const timeoutMs = positiveInteger(parsed.get("--timeout-ms") ?? "30000", "--timeout-ms");
const latencyMode = parsed.get("--latency-mode") ?? "fresh";
if (latencyMode !== "fresh" && latencyMode !== "mixed-cache") {
  throw new Error("--latency-mode must be fresh or mixed-cache");
}
const dataset: unknown = JSON.parse(await readFile(datasetPath, "utf8"));
assertEvidenceRelationDataset(dataset);
assertEvidenceRelationDatasetApproval(dataset, {
  allowPublicBenchmark: parsed.get("--allow-public-benchmark") === "true",
  allowPublicPersonalData: parsed.get("--allow-public-personal-data") === "true",
});

process.stdout.write(
  `Evaluating ${dataset.cases.length} ${dataset.source.kind} cases from ${dataset.source.name} with at most ${maxProviderCalls} uncached Jev calls; retries are disabled.\n`,
);

try {
  const checker = new CachedEvidenceRelationChecker(
    new LimitedEvidenceRelationChecker(
      createJevCheckerFromEnvironment({
        model: PINNED_JEV_MODEL,
        rubricVersion: "evidence-relation-v1",
        timeoutMs,
        maxRetries: 0,
      }),
      maxProviderCalls,
    ),
    new FileAssessmentCache(cacheDirectory),
    `${PINNED_JEV_MODEL}:evidence-relation-v1:sdk-0.6.0:request-id-v1`,
  );
  const report = await evaluateEvidenceRelationChecker(
    checker,
    dataset as EvidenceRelationDataset,
    undefined,
    latencyMode === "fresh" ? "fresh-provider-calls" : "mixed-cache-not-reported",
  );
  await atomicJson(outputPath, report);
  const recoveredFailure = await archiveRecoveredFailure(outputPath);
  process.stdout.write(
    `Accuracy ${(report.summary.accuracy * 100).toFixed(1)}%; macro-F1 ${(report.summary.macroF1 * 100).toFixed(1)}%; ${report.summary.totalInputTokens} input tokens; estimated $${report.summary.estimatedInputCostUsd.toFixed(6)}.\n`,
  );
  process.stdout.write(`Written to ${outputPath}\n`);
  if (recoveredFailure) {
    process.stdout.write(`Archived the prior failure receipt next to the successful report.\n`);
  }
} catch (error) {
  await atomicJson(`${outputPath}.failure.json`, {
    reportVersion: "0.3.0",
    status: "failed",
    error: "The live Jev evaluation failed; inspect local stderr without sharing credentials or source text.",
    provider: safeErrorMetadata(error),
    at: new Date().toISOString(),
  });
  process.stderr.write(
    `Live Jev evaluation failed: ${error instanceof Error ? error.name : "unknown error"}. See ${outputPath}.failure.json.\n`,
  );
  process.exitCode = 1;
}
