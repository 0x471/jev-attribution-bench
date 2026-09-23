# Persisted-data dictionary

The JSON Schemas are authoritative for machine validation. This document assigns semantic
ownership and states what each persisted field means. Paths ending in `[]` apply to every array
item.

## Project input

| Field | Owner | Meaning |
| --- | --- | --- |
| `schemaVersion` | project loader | Exact project-contract version; v0 accepts `0.1.0`. |
| `reviewId` | project author | Stable identifier for this review, not a document digest. |
| `publication.fixture` | project author | Declares that all publishable content is synthetic test material. |
| `publication.containsSensitiveData` | project author | Conservative disclosure flag; `true` prohibits static publication. |
| `document` / `sources[]` | project author | Draft and closed evidence bundle declarations. |
| `*.id` | project author | Stable artifact identity within this project. |
| `*.path` | project author | Relative path contained by the project directory after symlink resolution. |
| `*.mediaType` | project author | Declared v0 input type: UTF-8 `text/plain` or `text/markdown`. |
| `claims[].id` | project author | Stable Claim identity. |
| `claims[].text` | project author | Atomic proposition presented for review. |
| `claims[].originText` | project author | Exact/normalizable draft text used to construct the Claim Anchor. |
| `claims[].kind` | project author | Whether the proposition is stated or an implicit premise. |
| `claims[].proposedBy` | project author | V0 is always `human`. |
| `claims[].proposalModel` | project author | V0 is always `null`; automatic proposals are deferred. |
| `claims[].evidence[]` | project author | Candidate source span for one Claim. |
| `claims[].evidence[].id` | project author | Stable Evidence Relation identity. |
| `claims[].evidence[].sourceId` | project author | Source declaration expected to contain the quotation. |
| `claims[].evidence[].quote` | project author | Proposed verbatim/normalizable source quotation. |
| `argumentEdges[]` | project author | Human-proposed directed relationship between two Claims. |
| `argumentEdges[].relation` | project author | `requires`, `supports`, `rebuts`, or `qualifies`. |

## Review Manifest

| Field | Owner | Meaning |
| --- | --- | --- |
| `schemaVersion` | ManifestExporter | Exact manifest-contract version; v0 accepts `0.1.0`. |
| `reviewId` | project loader | Copied stable review identity. |
| `createdAt` | build clock | ISO timestamp at which this manifest state was initially built. |
| `publication.*` | project author | Copied public-fixture and sensitivity declarations. |
| `document` / `sources[]` | ProjectArtifactStore | Immutable artifact identities and metadata. |
| `*.role` | ProjectArtifactStore | Whether the Artifact is the reviewed draft or a source. |
| `*.name` | ProjectArtifactStore | Basename shown to reviewers; not a filesystem authority. |
| `*.mediaType` | ProjectArtifactStore | Validated v0 text media type. |
| `*.byteLength` | ProjectArtifactStore | Exact raw byte count. |
| `*.sha256` | ProjectArtifactStore | Lowercase SHA-256 of the exact raw bytes. |
| `*.extractor` | future ingestion adapter | Parser name/version/warnings; absent for direct UTF-8 v0 text. |
| `claims[]` | ClaimCatalog | Anchored review Claims imported from the project. |
| `claims[].origin` | ClaimCatalog | Location of the declared origin in the exact Document Version. |
| `evidenceRelations[]` | EvidenceReviewEngine | Candidate Evidence Span plus automated relation assessment. |
| `evidenceRelations[].claimId` | project author | Claim evaluated by this relation. |
| `evidenceRelations[].evidence.sourceArtifactId` | project author | Exact Source Version containing, or expected to contain, the quote. |
| `evidenceRelations[].evidence.proposedQuote` | project author | Candidate quotation before deterministic containment. |
| `evidenceRelations[].evidence.text` | EvidenceReviewEngine | Exact source text when found; proposed text when classified fabricated. |
| `evidenceRelations[].evidence.anchor` | EvidenceReviewEngine | Exact source location, or `null` when the quote is absent. |
| `*.anchor.artifactId` | anchoring module | Artifact containing the span. |
| `*.anchor.start` / `end` | anchoring module | Half-open offsets measured in Unicode code points. |
| `*.anchor.textSha256` | anchoring module | SHA-256 of the exact anchored text. |
| `*.anchor.offsetEncoding` | anchoring module | Always `unicode-code-point` in v0. |
| `assessment.relation` | deterministic locator / checker | `fabricated`, `supports`, `contradicts`, or `says_nothing`. |
| `assessment.exactMatch` | deterministic locator | Whether the quotation was found before any checker call. |
| `assessment.requestedModel` | checker adapter | Requested exact model ID, or `null` for fabricated spans. |
| `assessment.resolvedModel` | checker adapter | Provider-returned model ID, or `null` for fabricated spans. |
| `assessment.rubricVersion` | EvidenceReviewEngine | Version of the three-way relation rubric. |
| `assessment.inputSha256` | EvidenceReviewEngine | Digest of the exact semantic input and provenance used for assessment. |
| `assessment.probabilities` | checker adapter | Complete three-label distribution, or `null` for fabricated spans. |
| `assessment.confidence` | checker adapter | Provider confidence as recorded; never an approval probability. |
| `assessment.inputTokens` / `outputTokens` | checker adapter | Provider-reported usage, or `null` when no model was called. |
| `assessment.runAt` | assessment clock | ISO timestamp at which the deterministic/model assessment completed. |
| `argumentEdges[]` | project author | Project-declared Claim relationships, still requiring human review. |
| `reviewActions[]` | ReviewLedger | Append-only human decisions. Automated modules cannot create these. |
| `reviewActions[].decision` | reviewer | `approve`, `reject`, or `waive`; waiver requires a reason. |
| `reviewActions[].reason` | reviewer | Optional rationale; mandatory for waiver. |
| `reviewActions[].reviewer` | reviewer | Display name with explicitly self-asserted identity assurance. |
| `reviewActions[].at` | review clock | ISO timestamp of the human action. |
| `reviewActions[].boundSubjectSha256` | ReviewLedger | Digest of the exact Claim, relation, edge, or document state reviewed. |
| `reviewActions[].boundDocumentSha256` | ReviewLedger | Exact Document Version reviewed. |
| `reviewActions[].boundSources[]` | ReviewLedger | Source ID and SHA-256 pairs reviewed; identity and bytes are both bound. |
| `certification` | ReviewLedger | Optional exact-state sign-off; `null` until every item is resolved. |
| `certification.reviewActionId` | ReviewLedger | Document-level action that created the Certification. |
| `certification.reviewStateSha256` | ReviewLedger | Canonical digest of the full pre-Certification manifest state. |
| `certification.scope` | ReviewLedger | Fixed narrow statement of what the sign-off means. |
| `toolchain.claimLedgerVersion` | build runtime | Version of this implementation. |
| `toolchain.nodeVersion` | build runtime | Node.js version used for the build. |
| `toolchain.sdkVersion` | checker wiring | Pinned TypeSafe SDK version, or `null` for fixture-only builds. |

## Failure receipt

| Field | Owner | Meaning |
| --- | --- | --- |
| `receiptVersion` | CLI | Failure-receipt contract version. |
| `command` | CLI | Command that failed; currently `build`. |
| `status` | CLI | Always `failed`. |
| `error.code` / `message` | CLI | Sanitized category and safe explanation; never source/provider body text. |
| `at` | CLI clock | ISO failure timestamp. |
