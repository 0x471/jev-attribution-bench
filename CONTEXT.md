# Claim Ledger

Claim Ledger records how claims in a consequential document relate to source evidence and
what a human reviewed for a specific, immutable document version.

## Artifacts and versions

**Artifact**:
A byte-preserved draft or source document identified by a cryptographic digest.
_Avoid_: File, upload

**Document Version**:
One immutable state of the draft, identified by the SHA-256 digest of its raw bytes.
_Avoid_: Current document, latest draft

**Source Version**:
One immutable state of a source used as evidence, identified by the SHA-256 digest of its raw bytes.
_Avoid_: Reference, attachment

**Anchor**:
A stable location descriptor connecting extracted text to its originating Artifact.
_Avoid_: Offset, page number

## Claims and evidence

**Claim**:
An atomic, independently reviewable proposition anchored to the Document Version that states it.
_Avoid_: Sentence, assertion

**Implicit Premise**:
A proposed proposition not stated directly in the draft but required for a conclusion to follow.
_Avoid_: Hidden fact, inferred claim

**Evidence Span**:
Exact source text, its Anchor, and the Source Version from which it came.
_Avoid_: Citation, snippet

**Evidence Relation**:
A reviewable relationship between one Claim and one Evidence Span: supports, contradicts, says nothing, or fabricated.
_Avoid_: Verification, truth score

**Argument Edge**:
A typed relationship between Claims: requires, supports, rebuts, or qualifies.
_Avoid_: Link, dependency

## Review

**Automated Assessment**:
A checker-produced Evidence Relation with its confidence or score distribution, checker identity, and rubric version. It may come from deterministic fixture replay, a local model, or an optional hosted model.
_Avoid_: Approval, verdict

**Review Action**:
A human decision—approve, reject, or waive with reason—bound to specific versioned subjects.
_Avoid_: Feedback, confirmation

**Review Ledger**:
The append-only sequence of Review Actions and invalidations for one Document Version.
_Avoid_: Audit log, checklist

**Certification**:
A human sign-off over a Review Manifest whose unresolved-item policy is satisfied.
_Avoid_: Validation, compliance certificate

**Review Manifest**:
A portable record containing versioned artifacts, claims, evidence, argument edges, automated assessments, human actions, and optional Certification.
_Avoid_: Report, result file
