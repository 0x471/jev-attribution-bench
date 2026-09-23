import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ReviewManifest } from "../src/manifest.js";
import { ManifestExporter } from "../src/manifest-exporter.js";

const fixturePath = new URL("../fixtures/synthetic/manifest.json", import.meta.url);

async function fixture(): Promise<ReviewManifest> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as ReviewManifest;
}

describe("ManifestExporter seam", () => {
  it("validates internal references and writes canonical schema-valid JSON atomically", async () => {
    const exporter = await ManifestExporter.create();
    const manifest = await fixture();
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-manifest-"));
    const output = join(directory, "manifest.json");

    expect(exporter.verify(manifest)).toEqual({ valid: true, errors: [] });
    await exporter.export(manifest, output);

    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(manifest);
  });

  it("rejects a relation that points to an unknown claim", async () => {
    const exporter = await ManifestExporter.create();
    const manifest = await fixture();
    manifest.evidenceRelations[0]!.claimId = "claim-does-not-exist";

    expect(exporter.verify(manifest)).toEqual({
      valid: false,
      errors: ["evidence relation relation-notice references unknown claim claim-does-not-exist"],
    });
  });

  it("rejects inconsistent fabricated and model assessment shapes", async () => {
    const exporter = await ManifestExporter.create();
    const fabricated = await fixture();
    fabricated.evidenceRelations[0]!.assessment.relation = "fabricated";
    expect(exporter.verify(fabricated).errors.join("\n")).toMatch(/fabricated assessment shape/i);

    const incomplete = await fixture();
    incomplete.evidenceRelations[0]!.assessment.probabilities = null;
    expect(exporter.verify(incomplete).errors.join("\n")).toMatch(/incomplete model assessment/i);
  });
});
