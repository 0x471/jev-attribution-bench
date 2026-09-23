# Decisions and open questions

Updated: 2026-09-23

## Decisions made for v0

- **Claim Ledger** is the working name; a rename remains cheap before a remote exists.
- Node.js 20 is the minimum runtime.
- The PoC is domain-neutral and includes synthetic legal and clinical fixtures.
- Inputs are UTF-8 Markdown/plain text with hand-authored Claims.
- `jev-1.13.0` is pinned behind `EvidenceRelationChecker`; fixture replay is the default test path.
- Model output never creates approval. Every v0 item goes to a human.
- Any Artifact byte change invalidates the version-bound review.
- Static publication accepts synthetic, non-sensitive fixtures only.
- PDF, DOCX, OCR, DocJev, and automatic claim extraction remain deferred until the core experiment
  justifies them.

## Required before the first live Jev call

- Which TypeSafe account and data-processing terms apply?
- Does that account have zero-data-retention, and in which region is processing performed?
- Is direct TypeSafe access required, or is an approved gateway allowed?
- What hard per-run and monthly spend limits should the CLI enforce?
- What source content is prohibited from leaving the machine?
- Which reviewed pricing source, if any, should be used for estimated dollar cost?

## Required before automatic claim proposals

- Which generative model and provider may receive the draft?
- Must claim extraction run locally for confidential documents?
- Who authors the gold Claim and Argument Edge annotations?
- What minimum claim-coverage and fidelity gates justify showing proposals to reviewers?

## Required before GitHub Pages deployment

- What is the personal GitHub repository URL?
- Which hostname and base path should the build target?
- Which exact fixtures and recorded model outputs are approved for public distribution?
- Which open-source license should cover the repository?

A future live service would require an authenticated server-side component; it is not part of the
static Pages deployment.
