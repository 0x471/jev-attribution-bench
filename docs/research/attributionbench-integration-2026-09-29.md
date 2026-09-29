# AttributionBench integration for Claim Ledger

**Reviewed:** 2026-09-29  
**Decision question:** How should Claim Ledger integrate AttributionBench as a reproducible Jev
evaluation without conflating binary citation attribution with ContractNLI's three-way document
NLI task?  
**Evidence policy:** Primary sources only: the published paper, author-maintained GitHub and
Hugging Face repositories, upstream dataset repositories, and TypeSafe's official documentation
and legal pages. No hosted model call was made while preparing this note.

## Executive decision

Integrate AttributionBench as a **separate binary evaluation lane**:

```text
claim + supplied references -> attributable | not_attributable
```

Do not translate its gold labels into `supports | contradicts | says_nothing`. AttributionBench's
negative class deliberately combines partially supported, unsupported, contradictory, and other
non-fully-attributable cases. It contains no gold distinction between contradiction and missing
support. The primary Jev question must therefore be binary and must require **every material factual
component** of the claim to be supported.

For the first bounded run, use the authors' repository-provided 500-row JSONL artifact, pinned by
revision and SHA-256. Treat it as a standalone published artifact, not as a random or representative sample
of the current configured test split: direct inspection shows that 132 of its 500 IDs do not occur
in the current 1,610-row test file, and the authors do not publish a sampling recipe or seed for the
500 rows.

The implementation should download the raw file into ignored local storage, validate exact
invariants, generate a provenance-rich derived manifest, and make at most 500 fresh Jev calls.
Do not commit or redistribute the raw rows until the project's intended distribution and the
upstream source terms have been reviewed.

## 1. What AttributionBench measures

