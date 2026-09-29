# Public datasets for evaluating Jev evidence relations

**Reviewed:** 2026-09-29  
**Decision question:** Which public, reproducible dataset should replace the current 15-case
synthetic smoke fixture when evaluating the narrow Claim Ledger task
`claim + supplied evidence context -> supports | contradicts | says_nothing`?  
**Evidence policy:** Primary sources only: original papers, author-maintained repositories and
dataset cards, official dataset files, and first-party license text. No API key was used and no
benchmark was run while preparing this note.

## Executive conclusion

There is no single public dataset that tests every part of Claim Ledger. The datasets split into
three different questions:

1. **Can the checker classify the semantic relationship between a claim and supplied evidence?**
   ContractNLI, VitaminC, and SciFact are suitable.
2. **Does a citation fully support a generated claim?** AttributionBench is the closest direct
   benchmark, but its label is binary rather than three-way.
3. **Can the system find the correct evidence in a long document?** EvidenceBench and the original
   end-to-end forms of ContractNLI/SciFact address retrieval, not just Jev's relation judgment.

The best first integration is a **frozen, balanced 90-case sample from the official ContractNLI
development split: 30 Entailment, 30 Contradiction, and 30 NotMentioned cases**. It gives an exact
three-way label mapping, exercises legal language and non-contiguous evidence, has a permissive
CC BY 4.0 license, and is small enough for a controlled paid smoke run. It is still a development
benchmark, not the final accuracy result.

The next two additions should be:

- the author-provided **500-row balanced AttributionBench test sample** for direct binary citation
  correctness; and
- **SciFact development** for biomedical/scientific evidence, provided the project is comfortable
  with its non-commercial license.

Do **not** send MedNLI/MIMIC-derived text to hosted Jev. PhysioNet explicitly says credentialed data
must not be shared with third-party services unless the service's controls satisfy the DUA, and its
guidance warns against online LLM/API use without verified zero retention.

## What this benchmark should mean

The benchmark input must contain exactly:

```text
claim: one atomic proposition
context: the complete supplied evidence passage or evidence set
expected_relation: supports | contradicts | says_nothing
```

The labels mean:

- `supports`: the supplied context states the claim or directly entails it;
- `contradicts`: the supplied context states or directly entails the opposite; and
- `says_nothing`: the supplied context establishes neither direction.

This evaluates **conditional attribution**: whether the claim follows from the text supplied to
Jev. It does not evaluate real-world truth, source authority, retrieval recall, quotation existence,
document parsing, or whether a human should approve the claim.

## Comparison

