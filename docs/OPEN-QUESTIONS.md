# Decisions and open questions

Updated: 2026-09-24

## Decisions made for v0

- **Jev Attribution Bench** is the repository name; **Claim Ledger** remains the name of the
  included local human-review workflow.
- Node.js 20 is the minimum runtime.
- The PoC is domain-neutral and includes synthetic legal and clinical fixtures.
- Inputs are UTF-8 Markdown/plain text with hand-authored Claims.
- `EvidenceRelationChecker` is provider-neutral; fixture replay is the default study path and the
  pinned `jev-1.13.0` adapter is optional.
- Model output never creates approval. Every v0 item goes to a human.
- Any Artifact byte change invalidates the version-bound review.
- Static publication accepts synthetic, non-sensitive fixtures only.
- PDF, DOCX, OCR, DocJev, and automatic claim extraction remain deferred until the core experiment
  justifies them.

## Resolved for the synthetic live smoke

- Use the native TypeSafe API with `jev-1.13.0` and the pinned JavaScript SDK.
- Permit only synthetic, non-sensitive fixtures; real documents remain blocked.
- Require explicit live opt-in and a positive per-run uncached-call cap; disable retries.
- Estimate local cost from provider-reported input tokens and the official $0.042/M input-token
  price; output tokens are currently free.

## Required before any real document leaves the machine

- Does the account have zero-data-retention, and in which region is processing performed?
- What legal/account terms apply to the actual project and data controller?
- Which document categories and fields are prohibited from leaving the machine?
- What production hard-spend control is enforceable given that no public balance API is documented?

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
