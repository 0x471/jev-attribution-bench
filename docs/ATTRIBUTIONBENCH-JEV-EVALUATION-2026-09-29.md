# AttributionBench evaluation of the Jev attribution checker

**Run date:** 2026-09-29  
**Model:** `jev-1.13.0`  
**Rubric:** `attributionbench-binary-v1`  
**SDK:** `@typesafe-ai/sdk@0.6.0`

## Result in one paragraph

Jev classified whether supplied references fully support a claim with **70.8% conditional
accuracy** on 1,594 evaluable rows from AttributionBench's 1,610-row in-domain test and **81.2%**
on 1,611 evaluable rows from its 1,686-row out-of-domain test. The stricter scores, which count
every excluded row as incorrect, are **70.1% ID** and **77.6% OOD**. In-domain performance is
uneven: LFQA and AttributedQA are above 81% accuracy, while ExpertQA is 56.7%. Jev also has a
substantial in-domain false-negative rate of 40.7%, so it is not suitable as an autonomous
approval gate. Provider confidence can prioritize review, but even at confidence >=0.95 the ID
accuracy is only 77.7% over 45.0% of evaluable cases.

This measures **claim-to-reference attribution**, not factual truth, retrieval quality, source
reliability, or end-to-end document review.

## Why this benchmark

