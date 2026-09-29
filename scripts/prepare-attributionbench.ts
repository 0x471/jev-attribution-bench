import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { sha256 } from "../src/artifacts.js";
import {
  ATTRIBUTIONBENCH_ARTIFACTS,
  type AttributionBenchArtifact,
  prepareAttributionBenchDataset,
} from "../src/attributionbench.js";

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
const allowed = new Set(["--source", "--out", "--artifact", "--max-context-characters"]);
const unknown = [...parsed.keys()].filter((name) => !allowed.has(name));
if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
const sourcePath = required(parsed, "--source");
const outputPath = required(parsed, "--out");
const artifact = parsed.get("--artifact") ?? "sampled500";
if (!(artifact in ATTRIBUTIONBENCH_ARTIFACTS)) {
  throw new Error(`--artifact must be one of ${Object.keys(ATTRIBUTIONBENCH_ARTIFACTS).join(", ")}`);
}
const specification = ATTRIBUTIONBENCH_ARTIFACTS[artifact as AttributionBenchArtifact];
const sourceText = await readFile(sourcePath, "utf8");
const sourceSha256 = sha256(sourceText);
if (sourceSha256 !== specification.sha256) {
  throw new Error(
    `AttributionBench ${artifact} hash mismatch: expected ${specification.sha256}, received ${sourceSha256}`,
  );
}
const dataset = prepareAttributionBenchDataset(
  sourceText,
  sourceSha256,
  positiveInteger(
    parsed.get("--max-context-characters") ?? "32000",
    "--max-context-characters",
  ),
  artifact as AttributionBenchArtifact,
);
await atomicJson(outputPath, dataset);
process.stdout.write(
  `Prepared ${dataset.cases.length}/${dataset.sourceRows} AttributionBench cases with ${dataset.exclusions.length} declared exclusions at ${outputPath}.\n`,
);
