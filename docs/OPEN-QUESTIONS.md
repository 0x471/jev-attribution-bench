# Open questions before implementation

These decisions are intentionally unresolved. None block reviewing the foundation, but each
must be answered before its corresponding milestone.

## Before the first implementation commit

- Is **Claim Ledger** the final public name?
- Which open-source license should cover this repository?
- Is Node.js 20 the minimum runtime we want to support?
- Should v0 be legal-first, clinical-first, or deliberately domain-neutral with one fixture each?

## Before the first live Jev call

- Which TypeSafe account and data-processing terms apply?
- Does that account have zero-data-retention, and in which region is processing performed?
- Is direct TypeSafe access required, or is an approved gateway allowed?
- What hard per-run and monthly spend limits should the CLI enforce?
- What source content is prohibited from leaving the machine?

## Before automatic claim proposals

- Which generative model and provider may receive the draft?
- Must claim extraction run locally for confidential documents?
- Who authors the gold Claim and Argument Edge annotations?
- What minimum claim-coverage and fidelity gates justify showing proposals to reviewers?

## Before GitHub Pages deployment

- What is the personal GitHub repository URL?
- Is the Pages site a synthetic showcase only, or should it display user-exported local bundles?
- Which hostname and base path should the build target?
- Which exact fixtures and recorded model outputs are approved for public distribution?
- Do we want a later live service? If yes, it requires an authenticated server-side proxy and
  is not part of the static Pages deployment.
