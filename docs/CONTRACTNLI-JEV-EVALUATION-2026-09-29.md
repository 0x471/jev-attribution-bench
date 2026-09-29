# Jev on ContractNLI: development evaluation

**Run date:** 2026-09-29  
**Model:** `jev-1.13.0`  
**Source:** ContractNLI development split, revision
`eced6528dd3c1d14d73f9a87df8f7bdbc03126f9`  
**Status:** development evidence, not a production or legal-accuracy claim

## Why this dataset

The original 15-case fixture only proved that the Jev adapter worked. It was synthetic, visible to
the developer, and too small for a useful accuracy estimate. ContractNLI is a public CC BY 4.0
dataset of 607 non-disclosure agreements with 17 fixed legal hypotheses, three document-level
labels, and annotated evidence spans. Its labels map to Claim Ledger as follows:

| ContractNLI | Claim Ledger |
| --- | --- |
| `Entailment` | `supports` |
| `Contradiction` | `contradicts` |
| `NotMentioned` | `says_nothing` |

The official development split contains 61 contracts and 1,037 labeled contract/hypothesis
decisions: 519 entailments, 95 contradictions, and 423 not-mentioned cases. The exact source
`dev.json` SHA-256 is
`310af7d661d2ab50ee3700169cef524c75f39fb296bbf5a515c229eb0f42e68e`.

