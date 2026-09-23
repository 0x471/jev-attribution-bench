import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exportStaticSite } from "../src/static-site.js";
import type { ReviewManifest } from "../src/manifest.js";

async function fixtureManifest(): Promise<ReviewManifest> {
  return JSON.parse(
    await readFile(new URL("../fixtures/synthetic/manifest.json", import.meta.url), "utf8"),
  ) as ReviewManifest;
}

describe("static review site", () => {
  it("exports a credential-free viewer for a public synthetic fixture", async () => {
    const output = await mkdtemp(join(tmpdir(), "claim-ledger-site-"));
    await exportStaticSite(await fixtureManifest(), output);

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
      ),
    ).rejects.toThrow(/synthetic fixtures/i);
    await expect(
      exportStaticSite(
        { ...manifest, publication: { fixture: true, containsSensitiveData: true } },
        output,
      ),
    ).rejects.toThrow(/sensitive/i);
  });
});