[AttributionBench](https://aclanthology.org/2024.findings-acl.886/) aggregates citation-attribution
examples into a binary task: a claim is positive only when every material factual component is
supported by the supplied references. Partial support, contradiction, and missing support are all
negative. That is a closer match for citation checking than projecting the existing ContractNLI
three-way relation task into a binary label.

The integration therefore has its own dataset type, Jev rubric, cache namespace, report, and
metrics. It does not change or reuse the `supports | contradicts | says_nothing` gold semantics.

## Frozen protocol

- Official data revision:
  [`62569e644f4186606f54f742178a4517431b42e1`](https://huggingface.co/datasets/osunlp/AttributionBench/tree/62569e644f4186606f54f742178a4517431b42e1)
- Official code revision:
  [`c81e9e114a074b49b08900afed8811799a308cfe`](https://github.com/OSU-NLP-Group/AttributionBench/tree/c81e9e114a074b49b08900afed8811799a308cfe)
- ID test SHA-256: `c2ff75dd4ea5cf12d86166ead66a96b42d5001a36daf02ff71303ef3317715a8`
- OOD test SHA-256: `90d8f5363cec90197f80b3e896dad17e091a108a5bf282c3d515d48c9a01a934`
- Input to Jev: `claim` plus references in source order, joined by exactly `"\n\n\n"`
- Omitted from Jev: question, full response, URLs, labels, and dataset metadata
- Decision rule: positive only if every material assertion is directly stated or clearly entailed
- Retries: disabled
- Context policy: no truncation, summarization, retrieval, dropping, or reordering
- Uncertainty: 2,000 deterministic bootstrap samples grouped by source dataset plus question
- Pricing used: $0.042 per million input tokens and $0 output, verified from
  [TypeSafe's model page](https://docs.typesafe.ai/models) on 2026-09-29

The conservative 32,000-character adapter preflight is not a claim about exact Jev tokenization.
It prevents silent modification while TypeSafe does not publish an offline tokenizer. Exclusions
remain in the strict denominator.

## Headline results

| Metric | In-domain test | Out-of-domain test |
| --- | ---: | ---: |
| Official source rows | 1,610 | 1,686 |
| Evaluated rows | 1,594 | 1,611 |
| Coverage | 99.0% | 95.6% |
| Conditional accuracy | 70.8% | 81.2% |
| Grouped bootstrap 95% interval | 67.7–73.7% | 79.0–83.4% |
| Strict all-row accuracy | 70.1% | 77.6% |
| Macro-F1 | 70.4% | 81.1% |
| Grouped macro-F1 95% interval | 67.3–73.3% | 78.8–83.4% |
| Binary Brier score (lower is better) | 0.238 | 0.149 |
| False-positive rate | 17.6% | 21.9% |
| False-negative rate | 40.7% | 16.0% |
| High-confidence errors (`confidence >= 0.9`) | 195 | 81 |
| Input / output tokens | 1,291,776 / 69,521 | 1,027,892 / 70,014 |
| Estimated input cost | $0.0543 | $0.0432 |
| Mean fresh-call latency | 250 ms | 257 ms |

The separate repository-provided 500-row smoke artifact reached 67.7% conditional accuracy and
67.0% strict accuracy at $0.0169. It is not the headline result: 132 of its IDs are absent from the
current configured ID test, and the authors publish neither a sampling seed nor a generation
recipe for it.

## Results by source

| Split / source | Evaluated / source | Coverage | Accuracy | Macro-F1 |
| --- | ---: | ---: | ---: | ---: |
| ID / AttributedQA | 230 / 230 | 100.0% | 81.7% | 81.7% |
| ID / ExpertQA | 603 / 612 | 98.5% | 56.7% | 55.8% |
| ID / LFQA | 168 / 168 | 100.0% | 82.7% | 82.4% |
| ID / Stanford-GenSearch | 593 / 600 | 98.8% | 77.4% | 77.2% |
| OOD / AttrScore-GenSearch | 162 / 162 | 100.0% | 79.0% | 78.4% |
| OOD / BEGIN | 436 / 436 | 100.0% | 85.8% | 85.8% |
| OOD / HAGRID | 1,013 / 1,088 | 93.1% | 79.6% | 79.3% |

The unweighted mean of source-level macro-F1 is 74.3% ID and 81.2% OOD. The pooled and
source-mean results differ because source sizes differ substantially.

## Confidence as a review policy

| Minimum provider confidence | ID coverage / accuracy | OOD coverage / accuracy |
| ---: | ---: | ---: |
| 0.00 | 100.0% / 70.8% | 100.0% / 81.2% |
| 0.70 | 72.5% / 75.4% | 71.5% / 86.6% |
| 0.90 | 53.1% / 77.0% | 51.6% / 90.3% |
| 0.95 | 45.0% / 77.7% | 41.0% / 91.5% |

Confidence is useful for routing, not certification. The ID lane still contains 195 wrong answers
at confidence >=0.9. A sensible product policy is to surface low-confidence cases first while
requiring human review for every consequential decision.

## Exclusions and data defects

- ID: 16 rows exceeded the adapter's conservative context-character cap.
- OOD: 75 HAGRID rows contain an empty `references` array in the official frozen file. Ten are
  labeled attributable and 65 not attributable.

Empty-reference rows were not automatically labeled negative. Doing so would hard-code most of
their gold labels and still make the ten positive cases impossible to judge. Both kinds of
exclusion count as incorrect in strict accuracy.

## Reproduce

Keep raw benchmark text and result caches local. The repository records hashes and aggregate
metrics, not redistributed source passages.

```sh
mkdir -p .cache/datasets/attributionbench

curl -fL \
  'https://huggingface.co/datasets/osunlp/AttributionBench/resolve/62569e644f4186606f54f742178a4517431b42e1/test_all_subset_balanced.jsonl' \
  -o .cache/datasets/attributionbench/test_all_subset_balanced.jsonl

curl -fL \
  'https://huggingface.co/datasets/osunlp/AttributionBench/resolve/62569e644f4186606f54f742178a4517431b42e1/test_ood_all_subset_balanced.jsonl' \
  -o .cache/datasets/attributionbench/test_ood_all_subset_balanced.jsonl

npm run prepare:attributionbench -- \
  --artifact id-test \
  --source .cache/datasets/attributionbench/test_all_subset_balanced.jsonl \
  --out runs/attributionbench-id-test/dataset.json \
  --max-context-characters 32000

npm run prepare:attributionbench -- \
  --artifact ood-test \
  --source .cache/datasets/attributionbench/test_ood_all_subset_balanced.jsonl \
  --out runs/attributionbench-ood-test/dataset.json \
  --max-context-characters 32000
```

After setting `TYPESAFE_API_KEY` in the ignored `.env`, run each split with all explicit data and
spend gates. The hard call cap must equal the prepared case count:

```sh
npm run eval:attributionbench -- \
  --allow-live true \
  --allow-public-benchmark true \
  --allow-public-personal-data true \
  --allow-untrusted-web-text true \
  --dataset runs/attributionbench-id-test/dataset.json \
  --cache .cache/jev-attributionbench-id-test-v1 \
  --out runs/attributionbench-id-test/jev-1.13.0.json \
  --max-provider-calls 1594 \
  --timeout-ms 30000
```

Use a distinct cache and output directory for OOD and set `--max-provider-calls 1611`.

## What this result does not establish

- The OOD score being higher does not prove broad generalization; the source mix and difficulty
  differ, and 75 missing-reference rows reduce strict performance.
- AttributionBench is public, so training-data contamination cannot be ruled out.
- A binary negative does not distinguish contradiction, partial support, or missing evidence.
- The benchmark supplies references. It does not test retrieval, document parsing, citation-link
  resolution, or source quality.
- Aggregate upstream redistribution rights are not fully documented. Raw text stays ignored and
  local pending review.
- The result does not justify autonomous approval in legal, clinical, or other consequential use.

For the source audit, licensing/privacy analysis, and exact adapter rationale, see
[the integration research note](./research/attributionbench-integration-2026-09-29.md).
