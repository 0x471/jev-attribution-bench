import { describe, expect, it } from "vitest";

import { prepareContractNliDataset } from "../src/contractnli.js";

const source = {
  labels: {
    "nda-1": { hypothesis: "The receiver must return the information." },
  },
  documents: [
    {
      id: 7,
      text: "Title\nReturn all information.\nNo assignment.",
      spans: [
        [0, 5],
        [6, 29],
        [30, 44],
      ],
      annotation_sets: [
        { annotations: { "nda-1": { choice: "Entailment", spans: [1] } } },
      ],
    },
    {
      id: 8,
      text: "Title\nDo not return information.\nNo assignment.",
      spans: [
        [0, 5],
        [6, 32],
        [33, 47],
      ],
      annotation_sets: [
        { annotations: { "nda-1": { choice: "Contradiction", spans: [1] } } },
      ],
    },
    {
      id: 9,
      text: "Title\nInformation is defined elsewhere.\nNo warranties.",
      spans: [
        [0, 5],
        [6, 39],
        [40, 54],
      ],
      annotation_sets: [
        { annotations: { "nda-1": { choice: "NotMentioned", spans: [] } } },
      ],
    },
  ],
};

describe("ContractNLI citation dataset preparation", () => {
  it("maps labels, keeps gold evidence, and mines a deterministic hard negative", () => {
    const dataset = prepareContractNliDataset(source, {
      mode: "citation",
      perLabel: 1,
      negativePassages: 1,
      seed: "test",
      sourceSha256: "a".repeat(64),
    });

    expect(dataset.cases.map((testCase) => testCase.expectedRelation)).toEqual([
      "supports",
      "contradicts",
      "says_nothing",
    ]);
    expect(dataset.cases[0]?.context).toBe("Return all information.");
    expect(dataset.cases[1]?.context).toBe("Do not return information.");
    expect(dataset.cases[2]?.context).toContain("Information is defined elsewhere");
    expect(dataset.source).toMatchObject({
      kind: "public-benchmark",
      split: "dev",
      license: "CC BY 4.0",
    });
  });

  it("refuses to oversample a class", () => {
    expect(() =>
      prepareContractNliDataset(source, {
        mode: "citation",
        perLabel: 2,
        negativePassages: 1,
        seed: "test",
        sourceSha256: "a".repeat(64),
      }),
    ).toThrow(/only 1 supports/u);
  });

  it("preserves the official document-level task when requested", () => {
    const dataset = prepareContractNliDataset(source, {
      mode: "document",
      perLabel: 1,
      negativePassages: 1,
      seed: "test",
      sourceSha256: "a".repeat(64),
    });

    expect(dataset.cases.every((testCase) => testCase.phenomenon === "contractnli-document-level")).toBe(true);
    expect(dataset.cases[0]?.context).toBe(source.documents[0]!.text);
    expect(dataset.source.name).toContain("document-NLI");
  });

  it("can preserve every case without balancing", () => {
    const dataset = prepareContractNliDataset(source, {
      mode: "document",
      perLabel: "all",
      negativePassages: 1,
      seed: "test",
      sourceSha256: "a".repeat(64),
    });

    expect(dataset.cases).toHaveLength(3);
  });

  it("rejects source spans outside the document", () => {
    const malformed = structuredClone(source);
    malformed.documents[0]!.spans[0] = [0, 1000];
    expect(() =>
      prepareContractNliDataset(malformed, {
        mode: "citation",
        perLabel: 1,
        negativePassages: 1,
        seed: "test",
        sourceSha256: "a".repeat(64),
      }),
    ).toThrow(/invalid text span/u);
  });
});