The paper defines claim-level attribution as deciding whether a claim is supported by its
accompanying evidence. It combines seven earlier datasets and normalizes their labels into a
binary task. Original labels `Attributable`, `Fully attributable`, and `Completely supported`
become positive; every other label, including partial support, becomes negative. See the
[published paper](https://aclanthology.org/2024.findings-acl.886/) and its
[label-processing appendix](https://aclanthology.org/2024.findings-acl.886.pdf).

This evaluates:

- whether the supplied references fully support the supplied claim; and
- whether an automatic evaluator notices unsupported details, contradictions, or incomplete
  support.

It does **not** evaluate:

- whether the claim is true in the world;
- whether the source is reliable or authoritative;
- whether retrieval found the correct source;
- whether a citation link resolves;
- whether `not attributable` means contradiction rather than insufficient evidence; or
- whether a human should approve or certify a document.

This distinction is why AttributionBench must not reuse the ContractNLI three-way report type.

## 2. Official assets and reproducibility pins

The author-maintained [GitHub repository](https://github.com/OSU-NLP-Group/AttributionBench)
currently resolves to commit
[`c81e9e114a074b49b08900afed8811799a308cfe`](https://github.com/OSU-NLP-Group/AttributionBench/tree/c81e9e114a074b49b08900afed8811799a308cfe).
The author-maintained [Hugging Face dataset](https://huggingface.co/datasets/osunlp/AttributionBench)
currently resolves to revision
[`62569e644f4186606f54f742178a4517431b42e1`](https://huggingface.co/datasets/osunlp/AttributionBench/tree/62569e644f4186606f54f742178a4517431b42e1).

Direct inspection of that frozen Hugging Face revision produced:

| Artifact | Rows | SHA-256 |
| --- | ---: | --- |
| `train_all_subset_balanced.jsonl` | 13,322 | `c7d6232048298b8f06afc556214c3739b5432f10f2641db2f73715fd126b1a63` |
| `dev_all_subset_balanced.jsonl` | 1,198 | `a744d1f84e621015f7a7e1941c3fb3f0838be767645dfb2ec784efd3133ab7d6` |
| `test_all_subset_balanced.jsonl` | 1,610 | `c2ff75dd4ea5cf12d86166ead66a96b42d5001a36daf02ff71303ef3317715a8` |
| `test_ood_all_subset_balanced.jsonl` | 1,686 | `90d8f5363cec90197f80b3e896dad17e091a108a5bf282c3d515d48c9a01a934` |
| `test_all_subset_balanced_sampled500.jsonl` | 500 | `67459b19ce853519bed1e39c7585fa41a2c2ea6504139d23453ae4cafb15c02a` |

The configured `subset_balanced` splits contain the first four files. The 500-row file exists in
the official repository but is **not declared as a split in the dataset card's configuration** and
is not mentioned in the README. Pin it through the exact raw-file URL rather than expecting
`datasets.load_dataset(..., split=...)` to expose it:

```text
https://huggingface.co/datasets/osunlp/AttributionBench/resolve/62569e644f4186606f54f742178a4517431b42e1/test_all_subset_balanced_sampled500.jsonl
```

The official schema is documented in the
[dataset card](https://huggingface.co/datasets/osunlp/AttributionBench/blob/62569e644f4186606f54f742178a4517431b42e1/README.md):

```text
question: string
claim: string
claim_raw_string: string
response: string
references: string[]
citation_links: string[]
webpage_references: string[]
attribution_label: "attributable" | "not attributable"
src_dataset: string
id: string
```

## 3. Audit of the repository-provided 500-row artifact

The following are source-file facts, not model results:

| Property | Value |
| --- | ---: |
| Total rows / unique IDs | 500 / 500 |
| `attributable` | 250 |
| `not attributable` | 250 |
| AttributedQA | 72: 36 positive, 36 negative |
| ExpertQA | 190: 95 positive, 95 negative |
| LFQA | 52: 26 positive, 26 negative |
| Stanford-GenSearch | 186: 93 positive, 93 negative |
| Reference passages per row | 1 minimum, 13 maximum, 1.334 mean |
| Concatenated reference characters | 12 minimum, 194,756 maximum, 2,458 mean |
| Unique questions | 282 |
| Unique responses | 363 |
| Rows with non-empty citation links | 186 |
| Rows with non-empty `webpage_references` | 0 |

The file is balanced within every source dataset, but its source sizes differ. A single pooled score
therefore answers a different question from an unweighted average of the four source-level scores.
Report both.

### Material provenance warning

Only 368 of the 500 IDs occur in the current configured 1,610-row in-domain test file. The other
132 are all positively labeled rows: 62 ExpertQA, 51 Stanford-GenSearch, 14 LFQA, and 5
AttributedQA. None of those 132 IDs occurs in the current configured train or development files.
Both files were published together in the official repositories, but no generation script, seed,
or explanation for the difference is provided.

Consequences:

- call the artifact **the authors' repository-provided 500-row sample**;
- do not call it a random sample, a stratified sample, or a strict subset of the current test split;
- do not compare a Jev score on these 500 rows directly with the paper's 1,610-row test-table
  numbers; and
- use the configured 1,610-row test and 1,686-row OOD test if a paper-comparable extension is later
  required.

## 4. Exact frozen adapter

### 4.1 Acquisition

The preparation command should:

1. fetch the exact raw URL at revision `62569e...` into `.cache/attributionbench/`;
2. reject the file unless its SHA-256 is exactly `67459b...`;
3. parse exactly 500 non-empty JSONL records;
4. reject duplicate or empty IDs, claims, references, unknown labels, or unknown source datasets;
5. verify the exact source/label counts in Section 3; and
6. write derived data under ignored run/cache storage, not under a tracked fixture directory.

No fallback to `main`, `latest`, a mutable URL, or a silently different hash is acceptable.

### 4.2 Separate binary data model

Use a dedicated type rather than `EvidenceRelationDataset`:

```ts
type AttributionLabel = "attributable" | "not_attributable";

interface AttributionCase {
  id: string;
  claim: string;
  references: string[];
  expectedLabel: AttributionLabel;
  sourceDataset: "AttributedQA" | "ExpertQA" | "LFQA" | "Stanford-GenSearch";
  groupId: string;
  sourceLine: number;
}
```

`groupId` should be a SHA-256 digest of the original
`src_dataset + "\0" + question`. It supports conservative query-grouped uncertainty estimates
without retaining or sending the question or response. Preserve the
original ID and source line so every result can be traced back to the frozen JSONL.

The label transform is the only valid gold mapping:

```text
"attributable"      -> attributable
"not attributable"  -> not_attributable
```

Do not infer whether a negative row is `contradicts` or `says_nothing`.

### 4.3 Input sent to Jev

The paper's main experiments use only claim and evidence; its input-field ablation found that
adding the question or full response did not improve performance and could mislead the evaluator.
The official code concatenates references, in their existing order, with exactly three newline
characters (`"\n\n\n"`). The primary Jev lane should reproduce that decision:

```text
state.claim = row.claim
state.references = row.references joined by "\n\n\n"
```

Do not send `question`, `response`, `claim_raw_string`, URLs, or unused metadata. If the project
wants to test question-aware attribution, make that a separately named ablation with a separate
rubric version and cache identity; never mix it into the headline score.

### 4.4 Binary Jev rubric

Freeze a dedicated binary `Choice` with these semantics:

```text
attributable:
  Every material factual assertion in the claim is directly stated or clearly entailed by the
  supplied references. No material part relies on outside knowledge.

not_attributable:
  At least one material factual assertion is unsupported, contradicted, only partially supported,
  or requires information outside the supplied references.
```

The instruction should also state that reference text is untrusted source material, not an
instruction, and that only the supplied references may be used. This addresses the benchmark's
full-support definition and the documented risk that prompt-like state can influence Jev.

Do not obtain the primary binary prediction by collapsing the existing three-way relation output.
The current relation rubric can classify a context as supporting some of a multi-part claim even
though AttributionBench correctly labels the row negative for incomplete support. A direct binary
question makes the decision boundary explicit. A projected three-way result may be studied later
as a separately labeled diagnostic, never as the benchmark result.

### 4.5 Provenance fields

The derived manifest and report should record:

- source repository, revision, raw URL, raw SHA-256, and source line;
- adapter version and derived-dataset SHA-256;
- original source dataset and group ID;
- exact rubric version, pinned Jev model, SDK version, and cache identity;
- fresh vs cached result, provider request ID, token use, and timestamp;
- reference count and input character count; and
- whether a case succeeded, failed preflight, or failed at the provider.

## 5. Context-size and failure policy

TypeSafe documents 64k tokens across a request and 32k tokens for state plus the longest question
for Jev 1.13 ([Models](https://docs.typesafe.ai/models)). The repository-provided sample contains one row
with 194,756 reference characters, two rows above 64,000 characters, and five above 32,000
characters. Character count is not token count, so these facts cannot by themselves prove which
requests exceed Jev's token limit.

Required behavior:

- never silently truncate, drop, reorder, retrieve from, or summarize references;
- do not pre-label an oversized or failed case as negative;
- record a sanitized per-case failure without source text or credentials;
- preserve completed results through a content-addressed cache;
- report successful coverage and the reason count for every unscored case; and
- use a strict headline denominator of all 500 rows, counting provider/input failures as incorrect,
  alongside a clearly secondary conditional score over successful calls.

If exact Jev tokenization is later made available, add a deterministic offline preflight. A rough
character heuristic must not silently change the evaluation population.

## 6. Evaluation protocol

### 6.1 Test discipline

The 500 rows are a test artifact. Freeze the adapter and rubric before inspecting Jev errors.
Run one fresh pass. Do not tune on failures and present the same 500 rows as untouched evidence.

If changes are needed:

1. use the configured 1,198-row development split for prompt/adapter development;
2. version the rubric and cache identity;
3. state every change; and
4. rerun the 500-row test only after the change is frozen.

Public model-training contamination is possible because AttributionBench has been public since
2024. The result measures performance on a public test artifact, not guaranteed unseen examples.

### 6.2 Primary metrics

Report:

1. strict accuracy over all 500 rows;
2. pooled binary macro-F1;
3. precision, recall, and F1 for each class;
4. the 2x2 confusion matrix, false-positive count/rate, and false-negative count/rate;
5. macro-F1 for each of the four source datasets;
6. the unweighted mean of those four source-level macro-F1 values, matching the paper's
   source-average convention;
7. binary Brier score from Jev's two probabilities;
8. selective accuracy and coverage at predeclared confidence thresholds;
9. 95% bootstrap intervals grouped by `groupId`, because multiple claims can come from the same
   response; and
10. successful/error coverage, input/output tokens, estimated cost, latency for fresh calls only,
    and cache counts.

There are only 282 unique questions and 363 unique responses among 500 rows, so row-wise bootstrap
intervals would overstate independence. Source-level results also matter: the paper shows large
performance variation between ExpertQA, Stanford-GenSearch, AttributedQA, and LFQA.

### 6.3 Error analysis

Before reading model outputs, predeclare these error buckets:

- unsupported claim component missed;
- contradiction missed;
- partial support treated as full support;
- number, date, entity, or scope mismatch;
- required multi-reference composition missed;
- valid inference rejected;
- ambiguous or incomplete extracted reference;
- likely gold-label/context mismatch;
- over-context or input-size failure; and
- prompt-like or otherwise adversarial reference content.

The paper's manual analysis found that more than 66% of analyzed errors involved fine-grained
information and that 26.8% involved a mismatch between information available to models and human
annotators. This means apparent errors need a human review lane; the raw gold label should not be
silently rewritten.

## 7. ID/OOD extension after the 500-row run

The official subset-balanced configuration is:

| Split | Sources | Rows |
| --- | --- | ---: |
| Train | ExpertQA, Stanford-GenSearch, AttributedQA, LFQA | 13,322 |
| Development | same four in-domain sources | 1,198 |
| Test | same four in-domain sources | 1,610 |
| OOD test | BEGIN, HAGRID, AttrEval-GenSearch | 1,686 |

Every source within these files is label balanced. The OOD file contains 436 BEGIN, 1,088 HAGRID,
and 162 `AttrScore-GenSearch` rows. The published paper calls the final source
`AttrEval-GenSearch`; preserve the actual file value in machine-readable outputs and explain the
naming difference in reports.

Recommended sequence:

1. run the pinned 500-row artifact as a bounded integration result;
2. inspect only enough failures to verify the adapter, not to retune the test;
3. use the 1,198-row development split for any rubric experiment;
4. run the configured 1,610-row in-domain test once; and
5. after a separate licensing/privacy review, run the 1,686-row OOD test and report ID and OOD
   separately.

## 8. License and redistribution caveats

The author Hugging Face card declares `apache-2.0`, and the AttributionBench README asks users to
cite the original datasets. The GitHub repository itself contains no root license file at the
pinned revision. More importantly, AttributionBench aggregates model outputs and excerpts from
other datasets and web/search sources. A top-level metadata label does not by itself establish that
every embedded third-party excerpt is sublicensed under identical terms.

For the four sources in the 500-row artifact:

- [ExpertQA](https://github.com/chaitanyamalaviya/ExpertQA/tree/1aa7ba81bd4c083c12ef1aa2fee338f6cb60fa87)
  publishes an MIT license, but its evidence includes Google search and Sphere results;
- [Stanford-GenSearch](https://github.com/nelson-liu/evaluating-verifiability-in-generative-search-engines/tree/2c6b485ae1c2bd296ad7d5e0eee4da4065535e57)
  publishes an MIT license, while its responses and evidence came from several commercial search
  engines and its questions include third-party sources;
- [AttributedQA](https://github.com/google-research-datasets/Attributed-QA/tree/01f114b203ac98e9374471d26dba5e5e07f93409)
  publishes Apache 2.0 and uses a Wikipedia corpus; and
- [LFQA-Verification](https://github.com/timchen0618/LFQA-Verification/tree/4e905be93fbe919082d62faa77ee32c68e90237c)
  publishes the collected data but has no repository-level license file or licensing statement at
  the reviewed revision.

This is not a legal determination. The operationally conservative design is:

- download from the official pinned source during preparation;
- keep raw and derived text ignored and local;
- commit only adapter code, source pins, hashes, aggregate metrics, and case IDs/error categories;
- preserve the AttributionBench and upstream citations; and
- obtain a licensing review before redistributing raw rows or publishing case-level source text.

## 9. Hosted Jev data and privacy risk

The sample is public, but public data can still contain names, opinions, medical/legal topics, or
other personal data copied from web and community sources. A Jev call transfers the selected text
to TypeSafe's hosted service.

TypeSafe's [privacy policy](https://typesafe.ai/legal/privacy-policy) says it collects prompts,
instructions, and other service input; does not train or fine-tune models on that input; may disclose
input to service providers; retains personal data for as long as reasonably necessary; and hosts
the service in the United States. This is not a zero-retention promise.

Required controls:

- require explicit `--allow-live true`, `--allow-public-benchmark true`, and
  `--allow-public-personal-data true` gates;
- reject any private, credentialed, confidential, or newly user-supplied document in this runner;
- send only claim and references, not the question, full response, URLs, or unrelated fields;
- never put source text, API keys, or provider error bodies in logs or failure receipts;
- keep caches/results mode `0600` in ignored local directories;
- disable automatic retries and enforce a hard uncached-call cap; and
- rotate any API key exposed in chat, logs, screenshots, or shell history.

## 10. Acceptance criteria

The integration is ready for a paid run only when all of the following are true:

- the exact revision and SHA-256 are enforced;
- the 500-row, label, source, uniqueness, and non-empty-reference invariants are tested;
- binary attribution has its own dataset, checker, report, rubric, and cache identity;
- question/response omission and the `"\n\n\n"` reference delimiter are tested;
- partial support is explicitly negative;
- no three-way gold metric is emitted;
- per-source metrics, strict coverage, grouped intervals, and token/cost accounting are present;
- oversized/provider failures cannot disappear from the denominator;
- raw text remains ignored and secrets are absent from tracked files; and
- the full repository test/typecheck/fixture validation suite passes.

## 11. Defensible result wording

After a successful run, say:

> On the authors' pinned, repository-provided 500-row AttributionBench artifact, the pinned Jev binary attribution
> checker classified whether supplied references fully supported a claim with the reported strict
> accuracy, macro-F1, source-level breakdown, uncertainty, coverage, and cost.

Do not say that Jev verified truth, distinguished contradiction from missing evidence, evaluated
retrieval, matched the paper's full-test baseline, generalized to private legal/medical documents,
or was safe to approve claims without human review.

## Primary sources

- AttributionBench: [paper](https://aclanthology.org/2024.findings-acl.886/),
  [official GitHub repository](https://github.com/OSU-NLP-Group/AttributionBench/tree/c81e9e114a074b49b08900afed8811799a308cfe),
  [pinned Hugging Face dataset](https://huggingface.co/datasets/osunlp/AttributionBench/tree/62569e644f4186606f54f742178a4517431b42e1),
  [pinned dataset card](https://huggingface.co/datasets/osunlp/AttributionBench/blob/62569e644f4186606f54f742178a4517431b42e1/README.md), and
  [official inference code](https://github.com/OSU-NLP-Group/AttributionBench/blob/c81e9e114a074b49b08900afed8811799a308cfe/src/inference/run_inference.py).
- ExpertQA: [official repository and license](https://github.com/chaitanyamalaviya/ExpertQA/tree/1aa7ba81bd4c083c12ef1aa2fee338f6cb60fa87).
- Stanford-GenSearch: [official repository and license](https://github.com/nelson-liu/evaluating-verifiability-in-generative-search-engines/tree/2c6b485ae1c2bd296ad7d5e0eee4da4065535e57).
- AttributedQA: [official repository and license](https://github.com/google-research-datasets/Attributed-QA/tree/01f114b203ac98e9374471d26dba5e5e07f93409).
- LFQA: [official repository](https://github.com/timchen0618/LFQA-Verification/tree/4e905be93fbe919082d62faa77ee32c68e90237c).
- TypeSafe: [Jev models and limits](https://docs.typesafe.ai/models),
  [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), and
  [privacy policy](https://typesafe.ai/legal/privacy-policy).
