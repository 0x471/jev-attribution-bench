# Technical plan

## 1. Decision and hypothesis

Build a local-first vertical slice named **Claim Ledger**. It will not compete with a retrieval
engine or document editor. It will consume candidate evidence, expose the propositions and
load-bearing premises in a draft, and record exactly what a human approved.

The falsifiable hypothesis is:

> Compared with citation-only review, atomic claims plus direct dependency review plus
> exact-version sign-off detect more partial-support, missing-premise, contradiction, and
> stale-approval defects without unacceptable reviewer time.

If the treatment only catches fabricated quotations or irrelevant citations, stop. A simpler
citation checker already solves that problem.

## 2. Non-negotiable invariants

1. Raw draft and source bytes are hashed before extraction or model calls.
2. A Claim always points to an Anchor in one Document Version.
3. An Evidence Span always points to an Anchor in one Source Version.
4. Exact quote containment is checked in code, never delegated to a model.
5. Jev produces an Automated Assessment, never a human Review Action.
6. No confidence threshold may silently create human approval.
7. Any changed Artifact digest invalidates document-level Certification in v0.
8. Every model result records the versioned model ID, rubric version, probabilities, usage,
   timestamp, and a digest of the input state.
9. The static site contains no provider credentials and makes no authenticated model calls.
10. A Review Manifest cannot use the words “true,” “correct,” or “compliant” as a machine conclusion.

## 3. Scope

### V0 input

- One Markdown or plain-text draft, approximately 2–5 pages.
- One to five Markdown or plain-text sources.
- A hand-authored claim file used to test the workflow without confounding claim extraction.
- Optional hand-authored candidate Evidence Spans.

### V0 output

- `manifest.json`, validated against `schemas/review-manifest.schema.json`.
- `review/index.html`, a static viewer for the manifest.
- A machine-readable failure receipt when the run cannot complete.
- A reproducibility receipt containing tool, model, rubric, and artifact versions.

### Explicitly deferred

- DOCX/PDF/OCR ingestion.
- Automatic claim extraction.
- General web search or open-domain fact checking.
- Collaborative editing, authentication, or organization accounts.
- Cryptographic signer identity.
- Carry-forward of approvals after edits.
- Autonomous argument-validity, legal-quality, or clinical-quality scores.
- DocJev classification/splitting unless a later ingestion experiment demonstrates a need.

## 4. Technology choice

- **Runtime:** Node.js 20+ and TypeScript in strict mode.
- **Jev adapter:** `@typesafe-ai/sdk`, pinned to an exact package version.
- **Model:** `jev-1.13.0`, never `jev-latest`, for reproducible experiments.
- **Persistence:** versioned JSON files; no database in v0.
- **Validation:** JSON Schema at every import/export seam.
- **Tests:** deterministic unit tests plus fixture-backed adapter contract tests; live model tests
  are opt-in and budget-capped.
- **UI:** a dependency-light static application that reads exported manifests. GitHub Pages is
  a publishing target, not the processing runtime.

This keeps credentials and sensitive source material in a local process while allowing a
shareable, credential-free Pages demonstration with synthetic fixtures.

## 5. Jev's narrow role

For each `(Claim, Evidence Span)` pair:

1. Normalize whitespace and quotation marks in code.
2. Locate the exact quotation in the complete Source Version.
3. If absent, return `fabricated` without calling Jev.
4. Build a small state containing only the Claim and enough surrounding source context.
5. Ask one `Choice` question with the options:
   - `supports`: the context states the claim or directly implies it;
   - `contradicts`: the context states or directly implies the opposite;
   - `says_nothing`: the context does not establish either direction.
6. Persist the full probability distribution and confidence.
7. Route every v0 assessment to a human. Confidence is displayed and measured, not used to approve.

Jev must not generate claims, summarize whole documents, perform arithmetic, compare dates,
or decide whether a multi-hop argument is globally valid. Those tasks are either deterministic
code, a later generative adapter, or explicit human judgment.

## 6. Delivery sequence

Implementation status is tracked in `IMPLEMENTATION-STATUS.md`. Milestones 0 and 1 are complete;
the offline and adapter portions of Milestone 2 are complete. A live model run and the controlled
experiment remain gated on the external decisions listed there.

### Milestone 0 — foundation review

