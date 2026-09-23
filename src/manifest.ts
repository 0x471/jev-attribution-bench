import type { Artifact } from "./domain.js";
import type { EvidenceReview, TextAnchor } from "./evidence-review.js";

export interface PublicationPolicy {
  fixture: boolean;
  containsSensitiveData: boolean;
}

export interface Claim {
  id: string;
  text: string;
  origin: TextAnchor;
  kind: "stated" | "implicit-premise";
  proposedBy: "human" | "model";
  proposalModel: string | null;
}

export interface ArgumentEdge {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  relation: "requires" | "supports" | "rebuts" | "qualifies";
  proposedBy: "human" | "model";
}

export type ReviewSubjectType =
  | "claim"
  | "evidence-relation"
  | "argument-edge"
  | "document";

export type ReviewDecision = "approve" | "reject" | "waive";

export interface Reviewer {
  displayName: string;
  identityAssurance: "self-asserted";
}

export interface ArtifactBinding {
  artifactId: string;
  sha256: string;
}

export interface ReviewAction {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  decision: ReviewDecision;
  reason: string | null;
  reviewer: Reviewer;
  at: string;
  boundSubjectSha256: string;
  boundDocumentSha256: string;
  boundSources: ArtifactBinding[];
}

export interface Certification {
  reviewActionId: string;
  reviewStateSha256: string;
  scope: "The reviewer completed the recorded review actions for the exact artifact versions in this manifest.";
}

export interface ReviewManifest {
  schemaVersion: "0.1.0";
  reviewId: string;
  createdAt: string;
  publication: PublicationPolicy;
  document: Artifact;
  sources: Artifact[];
  claims: Claim[];
  evidenceRelations: EvidenceReview[];
  argumentEdges: ArgumentEdge[];
  reviewActions: ReviewAction[];
  certification: Certification | null;
  toolchain: {
    claimLedgerVersion: string;
    nodeVersion: string;
    sdkVersion: string | null;
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
