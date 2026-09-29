# Implementation status

Updated: 2026-09-29

## Completed vertical slice

The local, text-only v0 path is implemented end to end:

```text
project + exact artifact bytes
             │
             ▼
     hash and anchor text
             │
             ▼
 deterministic quote check ──missing──► fabricated assessment
             │ exact
             ▼
 fixture replay or optional checker adapter
             │
             ▼
 unapproved manifest ──human actions──► optional exact-version Certification
             │
             ├── verify artifacts, anchors, references, and Certification
             └── export synthetic-only static viewer
```

The implementation enforces the central boundary: model confidence is recorded but cannot
create a Review Action. Certification requires an explicit current human decision for every
Claim, Evidence Relation, and Argument Edge.

## Verification evidence

The automated suite covers:

- byte-preserving hashing and unsupported-format rejection;
- whitespace and curly-quote normalization while preserving the exact source span;
- missing-quote short-circuit without a checker call;
- pinned Jev request shape, probability validation, retries/timeouts, and semantic cache keys;
- malformed fixture/provider response rejection;
- adversarial source instructions remain inert state and cannot alter the fixed rubric/model request;
- Review Action requirements and unresolved-subject Certification refusal;
- Certification invalidation after state or artifact changes;
- JSON Schema and internal-reference validation;
- documented semantic ownership for every persisted v0 field;
- artifact and Anchor replay against the declared project files;
- build, review, certify, verify, and static-export CLI integration;
- safe failure receipts and synthetic-only publication gates.
- explicit live Jev approval, synthetic/public-benchmark data classification, separate
  public-benchmark and public-personal-data opt-ins, private/confidential-data rejection, hard
  uncached-call limits, disabled retries, provider request-ID capture, and local token/cost
  accounting;
- a balanced 15-case synthetic Jev development runner with confusion matrix, macro-F1, Brier score,
  latency, usage, and case-level receipts.
- a pinned ContractNLI adapter with faithful document-level and derived citation-relation modes,
  deterministic balanced/full sampling, source/license/hash provenance, grouped bootstrap analysis,
  and a full 1,037-case development result.
- a separate pinned AttributionBench binary checker and dataset lane with exact source hashes,
  no-truncation preflight, ID/OOD preparation, source-line and query-group provenance, grouped
  bootstrap intervals, source-level and selective metrics, and strict failure coverage.

Run `npm run check` from a clean checkout to reproduce this evidence.

## Current live evidence and deliberate limitations

The live adapter completed a bounded synthetic smoke test on 2026-09-24. Two independent passes
over 15 authored development cases produced 100% label accuracy and macro-F1, while an end-to-end
two-relation project build produced a schema-valid unapproved manifest. This is integration
evidence only: the cases are small, synthetic, developer-visible, and not independently
adjudicated. See `JEV-LIVE-SMOKE-2026-09-24.md` for exact usage, latency, cost, and limitations.

On 2026-09-29, the pinned adapter also completed the full 1,037-relation ContractNLI development
split. It reached 72.4% accuracy and 66.0% macro-F1; says-nothing recall was only 53.4%, with 131
high-confidence errors. This is public development evidence on 61 NDAs, not a held-out product
claim. See `CONTRACTNLI-JEV-EVALUATION-2026-09-29.md` for the protocol, confidence intervals,
cost, error analysis, and reproduction commands.

The CLI still refuses real, sensitive, or non-fixture projects. The provider does not expose a
documented balance API, so local cost is an estimate from response tokens and the current published
price; the console is authoritative. Live checker access remains unnecessary for the controlled
workflow experiment.

The checked-in assessment probabilities are deterministic test fixtures, not measured model
performance. The viewer is a read-only demonstration, not an authenticated review application.

The 2026-09-29 AttributionBench run evaluated the full configured test files separately. Jev
reached 70.8% conditional / 70.1% strict accuracy on the 1,610-row in-domain test and 81.2%
conditional / 77.6% strict accuracy on the 1,686-row OOD test. ExpertQA was the weakest ID source
at 56.7% accuracy, and the ID false-negative rate was 40.7%. This supports a human-review routing
experiment, not autonomous approval. See `ATTRIBUTIONBENCH-JEV-EVALUATION-2026-09-29.md`.

## Next evidence-producing milestone

1. Freeze 12–20 gold base memos and their isolated-defect variants.
2. Freeze one reviewed assessment set and replay it identically in both study conditions.
3. Run the provider-independent workflow ablations in `EXPERIMENT-PLAN.md` without tuning on the
   evaluation split.
4. Report paired effect sizes, bootstrap intervals, reviewer time, and every failure receipt.
5. Add matched deterministic and frontier-model AttributionBench baselines, then manually label a
   frozen error-analysis sample without tuning on the test files.
6. Decide whether to build, narrow, or stop before adding automatic claim extraction or document
   ingestion.

## External decisions still required

- personal GitHub remote and Pages base path;
- open-source license;
- checker retention/region policy, prohibited-data rule, and production spend control;
- final experiment reviewers and gold-label owners.
