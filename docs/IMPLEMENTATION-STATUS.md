# Implementation status

Updated: 2026-09-23

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
 fixture replay or pinned Jev Choice
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
- Review Action requirements and unresolved-subject Certification refusal;
- Certification invalidation after state or artifact changes;
- JSON Schema and internal-reference validation;
- artifact and Anchor replay against the declared project files;
- build, review, certify, verify, and static-export CLI integration;
- safe failure receipts and synthetic-only publication gates.

Run `npm run check` from a clean checkout to reproduce this evidence.

## Deliberate non-results

This commit contains no live Jev benchmark result. The adapter is implemented and contract-tested,
but a live run would send text to TypeSafe and requires an approved account/data-handling decision.
The SDK reports input and output tokens but not price, so the manifest records token usage and does
not invent an estimated dollar cost.

The checked-in assessment probabilities are deterministic test fixtures, not measured model
performance. The viewer is a read-only demonstration, not an authenticated review application.

## Next evidence-producing milestone

1. Review the rubric and the outbound text using only synthetic cases.
2. Run an opt-in live adapter smoke test with a hard external budget.
3. Freeze 12–20 gold base memos and their isolated-defect variants.
4. Run the ablations in `EXPERIMENT-PLAN.md` without tuning on the evaluation split.
5. Report paired effect sizes, bootstrap intervals, reviewer time, and every failure receipt.
6. Decide whether to build, narrow, or stop before adding automatic claim extraction or document
   ingestion.

## External decisions still required

- personal GitHub remote and Pages base path;
- open-source license;
- TypeSafe account, retention/region policy, prohibited-data rule, and spend cap;
- final experiment reviewers and gold-label owners.
