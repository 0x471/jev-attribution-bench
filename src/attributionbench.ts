import { sha256 } from "./artifacts.js";

export const ATTRIBUTIONBENCH_SAMPLE_SHA256 =
  "67459b19ce853519bed1e39c7585fa41a2c2ea6504139d23453ae4cafb15c02a";
export const ATTRIBUTIONBENCH_ID_TEST_SHA256 =
  "c2ff75dd4ea5cf12d86166ead66a96b42d5001a36daf02ff71303ef3317715a8";
export const ATTRIBUTIONBENCH_OOD_TEST_SHA256 =
  "90d8f5363cec90197f80b3e896dad17e091a108a5bf282c3d515d48c9a01a934";
export const ATTRIBUTIONBENCH_DATA_REVISION = "62569e644f4186606f54f742178a4517431b42e1";
export const ATTRIBUTIONBENCH_CODE_REVISION = "c81e9e114a074b49b08900afed8811799a308cfe";
export const ATTRIBUTIONBENCH_SOURCE_URL =
  `https://huggingface.co/datasets/osunlp/AttributionBench/tree/${ATTRIBUTIONBENCH_DATA_REVISION}`;

export const ATTRIBUTIONBENCH_ARTIFACTS = {
  sampled500: {
    name: "AttributionBench official balanced 500-row standalone sample",
    split: "standalone-sampled500",
    file: "test_all_subset_balanced_sampled500.jsonl",
    rows: 500,
    sha256: ATTRIBUTIONBENCH_SAMPLE_SHA256,
    sourceLabelCounts: {
      AttributedQA: [36, 36],
      ExpertQA: [95, 95],
      LFQA: [26, 26],
      "Stanford-GenSearch": [93, 93],
    },
  },
  "id-test": {
    name: "AttributionBench configured subset-balanced in-domain test",
    split: "test",
    file: "test_all_subset_balanced.jsonl",
    rows: 1610,
    sha256: ATTRIBUTIONBENCH_ID_TEST_SHA256,
    sourceLabelCounts: {
      AttributedQA: [115, 115],
      ExpertQA: [306, 306],
      LFQA: [84, 84],
      "Stanford-GenSearch": [300, 300],
    },
  },
  "ood-test": {
    name: "AttributionBench configured subset-balanced out-of-domain test",
    split: "test_ood",
    file: "test_ood_all_subset_balanced.jsonl",
    rows: 1686,
    sha256: ATTRIBUTIONBENCH_OOD_TEST_SHA256,
    sourceLabelCounts: {
      "AttrScore-GenSearch": [81, 81],
      BEGIN: [218, 218],
      HAGRID: [544, 544],
    },
  },
} as const;

export type AttributionBenchArtifact = keyof typeof ATTRIBUTIONBENCH_ARTIFACTS;

export const ATTRIBUTION_LABELS = ["attributable", "not_attributable"] as const;
export type AttributionLabel = (typeof ATTRIBUTION_LABELS)[number];

interface AttributionBenchRow {
  id: string;
  question: string;
  claim: string;
  references: string[];
  attribution_label: "attributable" | "not attributable";
  src_dataset: string;
}

export interface AttributionCase {
  id: string;
  groupId: string;
  sourceLine: number;
  question: string;
  claim: string;
  references: string[];
  expectedLabel: AttributionLabel;
  sourceDataset: string;
}

