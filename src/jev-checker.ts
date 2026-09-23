import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { TypeSafeClient } from "@typesafe-ai/sdk";

import { sha256 } from "./artifacts.js";
import type {
  CheckerAssessment,
  EvidenceRelationChecker,
  RelationInput,
} from "./evidence-review.js";

const RELATIONS = ["supports", "contradicts", "says_nothing"] as const;
export const PINNED_JEV_MODEL = "jev-1.13.0";
type Relation = (typeof RELATIONS)[number];

interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

interface SystemOneResponse {
  model: string;
  answers: { relation?: ChoiceAnswer };
  usage: { input_tokens?: number | null; output_tokens?: number | null };
}

export interface SystemOneClient {
  systemOne(
    request: unknown,
    options?: { signal?: AbortSignal; timeout?: number; retry?: { maxRetries: number } },
  ): Promise<SystemOneResponse>;
}

export interface JevCheckerOptions {
  model: string;
  rubricVersion: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  now?: () => Date;
}

function isRelation(value: string): value is Relation {
  return (RELATIONS as readonly string[]).includes(value);
}

function validateDistribution(value: Record<string, number>): asserts value is Record<Relation, number> {
  const keys = Object.keys(value).sort();
  const expected = [...RELATIONS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`Provider probabilities have unexpected labels: ${keys.join(", ")}`);
  }

  const supports = value.supports;
  const contradicts = value.contradicts;
  const saysNothing = value.says_nothing;
  const probabilities = [supports, contradicts, saysNothing];
  if (probabilities.some((probability) => probability === undefined || probability < 0 || probability > 1)) {
    throw new Error("Provider probabilities must all be between 0 and 1");
  }
  const sum = supports! + contradicts! + saysNothing!;
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Provider probabilities must sum to 1; received ${sum}`);
  }
}

export class JevEvidenceRelationChecker implements EvidenceRelationChecker {
  readonly #client: SystemOneClient;
  readonly #options: JevCheckerOptions & {
    timeoutMs: number;
    maxRetries: number;
    now: () => Date;
  };

  constructor(client: SystemOneClient, options: JevCheckerOptions) {
    if (options.model !== PINNED_JEV_MODEL) {
      throw new Error(`Jev model must be pinned to ${PINNED_JEV_MODEL}; received ${options.model}`);
    }
    if (!Number.isInteger(options.timeoutMs ?? 10_000) || (options.timeoutMs ?? 10_000) < 1) {
      throw new Error("Jev timeoutMs must be a positive integer");
    }
    if (!Number.isInteger(options.maxRetries ?? 2) || (options.maxRetries ?? 2) < 0) {
      throw new Error("Jev maxRetries must be a non-negative integer");
    }
    this.#client = client;
    this.#options = {
      ...options,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 2,
      now: options.now ?? (() => new Date()),
    };
  }

  async check(input: RelationInput): Promise<CheckerAssessment> {
    if (input.rubricVersion !== this.#options.rubricVersion) {
      throw new Error(
        `Input rubric ${input.rubricVersion} does not match ${this.#options.rubricVersion}`,
      );
    }

    const response = await this.#client.systemOne(
      {
        model: this.#options.model,
        state: { claim: input.claim.text, evidence_context: input.context },
        questions: {
          relation: {
            type: "choice",
            instructions:
              "How does `evidence_context` relate to `claim`? Judge only the supplied evidence context.",
            criteria: {
              supports: "The evidence context states the claim or directly implies that it is true.",
              contradicts:
                "The evidence context states the opposite of the claim or directly implies that it is false.",
              says_nothing:
                "The evidence context does not establish or contradict what the claim asserts.",
            },
          },
        },
      },
      {
        timeout: this.#options.timeoutMs,
        retry: { maxRetries: this.#options.maxRetries },
        ...(this.#options.signal ? { signal: this.#options.signal } : {}),
      },
    );

    const answer = response.answers.relation;
    if (answer?.type !== "choice" || !isRelation(answer.choice)) {
      throw new Error("Provider returned a malformed evidence relation answer");
    }
    validateDistribution(answer.probabilities);
    if (answer.confidence < 0 || answer.confidence > 1) {
      throw new Error("Provider confidence must be between 0 and 1");
    }
    if (response.model !== this.#options.model) {
      throw new Error(
        `Provider resolved model ${response.model || "<missing>"}; expected ${this.#options.model}`,
      );
    }

    return {
      relation: answer.choice,
      requestedModel: this.#options.model,
      resolvedModel: response.model,
      rubricVersion: this.#options.rubricVersion,
      probabilities: {
        supports: answer.probabilities.supports!,
        contradicts: answer.probabilities.contradicts!,
        says_nothing: answer.probabilities.says_nothing!,
      },
      confidence: answer.confidence,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      runAt: this.#options.now().toISOString(),
    };
  }
}

export function createJevCheckerFromEnvironment(options: JevCheckerOptions): JevEvidenceRelationChecker {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is required for the live Jev checker");
  const client = new TypeSafeClient({ apiKey });
  const adapter: SystemOneClient = {
    systemOne: async (request, requestOptions) =>
      (await client.systemOne(
        request as Parameters<TypeSafeClient["systemOne"]>[0],
        requestOptions,
      )) as SystemOneResponse,
  };
  return new JevEvidenceRelationChecker(adapter, options);
}

export interface AssessmentCache {
  get(key: string): Promise<CheckerAssessment | null>;
  set(key: string, assessment: CheckerAssessment): Promise<void>;
}

type CacheIndex = Record<string, CheckerAssessment>;

export class FileAssessmentCache implements AssessmentCache {
  readonly #directory: string;
  readonly #indexPath: string;

  constructor(directory: string) {
    this.#directory = directory;
    this.#indexPath = join(directory, "index.json");
  }

  async #read(): Promise<CacheIndex> {
    try {
      return JSON.parse(await readFile(this.#indexPath, "utf8")) as CacheIndex;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async get(key: string): Promise<CheckerAssessment | null> {
    return (await this.#read())[key] ?? null;
  }

  async set(key: string, assessment: CheckerAssessment): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const index = await this.#read();
    index[key] = assessment;
    const temporary = join(
      this.#directory,
      `.index-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.#indexPath);
  }
}

export class CachedEvidenceRelationChecker implements EvidenceRelationChecker {
  readonly #inner: EvidenceRelationChecker;
  readonly #cache: AssessmentCache;
  readonly #adapterIdentity: string;

  constructor(
    inner: EvidenceRelationChecker,
    cache: AssessmentCache,
    adapterIdentity: string,
  ) {
    this.#inner = inner;
    this.#cache = cache;
    this.#adapterIdentity = adapterIdentity;
  }

  async check(input: RelationInput): Promise<CheckerAssessment> {
    const key = sha256(
      JSON.stringify({
        adapterIdentity: this.#adapterIdentity,
        claim: input.claim,
        sourceArtifactId: input.sourceArtifactId,
        sourceSha256: input.sourceSha256,
        evidenceAnchor: input.evidenceAnchor,
        context: input.context,
        rubricVersion: input.rubricVersion,
      }),
    );
    const cached = await this.#cache.get(key);
    if (cached !== null) return cached;
    const assessment = await this.#inner.check(input);
    await this.#cache.set(key, assessment);
    return assessment;
  }
}
