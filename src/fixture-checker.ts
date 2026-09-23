import { readFile } from "node:fs/promises";

import type {
  CheckerAssessment,
  EvidenceRelationChecker,
  RelationInput,
} from "./evidence-review.js";

interface FixtureAssessment {
  relation: "supports" | "contradicts" | "says_nothing";
  probabilities: CheckerAssessment["probabilities"];
  confidence: number;
  inputTokens: number;
  outputTokens?: number;
}

type FixtureAssessments = Record<string, FixtureAssessment>;

export class FixtureEvidenceRelationChecker implements EvidenceRelationChecker {
  readonly #assessments: FixtureAssessments;
  readonly #now: () => Date;

  constructor(assessments: FixtureAssessments, now: () => Date = () => new Date()) {
    this.#assessments = assessments;
    this.#now = now;
  }

  static async fromFile(
    path: string,
    now: () => Date = () => new Date(),
  ): Promise<FixtureEvidenceRelationChecker> {
    return new FixtureEvidenceRelationChecker(
      JSON.parse(await readFile(path, "utf8")) as FixtureAssessments,
      now,
    );
  }

  async check(input: RelationInput): Promise<CheckerAssessment> {
    const fixture = this.#assessments[input.relationId];
    if (fixture === undefined) {
      throw new Error(`No fixture assessment for ${input.relationId}`);
    }
    return {
      ...fixture,
      outputTokens: fixture.outputTokens ?? 0,
      requestedModel: "fixture-v1",
      resolvedModel: "fixture-v1",
      rubricVersion: input.rubricVersion,
      runAt: this.#now().toISOString(),
    };
  }
}
