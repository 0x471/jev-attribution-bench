import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import type { ReviewManifest } from "../src/manifest.js";

const fixtureDirectory = new URL("../fixtures/synthetic/", import.meta.url).pathname;

describe("Claim Ledger CLI", () => {
  it("builds, reviews, certifies, verifies, and exports a fixture", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-cli-"));
    const manifestPath = join(directory, "manifest.json");
    const projectPath = join(fixtureDirectory, "project.json");
    const assessmentsPath = join(fixtureDirectory, "assessments.json");
    const output: string[] = [];
    const io = { stdout: (message: string) => output.push(message), stderr: (message: string) => output.push(message) };

    expect(
      await runCli(
        ["build", "--project", projectPath, "--checker", "fixture", "--assessments", assessmentsPath, "--out", manifestPath],
        io,
      ),
    ).toBe(0);

    for (const [type, id] of [
      ["claim", "claim-notice"],
      ["claim", "claim-costs"],
      ["evidence-relation", "relation-notice"],
      ["evidence-relation", "relation-costs"],
      ["argument-edge", "edge-notice-qualifies-costs"],
    ]) {
      expect(
        await runCli(
          ["review", "--manifest", manifestPath, "--subject-type", type!, "--subject", id!, "--decision", "approve", "--reviewer", "Deniz"],
          io,
        ),
      ).toBe(0);
    }
    expect(await runCli(["certify", "--manifest", manifestPath, "--reviewer", "Deniz"], io)).toBe(0);
    expect(await runCli(["verify", "--manifest", manifestPath, "--project", projectPath], io)).toBe(0);

    const site = join(directory, "site");
    expect(await runCli(["export-site", "--manifest", manifestPath, "--out", site], io)).toBe(0);
    await access(join(site, "index.html"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ReviewManifest;
    expect(manifest.reviewActions).toHaveLength(6);
    expect(manifest.certification).not.toBeNull();
  });

  it("writes a safe failure receipt and no partial manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "claim-ledger-cli-failure-"));
    const manifestPath = join(directory, "manifest.json");
    const status = await runCli([
      "build",
      "--project", join(fixtureDirectory, "project.json"),
      "--checker", "fixture",
      "--assessments", join(directory, "missing.json"),
      "--out", manifestPath,
    ], { stdout: () => {}, stderr: () => {} });
    expect(status).toBe(1);
    await expect(access(manifestPath)).rejects.toThrow();
    const receipt = await readFile(`${manifestPath}.failure.json`, "utf8");
    expect(receipt).toContain('"status": "failed"');
    expect(receipt).not.toContain("Northstar");
    expect(receipt).not.toContain("TYPESAFE_API_KEY");
  });
});
