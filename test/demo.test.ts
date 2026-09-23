import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCertifiedDemo } from "../src/demo.js";
import { certificationStatus } from "../src/review-ledger.js";

describe("presentation demo", () => {
  it("builds a deterministic certified fixture and static viewer", async () => {
    const firstOutput = await mkdtemp(join(tmpdir(), "claim-ledger-demo-"));
    const secondOutput = await mkdtemp(join(tmpdir(), "claim-ledger-demo-"));
    const first = await buildCertifiedDemo(firstOutput);
    const second = await buildCertifiedDemo(secondOutput);

    expect(certificationStatus(first)).toEqual({ valid: true });
    expect(first.reviewActions).toHaveLength(6);
    expect(first).toEqual(second);
    expect(await readFile(join(firstOutput, "index.html"), "utf8")).toContain(
      "Review sign-off",
    );
    expect(JSON.parse(await readFile(join(firstOutput, "manifest.json"), "utf8"))).toEqual(first);
  });
});
