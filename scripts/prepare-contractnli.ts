import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { sha256 } from "../src/artifacts.js";
import {
  CONTRACTNLI_DEV_SHA256,
  prepareContractNliDataset,
} from "../src/contractnli.js";

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

const parsed = options(process.argv.slice(2));
const allowed = new Set([
  "--source",
  "--out",
  "--mode",
  "--per-label",
  "--negative-passages",
  "--seed",
]);
const unknown = [...parsed.keys()].filter((name) => !allowed.has(name));
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);

const sourcePath = required(parsed, "--source");
const outputPath = required(parsed, "--out");
const mode = parsed.get("--mode") ?? "citation";
if (mode !== "citation" && mode !== "document") {
  throw new Error("--mode must be citation or document");
}
const sourceText = await readFile(sourcePath, "utf8");
const sourceSha256 = sha256(sourceText);
if (sourceSha256 !== CONTRACTNLI_DEV_SHA256) {
  throw new Error(
    `ContractNLI dev.json hash mismatch: expected ${CONTRACTNLI_DEV_SHA256}, received ${sourceSha256}`,
  );
}
const dataset = prepareContractNliDataset(JSON.parse(sourceText), {
  mode,
  perLabel:
    parsed.get("--per-label") === "all"
      ? "all"
      : positiveInteger(parsed.get("--per-label") ?? "30", "--per-label"),
  negativePassages: positiveInteger(
    parsed.get("--negative-passages") ?? "3",
    "--negative-passages",
  ),
  seed: parsed.get("--seed") ?? "claim-ledger-contractnli-dev-v1",
  sourceSha256,
});
await atomicJson(outputPath, dataset);

const counts = Object.fromEntries(
  (["supports", "contradicts", "says_nothing"] as const).map((relation) => [
    relation,
    dataset.cases.filter((testCase) => testCase.expectedRelation === relation).length,
  ]),
);
process.stdout.write(
  `Prepared ${dataset.cases.length} ContractNLI ${mode} dev cases (${JSON.stringify(counts)}) at ${outputPath}.\n`,
);