| Dataset | Unit and public size | Label fit | Evidence granularity | Negative-label quality | Domain | License / reproducibility | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **ContractNLI** | 607 NDAs; 423/61/123 documents in train/dev/test; 17 fixed hypotheses per document | Exact three-way mapping | Character-offset sentence/list-item spans; multiple non-contiguous spans allowed | `NotMentioned` is annotated against the whole contract, so a selected subset is a defensible negative; positive/contradiction spans are explicitly marked | Legal contracts | CC BY 4.0; author ZIP and JSON; official dev SHA-256 recorded below | **Integrate first** |
| **VitaminC** | 488,904 claim/evidence rows on the current author dataset card; 370,653/63,054/55,197 train/dev/test | Exact `SUPPORTS`/`REFUTES`/`NOT ENOUGH INFO` mapping | Usually one edited Wikipedia sentence | Excellent hard minimal pairs: near-identical evidence flips the answer; real and synthetic subsets | General Wikipedia facts | Wikipedia/CC BY-SA 3.0 terms; author HF snapshot is directly downloadable | Add as a contrastive stress test |
| **SciFact** | 1,409 claims; 809/300/300 train/dev/test; corpus of 5,183 abstracts | Exact `SUPPORTS`/`REFUTES`/`NOINFO` mapping | Abstract-level labels plus minimal rationales of at most three sentences | Cited abstracts are explicitly labeled; NOINFO is topic-related rather than an arbitrary random negative | Biomedical and scientific literature | CC BY-NC 2.0; official repo/download script; public test labels are withheld | Best open biomedical follow-up, but non-commercial |
| **AttributionBench** | 13,322/1,198/1,610 balanced ID train/dev/test plus 1,686 OOD test; official 500-row test sample | Binary only: attributable vs not attributable | One claim with one or more cited reference passages | Real attribution failures and mixed sources, but negative examples do not distinguish contradiction from missing support | General QA, dialogue, generative search | Apache 2.0 on author HF repository; direct JSONL files | Best direct citation benchmark after ContractNLI |
| **FEVER** | 185,445 claims; train 145,449 and balanced dev/test of 19,998 each | Three claim labels, but NEI has no evidence passage | Minimal evidence sets; 16.82% require more than one sentence | Support/refute evidence is strong; NEI cannot become a pairwise context without adding a negative-selection rule | General Wikipedia facts | Wikipedia/CC BY-SA 3.0 terms; official data and scorer | Useful control, not the first adapter |
| **TRUE** | 11 source datasets standardized as grounding text + generated text + binary label | Binary grounded/ungrounded only | Often a whole source article, dialogue grounding, or summary source | Preserves source-dataset labels; paper found label errors concentrated among hard cases | Summarization, dialogue, paraphrase, fact verification | Code is Apache 2.0; data is downloaded from upstream projects and retains their terms | Good cross-task robustness suite; weak three-way fit |
| **EvidenceBench** | 426 original biomedical papers (96/37/293) and 107,461-item 100k version (87,461/20,000) | No relation label | Whole paper split into candidate sentences; aspect-to-evidence mappings | High-value positive evidence annotations, but no support/refute/neutral verdict for Jev | Biomedical papers | Test set CC BY; train/dev CC BY-NC-SA; 100k CC BY-NC | Use for retrieval, not Jev relation accuracy |
| **AVeriTeC** | 4,568 real-world claims with web evidence QA pairs | Four claim-level verdicts, including conflicting evidence | Multiple question-answer evidence records and justifications | Real-world and temporally controlled, but verdict is produced from a set of evidence, not one claim/passage pair | Open-web fact checking | CC BY-NC 4.0; official repo and evaluator | Later system-level evaluation, not a pairwise fixture |
| **MedNLI** | Clinical premise/hypothesis pairs with entailment, contradiction, neutral | Exact label vocabulary | One clinical-note sentence and one hypothesis | Human-authored clinical NLI, but known hypothesis artifacts and restricted provenance | Clinical notes | PhysioNet credentialed license; no redistribution; online API use is constrained | **Do not use with hosted Jev** |

Counts above come from the cited papers or author-maintained dataset files. Hugging Face loaders can
expand one claim into multiple rows; use the paper's claim counts when describing FEVER or SciFact.

## Dataset details

### 1. ContractNLI — recommended first dataset

