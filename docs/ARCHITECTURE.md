# Architecture

## System shape

```text
                local processing runtime

 raw artifacts ─► ArtifactStore ─► anchored text
                         │
 claims input ─► ClaimCatalog
                         │
                         ▼
              EvidenceReviewEngine
                │        │        │
                │        │        └── EvidenceRelationChecker
                │        │              ├── Fixture adapter
                │        │              └── Optional model adapter
                │        └── exact quote locator
                └── candidate Evidence Spans
                         │
                         ▼
                  ReviewLedger
                         │
                         ▼
                  ManifestExporter
                         │
              manifest.json + review site
                         │
                         ▼
            static GitHub Pages deployment
```

The local runtime owns secrets, source material, model calls, hashing, and state transitions.
The static viewer is a read-only projection over an exported Review Manifest.

## Deep modules and interfaces

### `ProjectArtifactStore`

```ts
open(projectDirectory: string): Promise<ProjectArtifactStore>
ingest(declaration: TextArtifactDeclaration, role: ArtifactRole): Promise<ArtifactRecord>
```

The module hides project-root containment (including symlink resolution), byte preservation,
strict UTF-8 decoding, SHA-256, and content-addressed identity. Callers do not manipulate artifact
filesystem paths or compute artifact digests.

### `ClaimCatalog`

```ts
importClaims(document: ArtifactRecord, proposals: ClaimProposalInput[]): Claim[]
```

The module validates Claims against document Anchors and rejects proposals that do not map back to
the exact Document Version. Manual and future generative proposal adapters sit outside this
interface.

### `EvidenceReviewEngine`

```ts
review(claim: Claim, candidate: EvidenceSpan): Promise<EvidenceReview>
```

This is the main deep module. It hides normalization, exact quote location, context selection,
cache identity, model invocation, probability capture, cost accounting, and fail-closed error
handling. A missing exact quote returns `fabricated` without crossing the model seam.

### `EvidenceRelationChecker`

```ts
check(input: RelationInput): Promise<AutomatedAssessment>
```

This seam keeps the review workflow independent from checker availability. V0 has deterministic
fixture replay and an optional Jev adapter; a future local or hosted checker must satisfy the same
contract. The interface accepts only the small state needed for one local relation and returns no
generated text.

### `ReviewLedger`

```ts
apply(state: ReviewState, action: ReviewAction): ReviewState
certify(state: ReviewState, request: CertificationRequest): CertificationResult
```

The module hides append-only event validation, reviewer/action separation, dependency
invalidation, unresolved-item policy, and document/source digest binding. It returns a new
state and has no persistence side effects.

### `ManifestExporter`

```ts
export(state: ReviewState): ReviewManifest
verify(manifest: unknown): VerificationResult
```

The module provides a canonical, schema-valid representation and verifies internal references and
Certification bindings. `verifyProjectArtifacts` separately replays artifact digests and Anchors
from the declared project files; static publication requires both checks. JSON serialization
details remain internal.

## Internal state transitions

```text
proposed ──human approve──► approved
    │                         │
    ├──human reject───────► rejected
    └──human waive────────► waived

approved/waived ──artifact or rubric change──► stale
```

Automated Assessments do not participate in this state machine. They are evidence presented to
the reviewer. `stale` is derived from version binding and cannot be cleared except by a new
Review Action.

## Failure semantics

- Parser or schema failure: stop before model calls.
- Exact quote missing: deterministic `fabricated` assessment.
- Provider timeout/rate limit: retry according to policy, then write a failure receipt.
- Malformed model response: reject it; never coerce to a relation.
- Partial batch completion: persist resumable assessments, but prohibit Certification.
- Artifact digest mismatch: mark affected actions stale and prohibit Certification.
- Unknown manifest version: fail closed and preserve the original bytes.

## Reproducibility identity

An Automated Assessment cache key is the digest of:

```text
claim text + evidence context + exact span + model ID + rubric version + SDK version
```

The model's returned versioned ID is stored in addition to the requested ID. An alias is never
used in a recorded experiment.

## GitHub Pages seam

The Pages build accepts only schema-valid fixture manifests. It contains no processing module,
provider adapter, write endpoint, or credential path. A future authenticated application is a
different deployment and must not be smuggled into the static viewer.
