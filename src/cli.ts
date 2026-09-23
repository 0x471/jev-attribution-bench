#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { ManifestExporter } from "./manifest-exporter.js";
import type {
  ReviewDecision,
  ReviewManifest,
  ReviewSubjectType,
} from "./manifest.js";
import { buildReviewProject, verifyProjectArtifacts } from "./project-builder.js";
import { certificationStatus, ReviewLedger } from "./review-ledger.js";
import { exportStaticSite } from "./static-site.js";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultIo: CliIo = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

function flags(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${args.slice(index).join(" ")}`);
    }
    if (parsed.has(flag)) throw new Error(`Duplicate option ${flag}`);
    parsed.set(flag, value);
  }
  return parsed;
}

function required(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) throw new Error(`Missing required option ${name}`);
  return value;
}

function allowOnly(options: Map<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = [...options.keys()].filter((name) => !allowedSet.has(name));
  if (unknown.length > 0) throw new Error(`Unknown option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
}

function clockFromOption(options: Map<string, string>): (() => Date) | undefined {
  const timestamp = options.get("--timestamp");
  if (timestamp === undefined) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("--timestamp must be an ISO 8601 timestamp");
  return () => new Date(date);
}

async function loadManifest(path: string): Promise<ReviewManifest> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  const exporter = await ManifestExporter.create();
  const verification = exporter.verify(value);
  if (!verification.valid) {
    throw new Error(`Invalid manifest:\n${verification.errors.join("\n")}`);
  }
  return value as ReviewManifest;
}

async function atomicJson(path: string, value: unknown, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await rename(temporary, path);
}

function safeBuildError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : "Unknown build error";
  if (message.startsWith("Invalid project file:")) {
    return { code: "invalid-project", message: "The project file failed validation." };
  }
  if (message.includes("TYPESAFE_API_KEY")) {
    return { code: "configuration-error", message: "The local Jev API key is not configured." };
  }
  if (message.includes("ENOENT")) {
    return { code: "missing-input", message: "A required local input file was not found." };
  }
  if (message.includes("fixture assessment")) {
    return { code: "fixture-error", message: "A required fixture assessment was not found." };
  }
  return { code: "assessment-failed", message: "The automated assessment failed." };
}

async function writeFailureReceipt(path: string, error: unknown): Promise<void> {
  await atomicJson(`${path}.failure.json`, {
    receiptVersion: "0.1.0",
    command: "build",
    status: "failed",
    error: safeBuildError(error),
    at: new Date().toISOString(),
  });
}

const subjectTypes = new Set<ReviewSubjectType>([
  "claim",
  "evidence-relation",
  "argument-edge",
  "document",
]);
const decisions = new Set<ReviewDecision>(["approve", "reject", "waive"]);

export async function runCli(args: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = args;
  try {
    if (command === "build") {
      const options = flags(rest);
      allowOnly(options, ["--project", "--checker", "--assessments", "--out", "--cache", "--model", "--timestamp"]);
      const output = required(options, "--out");
      try {
        const checker = required(options, "--checker");
        const projectPath = required(options, "--project");
        const now = clockFromOption(options);
        const manifest = await buildReviewProject({
          projectPath,
          ...(now ? { now } : {}),
          checker:
            checker === "fixture"
              ? { type: "fixture", assessmentsPath: required(options, "--assessments") }
              : checker === "jev"
                ? {
                    type: "jev",
                    cacheDirectory: options.get("--cache") ?? ".cache/assessments",
                    ...(options.get("--model") ? { model: options.get("--model")! } : {}),
                  }
                : (() => {
                    throw new Error(`Unknown checker ${checker}`);
                  })(),
        });
        await (await ManifestExporter.create()).export(manifest, output);
        io.stdout(`Built unapproved review manifest: ${output}`);
        return 0;
      } catch (error) {
        await writeFailureReceipt(output, error);
        io.stderr(`${safeBuildError(error).code}: ${safeBuildError(error).message}`);
        return 1;
      }
    }

    if (command === "review") {
      const options = flags(rest);
      allowOnly(options, ["--manifest", "--subject-type", "--subject", "--decision", "--reviewer", "--reason"]);
      const manifestPath = required(options, "--manifest");
      const subjectType = required(options, "--subject-type") as ReviewSubjectType;
      const decision = required(options, "--decision") as ReviewDecision;
      if (!subjectTypes.has(subjectType)) throw new Error(`Unknown subject type ${subjectType}`);
      if (!decisions.has(decision)) throw new Error(`Unknown decision ${decision}`);
      const manifest = await loadManifest(manifestPath);
      const updated = new ReviewLedger().record(manifest, {
        subjectType,
        subjectId: required(options, "--subject"),
        decision,
        reason: options.get("--reason") ?? null,
        reviewer: {
          displayName: required(options, "--reviewer"),
          identityAssurance: "self-asserted",
        },
      });
      await (await ManifestExporter.create()).export(updated, manifestPath);
      io.stdout(`Recorded ${decision} for ${subjectType}.`);
      return 0;
    }

    if (command === "certify") {
      const options = flags(rest);
      allowOnly(options, ["--manifest", "--reviewer"]);
      const manifestPath = required(options, "--manifest");
      const manifest = await loadManifest(manifestPath);
      const updated = new ReviewLedger().certify(manifest, {
        displayName: required(options, "--reviewer"),
        identityAssurance: "self-asserted",
      });
      await (await ManifestExporter.create()).export(updated, manifestPath);
      io.stdout(`Certified exact artifact versions in ${manifestPath}`);
      return 0;
    }

    if (command === "verify") {
      const options = flags(rest);
      allowOnly(options, ["--manifest", "--project"]);
      const manifest = await loadManifest(required(options, "--manifest"));
      const artifacts = await verifyProjectArtifacts(required(options, "--project"), manifest);
      if (!artifacts.valid) throw new Error(artifacts.errors.join("\n"));
      const certification = certificationStatus(manifest);
      io.stdout(
        certification.valid
          ? "Manifest, artifact hashes, and certification are valid."
          : `Manifest and artifact hashes are valid; certification: ${certification.reason}.`,
      );
      return 0;
    }

    if (command === "export-site") {
      const options = flags(rest);
      allowOnly(options, ["--manifest", "--out"]);
      await exportStaticSite(
        await loadManifest(required(options, "--manifest")),
        required(options, "--out"),
      );
      io.stdout(`Exported static synthetic-fixture viewer to ${required(options, "--out")}`);
      return 0;
    }

    throw new Error(
      "Usage: claim-ledger <build|review|certify|verify|export-site> [--option value]",
    );
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