ContractNLI asks whether one of 17 fixed hypotheses is `Entailment`, `Contradiction`, or
`NotMentioned` with respect to an NDA and identifies all supporting evidence spans for the first
two labels. Evidence spans are sentences or inline list items and may be non-contiguous. The paper
reports 607 documents split 423/61/123 and an average document length of 2,254 tokens; 86% exceed
512 tokens. The hypotheses were reviewed by paralegals. Annotation combined a primary
computational-linguistics researcher with two selected Mechanical Turk workers, followed by
primary-annotator review; most development documents were annotated exclusively by the primary
annotator. See the [paper](https://aclanthology.org/2021.findings-emnlp.164.pdf) and the
[official dataset specification](https://stanfordnlp.github.io/contract-nli/).

Direct inspection of the official `dev.json` at repository revision
[`eced6528dd3c1d14d73f9a87df8f7bdbc03126f9`](https://github.com/stanfordnlp/contract-nli/tree/eced6528dd3c1d14d73f9a87df8f7bdbc03126f9)
produced:

| Property | Value |
| --- | ---: |
| Development documents | 61 |
| Document/hypothesis relations | 1,037 |
| Entailment | 519 |
| Contradiction | 95 |
| NotMentioned | 423 |
| Gold positive/contradiction spans | 1,228 |
| SHA-256 of unzipped `dev.json` | `310af7d661d2ab50ee3700169cef524c75f39fb296bbf5a515c229eb0f42e68e` |

The official test file has 123 documents and 2,091 document/hypothesis relations: 968 Entailment,
220 Contradiction, and 903 NotMentioned. Its public labels make it reproducible, but they also mean
it is not secret and may have appeared in model training.

#### Exact Claim Ledger transformation

| ContractNLI label | Claim Ledger label | Context supplied to Jev |
| --- | --- | --- |
| `Entailment` | `supports` | Concatenate **all** annotated evidence spans in document order, separated by a stable delimiter. |
| `Contradiction` | `contradicts` | Concatenate **all** annotated evidence spans in document order, separated by a stable delimiter. |
| `NotMentioned` | `says_nothing` | Deterministically select the top three contract spans by BM25 lexical relevance to the hypothesis. |

The mapping is exact at the **document-label level**. The positive and contradiction contexts are
oracle evidence, so this lane isolates the semantic checker. The BM25 rule makes neutral examples
harder than random unrelated sentences while staying valid: if the whole contract does not mention
the proposition, a subset should not support or contradict it, barring an annotation error.

The asymmetry must be disclosed. Positive cases use human-selected oracle spans while neutral cases
use an automatic shortlist. Scores therefore measure the particular derived benchmark, not the
original ContractNLI document-level task.

#### Minimal development fixture

Create a deterministic sample of 30 cases per label from the official dev split:

- sort eligible IDs by `SHA256(seed + ":" + case_id)` and take the first 30;
- freeze and publish the seed, source revision, source file hash, adapter version, and selected IDs;
- preserve all gold evidence spans rather than selecting only the first span;
- store only the derived evaluation artifact or provide a reproducible preparation command, with
  attribution and license notice; and
- do not inspect failures to alter the prompt and then report the same sample as held-out evidence.

Thirty per class is large enough to reveal obvious regressions while keeping the first paid run
bounded. It is not large enough for narrow class-wise confidence intervals or a production claim.
After the adapter and rubric are frozen, run the official test split once or add a separately frozen
test sample.

#### Main risks

- Only NDAs and 17 repeated hypotheses are represented; performance will not establish
  generalization to other contracts, legal questions, or citation styles.
- Public benchmark contamination is plausible for any hosted model. A high score may include
  memorization, even though evidence-conditioned inputs reduce that risk.
- Several legal decisions depend on exceptions, definitions, and multiple spans. Concatenated gold
  spans test the checker, but do not test whether retrieval found every required span.
- The original data has one final annotation set per document; it is not a modern multi-annotator
  adjudicated test set.
- The authors warn that the data and models do not constitute legal advice.

The dataset is published under [CC BY 4.0](https://github.com/stanfordnlp/contract-nli/blob/gh-pages/LICENSE).
The ZIP also contains source contracts; preserve attribution and review redistribution requirements
before copying raw files into another public repository.

### 2. VitaminC — strongest three-way contrastive stress test

VitaminC was designed specifically to force a verifier to follow the supplied evidence rather than
memorized facts. It pairs a claim with near-identical Wikipedia sentences from before and after a
factual revision, so a small evidence change can flip the label. The task is exactly
`rel(claim, evidence) in {SUPPORTS, REFUTES, NEI}`. The paper says splits were assigned by article,
consistent with FEVER for overlapping articles, which prevents before/after variants from being
randomly scattered across splits. See the [paper](https://aclanthology.org/2021.naacl-main.52.pdf)
and the author-maintained [dataset snapshot](https://huggingface.co/datasets/tals/vitaminc/tree/be6febb761b0b2807687e61e0b5282e459df2fa0).

The pinned snapshot contains 488,904 rows: 370,653 train, 63,054 validation, and 55,197 test. The
validation split contains 31,484 SUPPORTS, 22,528 REFUTES, and 9,042 NOT ENOUGH INFO examples.
The paper reports substantial agreement on a 2,000-pair reannotation sample (Fleiss kappa 0.7065).

Mapping is direct:

```text
SUPPORTS         -> supports
REFUTES          -> contradicts
NOT ENOUGH INFO  -> says_nothing
```

For evaluation, group rows by `case_id` and report both ordinary accuracy and **contrastive pair
consistency**: the model should change its decision when the evidence changes. Do not randomly
resplit rows; that can separate near-duplicate cases. Separate the `real` and synthetic/FEVER-derived
subsets because synthetic performance can be materially easier and less representative.

VitaminC is general-domain, short-context Wikipedia evidence rather than legal or biomedical
material. It is also public and old enough to be a likely training-contamination risk. Its license
file applies Wikipedia article terms or [CC BY-SA 3.0](https://huggingface.co/datasets/tals/vitaminc/blob/be6febb761b0b2807687e61e0b5282e459df2fa0/LICENSE).

### 3. SciFact — best open biomedical/scientific relation set

SciFact contains 1,409 atomic scientific claims verified against 5,183 research-paper abstracts.
Annotators label claim/abstract pairs SUPPORTS, REFUTES, or NOINFO and mark minimal rationales;
each rationale contains at most three sentences. The official split contains 809 train, 300 dev,
and 300 test claims. The test labels are withheld from the public download, while train and dev are
labeled. The authors report Cohen's kappa of 0.75 on relation labels and 0.71 on rationale selection
for 232 reannotated claim/abstract pairs. See the [paper](https://aclanthology.org/2020.emnlp-main.609.pdf)
and [official repository](https://github.com/allenai/scifact/tree/68b98a56d93e0f9da0d2aab4e6c3294699a0f72e).

The mapping is direct:

```text
SUPPORTS -> supports
REFUTES  -> contradicts
NOINFO   -> says_nothing
```

For the narrow Jev task, use either the full annotated abstract or a complete gold rationale for
SUPPORTS/REFUTES. For NOINFO, use the explicitly annotated cited abstract, or reproduce the paper's
rule of taking the top lexical sentences from a cited NOINFO abstract. Do not create neutral cases
from random papers; the official cited NOINFO abstracts are topically related and more informative.

This is scientific/biomedical evidence, not clinical records and not medical advice. Refuting
claims were created by an NLP expert negating existing claims, which is a possible construction
artifact, although the authors report poor claim-only performance. The public data is released
under [CC BY-NC 2.0](https://github.com/allenai/scifact/blob/68b98a56d93e0f9da0d2aab4e6c3294699a0f72e/LICENSE.md),
so it is unsuitable for unrestricted commercial redistribution or use without legal review.

### 4. AttributionBench — closest citation-correctness benchmark

AttributionBench defines the exact high-level product question: given a claim and accompanying
references, decide whether the claim is fully supported. It unifies ExpertQA, Stanford-GenSearch,
AttributedQA, LFQA, BEGIN, HAGRID, and AttrEval-GenSearch. The balanced release contains 13,322
train, 1,198 dev, 1,610 in-domain test, and 1,686 out-of-domain test examples. The author repository
also publishes a stable 500-row balanced test sample. See the [paper](https://aclanthology.org/2024.findings-acl.886.pdf),
[official code](https://github.com/OSU-NLP-Group/AttributionBench), and the pinned
[author dataset](https://huggingface.co/datasets/osunlp/AttributionBench/tree/62569e644f4186606f54f742178a4517431b42e1).

Its label space is binary, so the only valid mapping is:

```text
Jev supports                        -> attributable
Jev contradicts OR says_nothing     -> not attributable
```

This benchmark can measure whether Jev recognizes support. It **cannot** measure whether Jev
correctly distinguishes contradiction from silence. Reporting three-way accuracy on it would be
fabricated because the source data does not contain that distinction.

The paper documents important label/context risks: human annotators sometimes had access to a
whole web page while the evaluator receives only extracted references; some hard errors were due to
label mismatch or inaccessible context. `references` must be concatenated in a fixed, documented
order, and results should be broken down by `src_dataset` and ID/OOD rather than reported only as
one aggregate. The author-maintained Hugging Face repository declares Apache 2.0, but because the
benchmark aggregates other datasets and web excerpts, preserve source provenance and review
upstream terms before redistributing a derivative copy.

### 5. FEVER — large but awkward for a pairwise verifier

FEVER contains 185,445 Wikipedia-derived claims labeled SUPPORTS, REFUTES, or NOT ENOUGH INFO.
Support/refute claims have one or more complete evidence sets; 16.82% of shared-task cases require
more than one sentence. The official shared-task distribution is 145,449 train and balanced
19,998-item dev and test sets. See the [official dataset page](https://fever.ai/dataset/fever.html),
[paper](https://aclanthology.org/N18-1074.pdf), and
[scorer](https://github.com/sheffieldnlp/fever-scorer).

SUPPORTS and REFUTES map directly if the whole minimal evidence set is supplied. NOT ENOUGH INFO
does not: FEVER intentionally supplies no gold evidence for NEI. A Claim Ledger adapter would have
to add an independently specified retrieval or hard-negative rule. That derived rule, not FEVER
alone, would determine neutral difficulty. This makes FEVER less clean than ContractNLI or
VitaminC for the first narrow evaluation.

FEVER is also a widely used public benchmark based on synthetic alterations to Wikipedia, so both
construction artifacts and pretraining contamination are material risks. The official dataset card
lists Wikipedia/CC BY-SA 3.0 terms; the scorer is Apache 2.0.

### 6. TRUE — broad binary robustness, not a native citation dataset

TRUE standardizes 11 datasets from summarization, knowledge-grounded dialogue, paraphrasing, and
fact verification into `grounding`, `generated_text`, and a binary consistent/inconsistent label.
The official repository supplies a script that downloads each upstream dataset and applies the
authors' label conversion. It is useful for testing whether an evaluator transfers across tasks and
longer grounding texts. See the [paper](https://arxiv.org/abs/2204.04991) and pinned
[repository](https://github.com/google-research/true/tree/f36230f271c218dd1aac35c70bbd6aafffdbd41f).

TRUE collapses contradiction and unsupported content into one negative class. Its paper also found
that 10 of 100 uniformly sampled cases reviewed during error analysis appeared mislabeled, while
label problems were much more common among examples selected because all strong metrics failed.
Use it as a noisy robustness suite, not a gold three-way benchmark. The repository code is Apache
2.0, but the downloaded datasets retain their own licenses and must be reviewed individually.

### 7. EvidenceBench, AVeriTeC, and MedNLI — useful but not now

- **EvidenceBench** is valuable for the separate retrieval question. It gives a biomedical
  hypothesis, a full paper as a sentence candidate pool, and aspect-to-evidence mappings. It does
  not say whether a given passage supports, contradicts, or is neutral toward the hypothesis. See
  the [official repository](https://github.com/EvidenceBench/EvidenceBench/tree/bf1d9633c694381c7b016fd56ee9f95f48593cc3).
- **AVeriTeC** contains 4,568 real-world fact-checking claims and web-evidence question-answer
  records, with verdicts formed from multiple evidence items. It is an excellent later test of
  retrieval plus evidence composition but is not an atomic claim/passage classifier. See the
  [paper](https://proceedings.neurips.cc/paper_files/paper/2023/file/cd86a30526cd1aff61d6f89f107634e4-Paper-Datasets_and_Benchmarks.pdf)
  and [official repository](https://github.com/MichSchli/AVeriTeC).
- **MedNLI** has an exact three-way clinical NLI task but derives its premises from MIMIC-III
  clinical notes. Access is credentialed, redistribution is prohibited, and every user needs their
  own rights. PhysioNet's [current hosted-LLM guidance](https://physionet.org/news/post/llm-responsible-use/)
  says the DUA prohibits sharing credentialed data with third parties and requires strong controls
  for any online service. A hosted Jev experiment should not use it.

## Evaluation protocol for the first ContractNLI run

### Frozen inputs

Record in the generated evaluation manifest:

- dataset name and split;
- source repository and exact revision;
- source file SHA-256;
- adapter version, stable sample seed, selected IDs, and BM25 settings;
- exact prompt/rubric version and pinned Jev model;
- complete input hash for each case; and
- whether each result was fresh or read from cache.

Do not commit the API key, raw responses containing secrets, or any credentialed/private document.

### Metrics

Report all of the following rather than only `15/15`-style accuracy:

1. confusion matrix;
2. accuracy and macro-F1;
3. precision, recall, and F1 for each of the three labels;
4. one-vs-rest Brier score or multiclass log loss using Jev's full probability vector;
5. selective accuracy/coverage at predeclared maximum-probability thresholds;
6. exact-repeat agreement and maximum probability drift if repeated runs are made;
7. input/output tokens, requests, errors, latency, and estimated cost; and
8. bootstrap confidence intervals grouped by **contract ID**, not by row, because multiple rows from
   the same contract are correlated.

Also break down results by:

- single-span vs multi-span oracle evidence;
- hypothesis ID, especially definitions/exceptions;
- document type (PDF-derived, SEC text, SEC HTML); and
- context length buckets.

The 90-case balanced sample should be treated as a gating smoke benchmark. If it is successful,
run the full 1,037-relation dev set, freeze the adapter and prompt, and then run a test split once.
Do not repeatedly tune on the public test labels.

### Pass/fail interpretation

A useful first-run result is not merely high accuracy. It should answer:

- Does Jev materially outperform the current deterministic/simple baseline?
- Which label fails, especially `says_nothing` vs `supports`?
- Does confidence separate correct from incorrect cases?
- Are errors concentrated in multi-span definitions and exceptions?
- Is behavior stable across exact reruns?
- Is cost/latency low enough for human-in-the-loop review?

## What the results may and may not support

If ContractNLI dev performs well, the defensible claim is:

> On a frozen, balanced sample derived from ContractNLI's public development split, the pinned Jev
> checker classified supplied legal evidence contexts into support, contradiction, or no support
> with the reported metrics and uncertainty.

Do **not** claim that:

- Jev verifies legal truth or makes legally valid determinations;
- Claim Ledger finds the right clause in a full document—the oracle positive contexts bypass
  retrieval;
- the score generalizes beyond NDAs or the 17 ContractNLI hypotheses;
- the benchmark proves clinical safety, medical correctness, or performance on patient records;
- the public benchmark is uncontaminated relative to Jev's training data;
- a 90-case development result is a held-out production accuracy estimate;
- the model is deterministic because two runs happened to choose the same labels; or
- calibrated Jev probabilities are empirical probabilities of correctness without application-level
  calibration evidence.

## Recommended sequence

1. **Now:** generate and review the 90-case ContractNLI dev fixture; run a deterministic baseline
   and one fresh Jev pass.
2. **If the adapter is correct:** run the complete 1,037-relation ContractNLI dev set, perform
   grouped error analysis, and freeze the rubric.
3. **Citation validity:** run AttributionBench's official balanced 500-row test sample, scoring
   binary support vs non-support only.
4. **Biomedical transfer:** run SciFact dev if CC BY-NC 2.0 is acceptable; never describe it as
   clinical patient validation.
5. **Contrastive robustness:** add a case-grouped VitaminC sample to test whether tiny evidence
   changes correctly flip the verdict.
6. **Retrieval separately:** use EvidenceBench or full-document ContractNLI/SciFact to benchmark
   evidence finding. Do not combine retrieval misses with relation-classifier errors in one number.
7. **Before product claims:** commission a small, independently double-annotated legal/clinical
   set drawn from the actual intended workflow, with adjudication and a frozen held-out test set.

## Primary sources and reproducibility pins

- ContractNLI: [paper](https://aclanthology.org/2021.findings-emnlp.164.pdf),
  [official repository and dataset](https://github.com/stanfordnlp/contract-nli/tree/eced6528dd3c1d14d73f9a87df8f7bdbc03126f9),
  [CC BY 4.0 license](https://github.com/stanfordnlp/contract-nli/blob/gh-pages/LICENSE).
- VitaminC: [paper](https://aclanthology.org/2021.naacl-main.52.pdf),
  [author dataset snapshot](https://huggingface.co/datasets/tals/vitaminc/tree/be6febb761b0b2807687e61e0b5282e459df2fa0),
  [license](https://huggingface.co/datasets/tals/vitaminc/blob/be6febb761b0b2807687e61e0b5282e459df2fa0/LICENSE).
- SciFact: [paper](https://aclanthology.org/2020.emnlp-main.609.pdf),
  [official repository](https://github.com/allenai/scifact/tree/68b98a56d93e0f9da0d2aab4e6c3294699a0f72e),
  [data schema](https://github.com/allenai/scifact/blob/68b98a56d93e0f9da0d2aab4e6c3294699a0f72e/doc/data.md),
  [CC BY-NC 2.0 license](https://github.com/allenai/scifact/blob/68b98a56d93e0f9da0d2aab4e6c3294699a0f72e/LICENSE.md).
- AttributionBench: [paper](https://aclanthology.org/2024.findings-acl.886.pdf),
  [official repository](https://github.com/OSU-NLP-Group/AttributionBench),
  [author dataset snapshot](https://huggingface.co/datasets/osunlp/AttributionBench/tree/62569e644f4186606f54f742178a4517431b42e1).
- FEVER: [paper](https://aclanthology.org/N18-1074.pdf),
  [official dataset](https://fever.ai/dataset/fever.html),
  [official scorer](https://github.com/sheffieldnlp/fever-scorer).
- TRUE: [paper](https://arxiv.org/abs/2204.04991),
  [official repository](https://github.com/google-research/true/tree/f36230f271c218dd1aac35c70bbd6aafffdbd41f).
- EvidenceBench: [official repository](https://github.com/EvidenceBench/EvidenceBench/tree/bf1d9633c694381c7b016fd56ee9f95f48593cc3).
- AVeriTeC: [paper](https://proceedings.neurips.cc/paper_files/paper/2023/file/cd86a30526cd1aff61d6f89f107634e4-Paper-Datasets_and_Benchmarks.pdf),
  [official repository](https://github.com/MichSchli/AVeriTeC).
- MedNLI: [official PhysioNet page](https://physionet.org/content/mednli/1.0.0/),
  [credentialed license](https://huggingface.co/datasets/bigbio/mednli/blob/178d9fddfca40ea6b55be1944180f7dcf7b034b0/LICENSE),
  [PhysioNet online-service guidance](https://physionet.org/news/post/llm-responsible-use/).
