import { sha256 } from "./artifacts.js";
import type {
  EvidenceRelationCase,
  EvidenceRelationDataset,
  EvaluationRelation,
} from "./checker-evaluation.js";

export const CONTRACTNLI_DEV_SHA256 =
  "310af7d661d2ab50ee3700169cef524c75f39fb296bbf5a515c229eb0f42e68e";
export const CONTRACTNLI_SOURCE_REVISION = "eced6528dd3c1d14d73f9a87df8f7bdbc03126f9";
export const CONTRACTNLI_SOURCE_URL = "https://github.com/stanfordnlp/contract-nli";

type ContractNliChoice = "Entailment" | "Contradiction" | "NotMentioned";

interface ContractNliAnnotation {
  choice: ContractNliChoice;
  spans: number[];
}

interface ContractNliDocument {
  id: number;
  text: string;
  spans: [number, number][];
  annotation_sets: [{ annotations: Record<string, ContractNliAnnotation> }];
}

export interface ContractNliSource {
  documents: ContractNliDocument[];
  labels: Record<string, { hypothesis: string }>;
}

export interface PrepareContractNliOptions {
  mode: "citation" | "document";
  perLabel: number | "all";
  negativePassages: number;
  seed: string;
  sourceSha256: string;
}

const RELATION_BY_CHOICE: Record<ContractNliChoice, EvaluationRelation> = {
  Entailment: "supports",
  Contradiction: "contradicts",
  NotMentioned: "says_nothing",
};

function terms(text: string): string[] {
  return text.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function bm25Passages(query: string, passages: string[], count: number): string[] {
  const passageTerms = passages.map(terms);
  const averageLength =
    passageTerms.reduce((sum, passage) => sum + passage.length, 0) /
    Math.max(1, passageTerms.length);
  const queryTerms = [...new Set(terms(query))];
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      passageTerms.filter((passage) => passage.includes(term)).length,
    );
  }
  const k1 = 1.2;
  const b = 0.75;
  const scored = passages.map((passage, index) => {
    const frequencies = new Map<string, number>();
    for (const term of passageTerms[index]!) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
    const score = queryTerms.reduce((sum, term) => {
      const frequency = frequencies.get(term) ?? 0;
      if (frequency === 0) return sum;
      const frequencyInDocuments = documentFrequency.get(term) ?? 0;
      const inverseDocumentFrequency = Math.log(
        1 + (passages.length - frequencyInDocuments + 0.5) / (frequencyInDocuments + 0.5),
      );
      const lengthNormalization =
        frequency +
        k1 *
          (1 - b + b * (passageTerms[index]!.length / Math.max(1, averageLength)));
      return sum + inverseDocumentFrequency * ((frequency * (k1 + 1)) / lengthNormalization);
    }, 0);
    return { index, passage, score };
  });

  return scored
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, count)
    .sort((left, right) => left.index - right.index)
    .map(({ passage }) => passage);
}

function joinPassages(passages: string[]): string {
  return passages.map((passage) => passage.trim()).filter(Boolean).join("\n\n[…]\n\n");
}

function assertSource(value: unknown): asserts value is ContractNliSource {
  if (typeof value !== "object" || value === null) throw new Error("ContractNLI source must be an object");
  const source = value as Partial<ContractNliSource>;
  if (!Array.isArray(source.documents) || source.documents.length === 0) {
    throw new Error("ContractNLI source has no documents");
  }
  if (typeof source.labels !== "object" || source.labels === null) {
    throw new Error("ContractNLI source has no labels");
  }
  for (const document of source.documents) {
    if (
      !Number.isInteger(document?.id) ||
      typeof document.text !== "string" ||
      !Array.isArray(document.spans) ||
      document.spans.length === 0 ||
      !Array.isArray(document.annotation_sets) ||
      typeof document.annotation_sets[0]?.annotations !== "object"
    ) {
      throw new Error("ContractNLI document structure is malformed");
    }
    for (const span of document.spans) {
      if (
        !Array.isArray(span) ||
        span.length !== 2 ||
        !Number.isInteger(span[0]) ||
        !Number.isInteger(span[1]) ||
        span[0] < 0 ||
        span[1] <= span[0] ||
        span[1] > document.text.length
      ) {
        throw new Error(`ContractNLI document ${document.id} has an invalid text span`);
      }
    }
  }
}

