import { randomUUID } from "node:crypto";

import { sha256 } from "./artifacts.js";
import {
  canonicalJson,
  type ArtifactBinding,
  type Certification,
  type ReviewAction,
  type ReviewDecision,
  type Reviewer,
  type ReviewManifest,
  type ReviewSubjectType,
} from "./manifest.js";

export interface RecordActionInput {
  subjectType: ReviewSubjectType;
  subjectId: string;
  decision: ReviewDecision;
  reason: string | null;
  reviewer: Reviewer;
}

export interface ReviewLedgerOptions {
  now?: () => Date;
  createId?: () => string;
}

export type CertificationStatus =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "not-certified"
        | "artifact-changed"
        | "review-state-changed"
        | "certification-action-missing"
        | "unresolved-subjects";
    };

function sourceBindings(manifest: ReviewManifest): ArtifactBinding[] {
  return manifest.sources
    .map((source) => ({ artifactId: source.id, sha256: source.sha256 }))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

function sameBindings(left: ArtifactBinding[], right: ArtifactBinding[]): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function latestActions(manifest: ReviewManifest): ReviewAction[] {
  const latest = new Map<string, ReviewAction>();
  for (const action of manifest.reviewActions) {
    latest.set(`${action.subjectType}:${action.subjectId}`, action);
  }
  return [...latest.values()];
}

function reviewState(manifest: ReviewManifest): Omit<ReviewManifest, "certification"> {
  const { certification: _, ...state } = manifest;
  return state;
}

export function reviewStateDigest(manifest: ReviewManifest): string {
  return sha256(canonicalJson(reviewState(manifest)));
}

function subjectExists(
  manifest: ReviewManifest,
  subjectType: ReviewSubjectType,
  subjectId: string,
): boolean {
  if (subjectType === "document") return manifest.document.id === subjectId;
  if (subjectType === "claim") return manifest.claims.some((claim) => claim.id === subjectId);
  if (subjectType === "evidence-relation") {
    return manifest.evidenceRelations.some((relation) => relation.id === subjectId);
  }
  return manifest.argumentEdges.some((edge) => edge.id === subjectId);
}

function currentAction(
  manifest: ReviewManifest,
  subjectType: ReviewSubjectType,
  subjectId: string,
): ReviewAction | undefined {
  return manifest.reviewActions.findLast(
    (action) => action.subjectType === subjectType && action.subjectId === subjectId,
  );
}

function unresolvedSubjects(manifest: ReviewManifest): string[] {
  const subjects: ReadonlyArray<readonly [ReviewSubjectType, string]> = [
    ...manifest.claims.map((claim) => ["claim" as const, claim.id] as const),
    ...manifest.evidenceRelations.map(
      (relation) => ["evidence-relation" as const, relation.id] as const,
    ),
    ...manifest.argumentEdges.map((edge) => ["argument-edge" as const, edge.id] as const),
  ];

  return subjects.flatMap(([subjectType, subjectId]) => {
    const action = currentAction(manifest, subjectType, subjectId);
    return action !== undefined && (action.decision === "approve" || action.decision === "waive")
      ? []
      : [subjectId];
  });
}

export function certificationStatus(manifest: ReviewManifest): CertificationStatus {
  if (manifest.certification === null) return { valid: false, reason: "not-certified" };

  const expectedSourceBindings = sourceBindings(manifest);
  const bindingsAreCurrent = latestActions(manifest).every(
    (action) =>
      action.boundDocumentSha256 === manifest.document.sha256 &&
      sameBindings(action.boundSources, expectedSourceBindings),
  );
  if (!bindingsAreCurrent) return { valid: false, reason: "artifact-changed" };

  const action = manifest.reviewActions.find(
    (candidate) => candidate.id === manifest.certification?.reviewActionId,
  );
  if (
    action === undefined ||
    action.subjectType !== "document" ||
    action.subjectId !== manifest.document.id ||
    action.decision !== "approve"
  ) {
    return { valid: false, reason: "certification-action-missing" };
  }

  if (unresolvedSubjects(manifest).length > 0) {
    return { valid: false, reason: "unresolved-subjects" };
  }

  return reviewStateDigest(manifest) === manifest.certification.reviewStateSha256
    ? { valid: true }
    : { valid: false, reason: "review-state-changed" };
}

export class ReviewLedger {
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: ReviewLedgerOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  record(manifest: ReviewManifest, input: RecordActionInput): ReviewManifest {
    if (!subjectExists(manifest, input.subjectType, input.subjectId)) {
      throw new Error(`Unknown ${input.subjectType} subject ${input.subjectId}`);
    }
    if (input.decision === "waive" && !input.reason?.trim()) {
      throw new Error("A waiver requires a reason");
    }
    if (!input.reviewer.displayName.trim()) throw new Error("Reviewer display name is required");

    const action: ReviewAction = {
      id: `action-${this.#createId()}`,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      decision: input.decision,
      reason: input.reason,
      reviewer: { ...input.reviewer },
      at: this.#now().toISOString(),
      boundDocumentSha256: manifest.document.sha256,
      boundSources: sourceBindings(manifest),
    };

    return {
      ...manifest,
      reviewActions: [...manifest.reviewActions, action],
      certification: null,
    };
  }

  certify(manifest: ReviewManifest, reviewer: Reviewer): ReviewManifest {
    const unresolved = unresolvedSubjects(manifest);
    if (unresolved.length > 0) {
      throw new Error(`Cannot certify; unresolved subjects: ${unresolved.join(", ")}`);
    }

    const withAction = this.record(manifest, {
      subjectType: "document",
      subjectId: manifest.document.id,
      decision: "approve",
      reason: "All required review subjects are approved or explicitly waived.",
      reviewer,
    });
    const reviewActionId = withAction.reviewActions.at(-1)?.id;
    if (reviewActionId === undefined) throw new Error("Certification action was not recorded");

    const certification: Certification = {
      reviewActionId,
      reviewStateSha256: reviewStateDigest(withAction),
      scope:
        "The reviewer completed the recorded review actions for the exact artifact versions in this manifest.",
    };
    return { ...withAction, certification };
  }
}