Deliverables:

- glossary, schema, interfaces, Jev research, threat model, and experiment plan;
- one synthetic legal fixture and one synthetic clinical fixture;
- written go/no-go criteria.

Exit criteria:

- every persisted field has an owner and definition;
- the manifest validates;
- reviewers agree that automated and human states cannot be confused.

### Milestone 1 — deterministic vertical slice

Implement:

- byte-preserving Artifact ingestion and SHA-256 digests;
- normalized extracted text with Anchors;
- import of hand-authored Claims and Evidence Spans;
- exact quote location and fabricated-quote detection;
- append-only Review Ledger reducer;
- Certification invalidation after any byte change;
- manifest export and a fixture-only static viewer.

Required tests:

- a one-byte draft edit invalidates Certification;
- a one-byte source edit invalidates every related Review Action;
- normalized matching tolerates whitespace and curly quotation changes but records the exact source span;
- no model adapter can create a Review Action;
- malformed manifests fail closed with actionable errors.

### Milestone 2 — Jev evidence relation

Implement the Jev adapter behind the `EvidenceRelationChecker` interface.

Required behavior:

- exact SDK and model pin;
- timeout, retry, rate-limit, and cancellation handling;
- content-addressed cache keyed by state, rubric, SDK, and model versions;
- explicit offline fixture adapter for tests and the Pages demo;
- per-run input/output-token accounting; dollar cost only if a reviewed pricing source is added;
- no source text or credentials in logs;
- a review queue for every automated assessment.

Exit criteria:

- the same cached input is replayable without a provider call;
- live and fixture adapters pass the same contract test;
- provider failure produces a failure receipt, never a partial Certification.

### Milestone 3 — controlled experiment

Create 12–20 short gold cases, each with one isolated defect:

- quotation does not exist;
- quotation exists but supports a different proposition;
- compound sentence is only partly supported;
- relevant source contradicts the claim;
- stated premises are supported but a necessary bridge premise is missing;
- evidence supports a narrower claim than the conclusion;
- party, patient, jurisdiction, or date does not match;
- source or draft changes after review.

Run the control and treatment defined in `EXPERIMENT-PLAN.md`. Review every false positive and
false negative. Do not tune thresholds on the final evaluation split.

### Milestone 4 — claim and graph proposals

Only after the hand-authored experiment works, add a generative `ClaimProposer` adapter.
Its outputs remain proposals until the reviewer confirms:

- coverage: every material proposition is represented;
- fidelity: the Claim does not strengthen or change the source sentence;
- atomicity: one Claim can be evaluated independently;
- graph fidelity: each `requires` edge is genuinely load-bearing.

Claim extraction and argument-edge prediction receive their own gold labels and metrics. They
must not be hidden inside an end-to-end score.

### Milestone 5 — document ingestion and distribution

Add PDF/DOCX adapters only after the core experiment succeeds. Preserve raw bytes, extracted
text, page/paragraph anchors, parser name/version, and extraction warnings.

When a personal GitHub remote is available:

- add a Pages workflow that builds only the static viewer and synthetic fixtures;
- use repository environments and least-privilege `pages: write` deployment permissions;
- keep `.env`, real manifests, real documents, caches, and review ledgers out of Pages artifacts;
- publish a visible “synthetic demonstration” banner.

## 7. Definition of done for the PoC

The PoC is complete only when:

- the controlled study is reproducible from a clean checkout;
- the treatment result is reported with uncertainty and reviewer-time cost;
- no stale Certification survives a byte change;
- automated output is visibly distinct from human action in data and UI;
- every manifest can be replayed to the exact artifacts, model, and rubric;
- the static demo contains no secret or real sensitive material;
- a written decision says build, narrow, or stop.

## 8. Stop conditions

Stop or narrow the project if any of these occur:

- atomic review does not improve detection of hidden-premise or partial-support defects;
- claim extraction misses enough material claims to erase the gain;
- reviewers cannot reliably agree on Claims or Argument Edges;
- median review time grows by more than 50% without a material defect-recall gain;
- Jev is no better than a deterministic or local baseline on evidence relation;
- privacy requirements prohibit sending even minimal source spans to the hosted endpoint;
- the UI encourages reviewers to rubber-stamp high-confidence assessments.
