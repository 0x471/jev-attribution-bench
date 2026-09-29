import { describe, expect, it } from "vitest";

import {
  ATTRIBUTIONBENCH_ARTIFACTS,
  ATTRIBUTIONBENCH_SAMPLE_SHA256,
  type AttributionBenchArtifact,
  prepareAttributionBenchDataset,
} from "../src/attributionbench.js";

function source(
  overrides: Record<number, Record<string, unknown>> = {},
  artifact: AttributionBenchArtifact = "sampled500",
): string {
  const rows = Object.entries(ATTRIBUTIONBENCH_ARTIFACTS[artifact].sourceLabelCounts).flatMap(
    ([sourceDataset, [positiveCount, negativeCount]]) =>
    ["attributable", "not attributable"].flatMap((label) =>
      Array.from(
        { length: label === "attributable" ? positiveCount : negativeCount },
        () => ({ sourceDataset, label }),
      ),
    ),
  );
  return rows.map(({ sourceDataset, label }, index) =>
    JSON.stringify({
      id: `case-${index}`,
      question: `Question ${index}`,
      claim: `Claim ${index}`,
      references: [`Reference ${index}`],
      attribution_label: label,
      src_dataset: sourceDataset,
      ...overrides[index],
    }),
  ).join("\n");
}

describe("AttributionBench preparation", () => {
  it("preserves source order and maps the binary labels", () => {
    const dataset = prepareAttributionBenchDataset(source(), ATTRIBUTIONBENCH_SAMPLE_SHA256, 120_000);

    expect(dataset.cases).toHaveLength(500);
    expect(dataset.cases[0]).toMatchObject({
      id: "case-0",
      expectedLabel: "attributable",
      references: ["Reference 0"],
    });
    expect(dataset.cases[499]).toMatchObject({
      id: "case-499",
      expectedLabel: "not_attributable",
    });
    expect(dataset.dataPolicy).toEqual({
      containsPrivateOrConfidentialData: false,
      mayContainPublicPersonalData: true,
      mayContainUntrustedWebText: true,
    });
  });

  it("rejects duplicate ids and malformed references", () => {
    expect(() =>
      prepareAttributionBenchDataset(
        source({ 1: { id: "case-0" } }),
        ATTRIBUTIONBENCH_SAMPLE_SHA256,
        120_000,
      ),
    ).toThrow(/Duplicate/u);
    expect(() =>
      prepareAttributionBenchDataset(source({ 1: { references: [1] } }), ATTRIBUTIONBENCH_SAMPLE_SHA256, 120_000),
    ).toThrow(/invalid schema/u);
  });

  it("rejects a file that is not the official sample shape", () => {
    expect(() =>
      prepareAttributionBenchDataset(
        source().split("\n").slice(0, 499).join("\n"),
        ATTRIBUTIONBENCH_SAMPLE_SHA256,
        120_000,
      ),
    ).toThrow(/Expected 500 rows/u);
  });

  it("records oversized cases as exclusions without truncating them", () => {
    const dataset = prepareAttributionBenchDataset(
      source({ 0: { references: ["x".repeat(101)] } }),
      ATTRIBUTIONBENCH_SAMPLE_SHA256,
      100,
    );

    expect(dataset.cases).toHaveLength(499);
    expect(dataset.exclusions).toEqual([
      {
        id: "case-0",
        groupId: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sourceLine: 1,
        expectedLabel: "attributable",
        sourceDataset: "AttributedQA",
        contextCharacters: 101,
        reason: "adapter-context-character-cap",
      },
    ]);
  });

  it("supports the full ID and OOD artifacts and records empty evidence", () => {
    const id = prepareAttributionBenchDataset(
      source({}, "id-test"),
      ATTRIBUTIONBENCH_ARTIFACTS["id-test"].sha256,
      120_000,
      "id-test",
    );
    const ood = prepareAttributionBenchDataset(
      source({ 0: { references: [] } }, "ood-test"),
      ATTRIBUTIONBENCH_ARTIFACTS["ood-test"].sha256,
      120_000,
      "ood-test",
    );

    expect(id.sourceRows).toBe(1_610);
    expect(id.cases).toHaveLength(1_610);
    expect(ood.sourceRows).toBe(1_686);
    expect(ood.exclusions[0]).toMatchObject({
      sourceLine: 1,
      contextCharacters: 0,
      reason: "empty-references",
    });
  });

  it("rejects a source hash that does not match the selected artifact", () => {
    expect(() => prepareAttributionBenchDataset(source(), "a".repeat(64), 120_000)).toThrow(
      /hash mismatch/u,
    );
  });
});