See the [ContractNLI paper](https://aclanthology.org/2021.findings-emnlp.164.pdf),
[official repository](https://github.com/stanfordnlp/contract-nli/tree/eced6528dd3c1d14d73f9a87df8f7bdbc03126f9),
and [license](https://github.com/stanfordnlp/contract-nli/blob/gh-pages/LICENSE).

## Two different tracks

These tracks answer different questions and their scores must not be conflated.

1. **Faithful document NLI.** Jev receives the hypothesis and complete contract. This preserves
   ContractNLI's original task, so all 1,037 development decisions are valid benchmark rows. It
   combines finding relevant content with relation classification and is not a pure citation check.
2. **Derived citation relation.** Positive and contradiction rows receive all human-annotated gold
   spans; not-mentioned rows receive the three BM25 passages most similar to the hypothesis. This
   better isolates the supplied-passage checker, but it is an asymmetric adaptation. Manual error
   review found that some document-level labels are ambiguous when projected onto isolated spans,
   so this track is diagnostic only.

No test-split result was inspected or used. Sampling used a stable SHA-256 ordering and seed. The
model, SDK, rubric, source revision, source hash, and preparation recipe are recorded in every
report. Raw source data and run artifacts remain ignored rather than being copied into the repo.
ContractNLI is public, but its source contracts may contain public names or contact details. The
dataset manifest records that fact, and hosted runs require a separate
`--allow-public-personal-data true` opt-in; private or confidential data remains prohibited.

## Results

### Full, faithful development split

| Metric | Result |
| --- | ---: |
| Contracts / decisions | 61 / 1,037 |
| Accuracy | **72.4%** |
| 95% cluster-bootstrap interval | **70.5%–74.3%** |
| Macro-F1 | **66.0%** |
| 95% cluster-bootstrap interval | **63.5%–68.5%** |
| Multiclass Brier score | 0.429 |
| Input / output tokens | 2,946,348 / 47,012 |
| Successful-call input-cost estimate | **$0.123747** |
| Mean latency | Not reported; the final report mixed resumed cache hits with live calls |

The intervals use 10,000 deterministic percentile-bootstrap samples grouped by contract. Grouping
matters because the 17 rows from one contract are correlated.

| Expected ↓ / predicted → | supports | contradicts | says nothing | Recall |
| --- | ---: | ---: | ---: | ---: |
| supports | 450 | 60 | 9 | 86.7% |
| contradicts | 19 | 75 | 1 | 78.9% |
| says nothing | 112 | 85 | 226 | **53.4%** |

Per-class precision/F1 were 77.5%/81.8% for support, 34.1%/47.6% for contradiction, and
95.8%/68.6% for says-nothing. The low contradiction precision is caused largely by supported or
unmentioned propositions being called contradictions.

### Controlled 90-case checks

| Track | Fresh passes | Cases/pass | Accuracy | Macro-F1 | Label agreement | Max probability drift | Input tokens/pass | Cost/pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| faithful full document, balanced | 2 | 90 | 80.0% both | 80.3% both | 100.0% | 0.10 | 267,895 | $0.011252 |
| derived passage relation, balanced | 2 | 90 | 85.6% both | 85.6% both | 96.7% | 0.09 | 49,555 | $0.002081 |

The derived track's equal aggregate accuracy hides three label flips between passes. It is not
deterministic merely because both passes round to 85.6%.

Across the full run and four controlled passes, Jev reported 3,581,248 input tokens and 63,504
output tokens. The successful-call input-cost estimate was **$0.150412**. This excludes the earlier
synthetic smoke and any provider-side treatment of four interrupted requests.

## What we learned

1. **The small synthetic result did not generalize.** `15/15` was integration evidence only. On
   the full public development set, accuracy was 72.4% and macro-F1 was 66.0%.
2. **Abstention is the main failure.** Only 226 of 423 not-mentioned cases were recognized. Jev
   over-committed on 197 of them instead of saying the contract was insufficient.
3. **Confidence is useful for triage but is not calibrated approval.** There were 131 errors with
   confidence at least 0.8. A post-run diagnostic threshold of 0.9 retained 57.6% of cases at 86.8%
   accuracy; even that is not safe for automatic legal approval.
4. **Performance varies sharply by legal question.** Accuracy was 6.6% on “no licensing” and 31.1%
   on “permissible copy”, but 100% on “no reverse engineering” and “notice on compelled
   disclosure”. An aggregate score hides this brittleness.
5. **Whole-document Jev is the wrong product architecture.** The score is useful as a control, but
   Claim Ledger should retrieve complete candidate evidence first, preserve definitions and
   exceptions, and then ask Jev for a narrow pairwise judgment. Human review remains the authority.
6. **The harness needed stricter accounting.** The provider interrupted four times during the full
   pass. Content-addressed caching allowed safe resumption without duplicating successful calls.
   The reporter now suppresses latency for mixed cache/live runs and stores only sanitized failure
   metadata.

## Reproduction

Review ContractNLI's terms before downloading. Obtain the official release at the pinned revision
and place its unmodified `dev.json` outside version control. The preparation command verifies the
file hash and refuses a different release.

```bash
npm run prepare:contractnli -- \
  --source .cache/datasets/contract-nli/contract-nli/dev.json \
  --out runs/contractnli-document-dev-full/dataset.json \
  --mode document \
  --per-label all \
  --negative-passages 3 \
  --seed claim-ledger-contractnli-dev-v1

npm run eval:jev -- \
  --allow-live true \
  --allow-public-benchmark true \
  --allow-public-personal-data true \
  --dataset runs/contractnli-document-dev-full/dataset.json \
  --cache .cache/jev-contractnli-document-full-v1 \
  --out runs/contractnli-document-dev-full/jev-1.13.0-pass-1.json \
  --max-provider-calls 1037 \
  --timeout-ms 30000

npm run analyze:contractnli -- \
  --report runs/contractnli-document-dev-full/jev-1.13.0-pass-1.json \
  --out runs/contractnli-document-dev-full/analysis.json \
  --bootstrap-repetitions 10000
```

If a run resumes after a provider interruption, regenerate its final report with
`--latency-mode mixed-cache`; mixed cache/live latency must not be reported as provider latency.

## Limits and next decision

- This is a public development split, not a hidden held-out set. Training contamination is
  possible, and the result must not be tuned and then presented as independent evidence.
- The domain is NDAs and only 17 repeated hypotheses. It does not establish general legal,
  healthcare, or citation-verification accuracy.
- The full-document track includes retrieval/attention failures. The passage track bypasses
  positive retrieval and contains projection ambiguity. Neither alone evaluates the complete
  product.
- There is not yet a matched deterministic or frontier-model baseline.

The next clean citation-specific benchmark should be AttributionBench's author-published 500-row
sample, scored as binary `supports` versus `not attributable`. Contradiction and silence must be
collapsed because AttributionBench does not label that distinction. After that, use SciFact dev
for scientific/biomedical transfer only if its CC BY-NC 2.0 terms are acceptable.