export interface AttributionDataset {
  schemaVersion: "0.1.0";
  dataPolicy: {
    containsPrivateOrConfidentialData: false;
    mayContainPublicPersonalData: true;
    mayContainUntrustedWebText: true;
  };
  source: {
    kind: "public-benchmark";
    artifact: AttributionBenchArtifact;
    name: string;
    split: string;
    license: "Apache-2.0 dataset card; aggregated upstream terms still apply";
    sourceUrl: string;
    sourceRevision: string;
    codeRevision: string;
    sourceSha256: string;
    preparation: string;
  };
  sourceRows: number;
  exclusions: Array<{
    id: string;
    groupId: string;
    sourceLine: number;
    expectedLabel: AttributionLabel;
    sourceDataset: string;
    contextCharacters: number;
    reason: "adapter-context-character-cap" | "empty-references";
  }>;
  cases: AttributionCase[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRow(value: unknown, lineNumber: number): AttributionBenchRow {
  if (!isRecord(value)) throw new Error(`AttributionBench line ${lineNumber} is not an object`);
  const references = value.references;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.question !== "string" ||
    typeof value.claim !== "string" ||
    value.claim.length === 0 ||
    !Array.isArray(references) ||
    references.some((reference) => typeof reference !== "string" || reference.length === 0) ||
    (value.attribution_label !== "attributable" &&
      value.attribution_label !== "not attributable") ||
    typeof value.src_dataset !== "string" ||
    value.src_dataset.length === 0
  ) {
    throw new Error(`AttributionBench line ${lineNumber} has an invalid schema`);
  }
  return value as unknown as AttributionBenchRow;
}

export function prepareAttributionBenchDataset(
  jsonLines: string,
  sourceSha256: string,
  maxContextCharacters: number,
  artifact: AttributionBenchArtifact = "sampled500",
): AttributionDataset {
  if (!Number.isInteger(maxContextCharacters) || maxContextCharacters < 1) {
    throw new Error("maxContextCharacters must be a positive integer");
  }
  const lines = jsonLines.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const specification = ATTRIBUTIONBENCH_ARTIFACTS[artifact];
  if (sourceSha256 !== specification.sha256) {
    throw new Error(
      `AttributionBench ${artifact} hash mismatch: expected ${specification.sha256}, received ${sourceSha256}`,
    );
  }
  if (lines.length !== specification.rows) {
    throw new Error(`Expected ${specification.rows} rows for ${artifact}; received ${lines.length}`);
  }
  const ids = new Set<string>();
  const sourceCases = lines.map((line, index): AttributionCase => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`AttributionBench line ${index + 1} is not valid JSON`);
    }
    const row = parseRow(parsed, index + 1);
    if (ids.has(row.id)) throw new Error(`Duplicate AttributionBench id ${row.id}`);
    ids.add(row.id);
    return {
      id: row.id,
      groupId: sha256(`${row.src_dataset}\0${row.question}`),
      sourceLine: index + 1,
      question: row.question,
      claim: row.claim,
      references: row.references,
      expectedLabel:
        row.attribution_label === "attributable" ? "attributable" : "not_attributable",
      sourceDataset: row.src_dataset,
    };
  });

  for (const [sourceDataset, [attributable, notAttributable]] of Object.entries(
    specification.sourceLabelCounts,
  )) {
    const actual = [
      sourceCases.filter(
        (testCase) =>
          testCase.sourceDataset === sourceDataset && testCase.expectedLabel === "attributable",
      ).length,
      sourceCases.filter(
        (testCase) =>
          testCase.sourceDataset === sourceDataset && testCase.expectedLabel === "not_attributable",
      ).length,
    ];
    if (actual[0] !== attributable || actual[1] !== notAttributable) {
      throw new Error(
        `Unexpected ${sourceDataset} label counts for ${artifact}: expected ${attributable}/${notAttributable}, received ${actual[0]}/${actual[1]}`,
      );
    }
  }
  const expectedSources = new Set(Object.keys(specification.sourceLabelCounts));
  const unexpectedSource = sourceCases.find(
    (testCase) => !expectedSources.has(testCase.sourceDataset),
  );
  if (unexpectedSource) {
    throw new Error(`Unexpected source dataset ${unexpectedSource.sourceDataset} for ${artifact}`);
  }
  const exclusions = sourceCases
    .filter(
      (testCase) =>
        testCase.references.length === 0 ||
        testCase.references.join("\n\n\n").length > maxContextCharacters,
    )
    .map((testCase) => ({
      id: testCase.id,
      groupId: testCase.groupId,
      sourceLine: testCase.sourceLine,
      expectedLabel: testCase.expectedLabel,
      sourceDataset: testCase.sourceDataset,
      contextCharacters: testCase.references.join("\n\n\n").length,
      reason:
        testCase.references.length === 0
          ? ("empty-references" as const)
          : ("adapter-context-character-cap" as const),
    }));
  const excludedIds = new Set(exclusions.map((exclusion) => exclusion.id));
  const cases = sourceCases.filter((testCase) => !excludedIds.has(testCase.id));

  return {
    schemaVersion: "0.1.0",
    dataPolicy: {
      containsPrivateOrConfidentialData: false,
      mayContainPublicPersonalData: true,
      mayContainUntrustedWebText: true,
    },
    source: {
      kind: "public-benchmark",
      artifact,
      name: specification.name,
      split: specification.split,
      license: "Apache-2.0 dataset card; aggregated upstream terms still apply",
      sourceUrl: `https://huggingface.co/datasets/osunlp/AttributionBench/resolve/${ATTRIBUTIONBENCH_DATA_REVISION}/${specification.file}`,
      sourceRevision: ATTRIBUTIONBENCH_DATA_REVISION,
      codeRevision: ATTRIBUTIONBENCH_CODE_REVISION,
      sourceSha256,
      preparation: `attributionbench-v1;artifact=${artifact};reference-order=source;separator=triple-newline;max-context-characters=${maxContextCharacters}`,
    },
    sourceRows: specification.rows,
    exclusions,
    cases,
  };
}
