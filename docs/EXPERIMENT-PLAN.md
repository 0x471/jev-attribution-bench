# Experiment plan

## Decision

Does Claim Ledger detect material evidence and reasoning defects beyond citation-only review,
at an acceptable reviewer-time cost?

## Conditions

| Condition | Reviewer sees |
| --- | --- |
| Control | Draft, citations, exact source context, and citation-relation assessment |
| Treatment | Control plus atomic Claims, Implicit Premises, Argument Edges, granular actions, and version invalidation |

Both conditions use the same documents, evidence candidates, frozen Automated Assessments,
rubric, reviewer pool, and randomized case order. The assessments are replayed from a reviewed
fixture set in the first experiment, so provider availability and model variability cannot become
confounds. The only intentional difference is the Claim Ledger structure.

## Dataset

- 12–20 base memos, balanced between legal and clinical-style scenarios.
- One clean original and one isolated-defect variant per base memo.
- No personal, privileged, medical, or confidential real-world data.
- Human-authored gold Claims, Evidence Relations, Argument Edges, and defects.
- Development and evaluation splits declared before threshold tuning.

## Primary outcomes

- Defect recall by type.
- Defect precision by type.
- Median active review time per memo.
- Material-claim coverage.
- Claim fidelity and atomicity.

## Secondary outcomes

- Evidence Relation accuracy and calibration.
- Argument Edge accuracy.
- Inter-reviewer agreement.
- Correction rate after a warning.
- Number of automatically suggested items a reviewer reverses.
- Deterministic stale-approval detection after artifact mutation.

## Provider-independent baselines and ablations

1. Deterministic quote containment only.
2. Quote containment plus the same frozen Evidence Relation assessment shown in both conditions.
3. Condition 2 plus atomic Claims.
4. Condition 3 plus Argument Edges.
5. Full treatment plus exact-version Certification.

This isolates what decomposition and version binding add without requiring a hosted checker. Do
not attribute an end-to-end gain to the checker because its assessments are held constant.

## Separate checker study

Checker quality is a different question and must not be mixed into the workflow experiment. After
the gold Evidence Relations are frozen, compare any available checker against the same cases:

1. deterministic quote containment;
2. a reviewed local NLI candidate, if it passes licensing and resource review;
3. Jev or another hosted typed classifier, only if access and data controls become available.

Report the three-way confusion matrix, calibration, latency, memory, and failures. Do not select a
replacement model merely because Jev is unavailable, and do not change checker outputs between the
control and treatment arms of the workflow study.

## Statistical plan

- Treat base memos as the independent unit; repetitions do not create new independent cases.
- Report paired differences and bootstrap 95% intervals by base memo.
- Report every metric by defect type, not only a pooled average.
- Publish confusion matrices and all failure receipts.
- Do not claim superiority when an interval includes zero.
- Record reviewer identity as a pseudonymous study ID and stratify reviewer-time results.

## Provisional success gates

Promotion to a larger pilot requires all of the following:

- at least +15 percentage points in recall on hidden-premise and partial-support defects;
- no more than a five-point precision regression overall;
- no stale Certification surviving any artifact mutation;
- at least 95% claim fidelity on the evaluation split;
- median reviewer time no more than 50% above control;
- no secret, sensitive fixture, or provider response in a public Pages artifact;
- documented source-level review of every treatment loss.

These thresholds are hypotheses to review before data collection. Changing them afterward must
be recorded as exploratory analysis.

## Failure taxonomy

- `quote_missing`
- `quote_misattributed`
- `relation_unsupported`
- `relation_contradicted`
- `claim_overstated`
- `claim_compound_partial`
- `premise_missing`
- `entity_mismatch`
- `time_or_scope_mismatch`
- `source_version_stale`
- `document_version_stale`
- `claim_extraction_omission`
- `argument_edge_wrong`
