import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exportStaticSite } from "../src/static-site.js";
import type { ReviewManifest } from "../src/manifest.js";
import { ReviewLedger } from "../src/review-ledger.js";

async function fixtureManifest(): Promise<ReviewManifest> {
  return JSON.parse(
    await readFile(new URL("../fixtures/synthetic/manifest.json", import.meta.url), "utf8"),
  ) as ReviewManifest;
}

const fixtureProject = new URL("../fixtures/synthetic/project.json", import.meta.url).pathname;

describe("static review site", () => {
  it("exports a credential-free viewer for a public synthetic fixture", async () => {
    const output = await mkdtemp(join(tmpdir(), "claim-ledger-site-"));
    await exportStaticSite(await fixtureManifest(), output, fixtureProject);

    const html = await readFile(join(output, "index.html"), "utf8");
    const manifest = await readFile(join(output, "manifest.json"), "utf8");
    expect(html).toContain("Synthetic review fixture");
    expect(html).toContain("manifest.json");
    expect(html).not.toContain("TYPESAFE_API_KEY");
    expect(html).not.toContain("typesafe.ai");
    expect(manifest).toContain('"fixture": true');
  });

  it("refuses to publish non-fixture or sensitive manifests", async () => {
    const manifest = await fixtureManifest();
    const output = await mkdtemp(join(tmpdir(), "claim-ledger-site-private-"));
    await expect(
      exportStaticSite(
        { ...manifest, publication: { fixture: false, containsSensitiveData: false } },
        output,
        fixtureProject,
      ),
    ).rejects.toThrow(/synthetic fixtures/i);
    await expect(
      exportStaticSite(
        { ...manifest, publication: { fixture: true, containsSensitiveData: true } },
        output,
        fixtureProject,
      ),
    ).rejects.toThrow(/sensitive/i);
  });

  it("refuses publication when the manifest does not match the project bytes", async () => {
    const manifest = await fixtureManifest();
    manifest.document.sha256 = "f".repeat(64);
    const output = await mkdtemp(join(tmpdir(), "claim-ledger-site-stale-"));
    await expect(exportStaticSite(manifest, output, fixtureProject)).rejects.toThrow(
      /stale or mis-anchored/i,
    );
  });

  it("refuses to display a stale human action as current", async () => {
    const manifest = new ReviewLedger().record(await fixtureManifest(), {
      subjectType: "evidence-relation",
      subjectId: "relation-notice",
      decision: "approve",
      reason: null,
      reviewer: { displayName: "Reviewer", identityAssurance: "self-asserted" },
    });
    manifest.evidenceRelations[0]!.assessment.rubricVersion = "evidence-relation-v2";
    const output = await mkdtemp(join(tmpdir(), "claim-ledger-site-stale-action-"));
    await expect(exportStaticSite(manifest, output, fixtureProject)).rejects.toThrow(
      /stale Review Actions/i,
    );
  });
});