function contextFor(
  document: ContractNliDocument,
  annotation: ContractNliAnnotation,
  hypothesis: string,
  negativePassages: number,
  mode: PrepareContractNliOptions["mode"],
): { context: string; phenomenon: string } {
  if (mode === "document") {
    return {
      context: document.text,
      phenomenon: "contractnli-document-level",
    };
  }
  const passages = document.spans.map(([start, end]) => document.text.slice(start, end));
  if (annotation.choice === "NotMentioned") {
    return {
      context: joinPassages(bm25Passages(hypothesis, passages, negativePassages)),
      phenomenon: "contractnli-bm25-hard-negative",
    };
  }
  const evidence = annotation.spans.map((index) => {
    const passage = passages[index];
    if (passage === undefined) throw new Error(`ContractNLI evidence span ${index} is out of range`);
    return passage;
  });
  if (evidence.length === 0) {
    throw new Error(`ContractNLI ${annotation.choice} annotation has no evidence spans`);
  }
  return {
    context: joinPassages(evidence),
    phenomenon:
      evidence.length === 1
        ? "contractnli-oracle-evidence-single"
        : "contractnli-oracle-evidence-multi",
  };
}

export function prepareContractNliDataset(
  value: unknown,
  options: PrepareContractNliOptions,
): EvidenceRelationDataset {
  assertSource(value);
  if (
    options.perLabel !== "all" &&
    (!Number.isInteger(options.perLabel) || options.perLabel < 1)
  ) {
    throw new Error("perLabel must be a positive integer");
  }
  if (!Number.isInteger(options.negativePassages) || options.negativePassages < 1) {
    throw new Error("negativePassages must be a positive integer");
  }

  const candidates: EvidenceRelationCase[] = [];
  for (const document of value.documents) {
    const annotations = document.annotation_sets[0]?.annotations;
    if (!annotations) throw new Error(`ContractNLI document ${document.id} has no annotations`);
    for (const [labelId, annotation] of Object.entries(annotations)) {
      const hypothesis = value.labels[labelId]?.hypothesis;
      if (!hypothesis) throw new Error(`ContractNLI label ${labelId} has no hypothesis`);
      const relation = RELATION_BY_CHOICE[annotation.choice];
      if (!relation) throw new Error(`Unsupported ContractNLI choice ${annotation.choice as string}`);
      const { context, phenomenon } = contextFor(
        document,
        annotation,
        hypothesis,
        options.negativePassages,
        options.mode,
      );
      candidates.push({
        id: `contractnli-dev-d${document.id}-${labelId}`,
        claim: hypothesis,
        context,
        expectedRelation: relation,
        phenomenon,
      });
    }
  }

  const cases = (["supports", "contradicts", "says_nothing"] as const).flatMap((relation) => {
    const eligible = candidates
      .filter((candidate) => candidate.expectedRelation === relation)
      .sort((left, right) =>
        sha256(`${options.seed}:${left.id}`).localeCompare(sha256(`${options.seed}:${right.id}`)),
      );
    if (options.perLabel === "all") return eligible;
    if (eligible.length < options.perLabel) {
      throw new Error(
        `ContractNLI has only ${eligible.length} ${relation} cases; requested ${options.perLabel}`,
      );
    }
    return eligible.slice(0, options.perLabel);
  });

  return {
    schemaVersion: "0.3.0",
    dataPolicy: {
      containsPrivateOrConfidentialData: false,
      mayContainPublicPersonalData: true,
    },
    source: {
      kind: "public-benchmark",
      name:
        options.mode === "citation"
          ? `ContractNLI citation-relation development ${options.perLabel === "all" ? "set" : "sample"}`
          : `ContractNLI document-NLI development ${options.perLabel === "all" ? "set" : "sample"}`,
      split: "dev",
      license: "CC BY 4.0",
      sourceUrl: CONTRACTNLI_SOURCE_URL,
      sourceRevision: CONTRACTNLI_SOURCE_REVISION,
      sourceSha256: options.sourceSha256,
      preparation:
        options.mode === "citation"
          ? `contractnli-citation-v1;per-label=${options.perLabel};negative-passages=${options.negativePassages};seed=${options.seed}`
          : `contractnli-document-v1;per-label=${options.perLabel};seed=${options.seed}`,
    },
    cases,
  };
}
