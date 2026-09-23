import { sha256 } from "./artifacts.js";
import type { ArtifactRecord } from "./domain.js";

export type EvidenceRelation =
  | "supports"
  | "contradicts"
  | "says_nothing"
  | "fabricated";

export interface ClaimRef {
  id: string;
  text: string;
}

export interface TextAnchor {
  artifactId: string;
  start: number;
  end: number;
  textSha256: string;
  offsetEncoding: "unicode-code-point";
}

export interface EvidenceSpan {
  sourceArtifactId: string;
  proposedQuote: string;
  text: string;
  anchor: TextAnchor | null;
}

export interface RelationInput {
  relationId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  evidenceAnchor: Pick<TextAnchor, "start" | "end" | "textSha256">;
  claim: ClaimRef;
  context: string;
  rubricVersion: string;
}

export interface CheckerAssessment {
  relation: Exclude<EvidenceRelation, "fabricated">;
  requestedModel: string;
  resolvedModel: string;
  rubricVersion: string;
  probabilities: {
    supports: number;
    contradicts: number;
    says_nothing: number;
  };
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  runAt: string;
}

export interface AutomatedAssessment {
  relation: EvidenceRelation;
  exactMatch: boolean;
  requestedModel: string | null;
  resolvedModel: string | null;
  rubricVersion: string;
  inputSha256: string;
  probabilities: CheckerAssessment["probabilities"] | null;
  confidence: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  runAt: string;
}

export interface EvidenceRelationChecker {
  check(input: RelationInput): Promise<CheckerAssessment>;
}

export interface EvidenceReview {
  id: string;
  claimId: string;
  evidence: EvidenceSpan;
  assessment: AutomatedAssessment;
}

export interface EvidenceReviewRequest {
  id: string;
  claim: ClaimRef;
  source: ArtifactRecord;
  proposedQuote: string;
}

export interface EvidenceReviewOptions {
  rubricVersion: string;
  contextCharacters: number;
  now?: () => Date;
}

export function assertCheckerAssessment(value: CheckerAssessment): void {
  const probabilityKeys = Object.keys(value.probabilities).sort();
  const expectedKeys = ["contradicts", "says_nothing", "supports"];
  if (JSON.stringify(probabilityKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("Checker probabilities must contain exactly the three relation labels");
  }
  const probabilities = Object.values(value.probabilities);
  if (
    probabilities.some(
      (probability) => !Number.isFinite(probability) || probability < 0 || probability > 1,
    ) ||
    Math.abs(probabilities.reduce((sum, probability) => sum + probability, 0) - 1) > 0.001
  ) {
    throw new Error("Checker probabilities must be finite, between 0 and 1, and sum to 1");
  }
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new Error("Checker confidence must be between 0 and 1");
  }
  if (!Number.isInteger(value.inputTokens) || value.inputTokens < 0) {
    throw new Error("Checker input token usage must be a non-negative integer");
  }
  if (!Number.isInteger(value.outputTokens) || value.outputTokens < 0) {
    throw new Error("Checker output token usage must be a non-negative integer");
  }
  if (!value.requestedModel || !value.resolvedModel || !value.rubricVersion) {
    throw new Error("Checker model and rubric identities are required");
  }
  if (Number.isNaN(Date.parse(value.runAt))) throw new Error("Checker runAt must be a timestamp");
}

interface NormalizedText {
  characters: string[];
  originalCodePointByIndex: number[];
}

const QUOTE_FOLD: Record<string, string> = {
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
};

function normalizeWithMap(text: string): NormalizedText {
  const output: string[] = [];
  const originalCodePointByIndex: number[] = [];
  let previousWasSpace = true;

  for (const [codePointIndex, character] of Array.from(text).entries()) {
    if (/\s/u.test(character)) {
      if (!previousWasSpace && output.length > 0) {
        output.push(" ");
        originalCodePointByIndex.push(codePointIndex);
        previousWasSpace = true;
      }
      continue;
    }

    output.push(QUOTE_FOLD[character] ?? character);
    originalCodePointByIndex.push(codePointIndex);
    previousWasSpace = false;
  }

  if (output.at(-1) === " ") {
    output.pop();
    originalCodePointByIndex.pop();
  }

  return { characters: output, originalCodePointByIndex };
}

function findCharacterSequence(source: readonly string[], query: readonly string[]): number {
  const finalStart = source.length - query.length;
  for (let start = 0; start <= finalStart; start += 1) {
    if (query.every((character, offset) => source[start + offset] === character)) return start;
  }
  return -1;
}

