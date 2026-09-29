# Jev live integration smoke test

Date: 2026-09-24  
Model: `jev-1.13.0`  
SDK: `@typesafe-ai/sdk@0.6.0`

## What this tested

This was a bounded development check of the Claim Ledger `EvidenceRelationChecker`, not a model
benchmark or production-readiness claim. All inputs were synthetic and non-sensitive. Jev received
one atomic claim and one short evidence context per call and selected one closed relation:

```text
supports | contradicts | says_nothing
```

The 15-case development set is balanced across the three labels and includes paraphrase, numeric
and entity mismatch, negation, partial support, party mismatch, missing consequences, irrelevant
context, and prompt-like text embedded in a source passage. The labels were authored for this
smoke test and have not received independent expert adjudication.

## Results

Two fresh passes were run after the live adapter was enabled. Retries were disabled, the model and
SDK were pinned, and each pass had a hard 15-call limit.

| Metric | Pass 1 | Pass 2 |
| --- | ---: | ---: |
| Cases | 15 | 15 |
| Accuracy | 100% | 100% |
| Macro-F1 | 100% | 100% |
| Multiclass Brier score (lower is better) | 0.0181 | 0.0209 |
| Input tokens | 6,376 | 6,376 |
| Output tokens | 690 | 690 |
| Mean request latency | 649 ms | 483 ms |
| Estimated input cost | $0.000268 | $0.000268 |

All 30 labels matched the authored labels. This does **not** establish 100% general accuracy: the
set is tiny, synthetic, visible to the developer, and deliberately diagnostic rather than
representative. It is enough to show that the real API, pinned model, three-way rubric, response
validation, token accounting, and local report path work together.

The output distributions were not bit-for-bit identical between passes even though the selected
labels were stable. The hardest case—an unsupported service-suspension consequence—returned
`says_nothing` with probabilities 0.65 and 0.62 and confidence 0.47 and 0.43. This reinforces the
design decision to preserve distributions, avoid treating confidence as approval, and replay
cached artifacts rather than assuming deterministic re-inference.

A separate two-relation end-to-end project build was run twice: once for initial activation and
once after provider request-ID capture was added. Each used 928 input and 88 output tokens, cost an
estimated $0.000039, produced a schema-valid unapproved manifest, and resolved the concrete model
to `jev-1.13.0`. Rebuilding from its cache succeeded under a one-call cap, demonstrating that
cache hits do not spend the provider-call budget.

Across the two evaluation passes and two end-to-end smoke builds, local accounting recorded 14,608
input and 1,556 output tokens, or approximately **$0.000614** at the published $0.042/M input-token
price. Output tokens are currently free. The TypeSafe console remains authoritative because no
public balance API is documented.

## Reproduce safely

Put a rotated key in ignored `.env`, confirm automatic refill is disabled, and run:

```sh
npm run eval:jev -- \
  --allow-live true \
  --max-provider-calls 15 \
  --timeout-ms 30000 \
  --cache .cache/jev-eval \
  --out runs/jev-evidence-relations-dev/report.json
```

The runner refuses non-synthetic datasets, disables retries, validates every response, stores
provider request IDs when returned, writes reports with owner-only permissions, and emits a
sanitized failure receipt instead of a partial success report. `runs/`, `.cache/`, and `.env` are
ignored by Git.

To exercise the complete manifest path with two synthetic relations:

```sh
npm run claim-ledger -- build \
  --project fixtures/synthetic/project.json \
  --checker jev \
  --allow-live true \
  --max-provider-calls 2 \
  --timeout-ms 30000 \
  --cache .cache/jev-smoke \
  --out work/jev-smoke-manifest.json
```

## What should happen next

1. Independently review the case labels and add harder ambiguous, temporal, multi-clause, and
   domain-expert cases before making any accuracy claim.
2. Freeze a development/test split and compare Jev with deterministic containment and a reviewed
   local NLI baseline using the same inputs.
3. Add repeated fresh inference only to measure label stability and calibration; cached replay is
   the default for the workflow experiment.
4. Keep real legal or clinical documents out of the hosted path until retention, region, and
   prohibited-data rules are approved for the actual account.
5. Do not add automatic approval thresholds until they are calibrated against independently
   labeled cases and asymmetric error costs.