export function locateNormalizedQuote(
  sourceText: string,
  proposedQuote: string,
): { start: number; end: number; text: string } | null {
  const source = normalizeWithMap(sourceText);
  const quote = normalizeWithMap(proposedQuote).characters;
  if (quote.length === 0) throw new Error("Proposed quote must not be empty");

  const normalizedStart = findCharacterSequence(source.characters, quote);
  if (normalizedStart < 0) return null;

  const normalizedEnd = normalizedStart + quote.length - 1;
  const start = source.originalCodePointByIndex[normalizedStart];
  const finalCodePoint = source.originalCodePointByIndex[normalizedEnd];
  if (start === undefined || finalCodePoint === undefined) {
    throw new Error("Normalized quote mapping is internally inconsistent");
  }

  const end = finalCodePoint + 1;
  return { start, end, text: Array.from(sourceText).slice(start, end).join("") };
}

function relationInputDigest(input: RelationInput): string {
  return sha256(
    JSON.stringify({
      claim: { id: input.claim.id, text: input.claim.text },
      sourceArtifactId: input.sourceArtifactId,
      sourceSha256: input.sourceSha256,
      evidenceAnchor: input.evidenceAnchor,
      context: input.context,
      rubricVersion: input.rubricVersion,
    }),
  );
}

export class EvidenceReviewEngine {
  readonly #checker: EvidenceRelationChecker;
  readonly #options: Required<EvidenceReviewOptions>;

  constructor(checker: EvidenceRelationChecker, options: EvidenceReviewOptions) {
    if (options.contextCharacters < 0) {
      throw new Error("contextCharacters must not be negative");
    }
    this.#checker = checker;
    this.#options = { ...options, now: options.now ?? (() => new Date()) };
  }

  async review(request: EvidenceReviewRequest): Promise<EvidenceReview> {
    const match = locateNormalizedQuote(request.source.text, request.proposedQuote);
    if (match === null) {
      return {
        id: request.id,
        claimId: request.claim.id,
        evidence: {
          sourceArtifactId: request.source.artifact.id,
          proposedQuote: request.proposedQuote,
          text: request.proposedQuote,
          anchor: null,
        },
        assessment: {
          relation: "fabricated",
          exactMatch: false,
          requestedModel: null,
          resolvedModel: null,
          rubricVersion: this.#options.rubricVersion,
          inputSha256: sha256(
            JSON.stringify({
              claim: request.claim,
              sourceSha256: request.source.artifact.sha256,
              proposedQuote: request.proposedQuote,
              rubricVersion: this.#options.rubricVersion,
            }),
          ),
          probabilities: null,
          confidence: null,
          inputTokens: null,
          outputTokens: null,
          runAt: this.#options.now().toISOString(),
        },
      };
    }

    const sourceCodePoints = Array.from(request.source.text);
    const contextStart = Math.max(0, match.start - this.#options.contextCharacters);
    const contextEnd = Math.min(
      sourceCodePoints.length,
      match.end + this.#options.contextCharacters,
    );
    const input: RelationInput = {
      relationId: request.id,
      sourceArtifactId: request.source.artifact.id,
      sourceSha256: request.source.artifact.sha256,
      evidenceAnchor: {
        start: match.start,
        end: match.end,
        textSha256: sha256(match.text),
      },
      claim: request.claim,
      context: sourceCodePoints.slice(contextStart, contextEnd).join(""),
      rubricVersion: this.#options.rubricVersion,
    };
    const checked = await this.#checker.check(input);
    assertCheckerAssessment(checked);

    if (checked.rubricVersion !== this.#options.rubricVersion) {
      throw new Error(
        `Checker returned rubric ${checked.rubricVersion}; expected ${this.#options.rubricVersion}`,
      );
    }

    return {
      id: request.id,
      claimId: request.claim.id,
      evidence: {
        sourceArtifactId: request.source.artifact.id,
        proposedQuote: request.proposedQuote,
        text: match.text,
        anchor: {
          artifactId: request.source.artifact.id,
          start: match.start,
          end: match.end,
          textSha256: sha256(match.text),
          offsetEncoding: "unicode-code-point",
        },
      },
      assessment: {
        ...checked,
        exactMatch: true,
        inputSha256: relationInputDigest(input),
      },
    };
  }
}
