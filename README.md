# Claim Ledger

Claim Ledger is a research PoC for reviewing the evidentiary structure of consequential
documents. It turns a draft and a closed source bundle into atomic claims, exact evidence
spans, a small argument graph, human review decisions, and a manifest bound to the exact
bytes reviewed.

The project tests one question:

> Does atomic claim review, load-bearing premise review, and exact-version sign-off catch
> material defects that ordinary citation checking misses?


## Current state

This repository contains the reviewed technical foundation for the PoC:

- [domain language](./CONTEXT.md);
- [technical execution plan](./docs/TECHNICAL-PLAN.md);
- [module and interface design](./docs/ARCHITECTURE.md);
- [evaluation plan](./docs/EXPERIMENT-PLAN.md);
- [threat model](./docs/THREAT-MODEL.md);
- [review-manifest schema](./schemas/review-manifest.schema.json); and
- primary-source [Jev research](./docs/research/jev-foundations.md).

Implementation intentionally starts only after the interfaces and success criteria are
reviewed. The first vertical slice will accept Markdown/plain text and hand-authored claims;
DOCX/PDF ingestion and automatic claim extraction come later.

## Foundation check

Requires Node.js 20 or newer:

```sh
npm install
npm run check
```

The check type-checks the repository tooling and validates the synthetic Review Manifest
against the canonical JSON Schema. Provider credentials are not required.

## Product boundary

Claim Ledger may say that a named reviewer approved a particular claim/evidence relationship
for an exact document version. It must never claim that a document is legally correct,
clinically appropriate, true, court-compliant, or risk-free.

## Planned local workflow

```text
draft + sources
      │
      ▼
hash and anchor exact bytes
      │
      ▼
claims + candidate source spans
      │
      ├── deterministic quote-location check
      └── pinned Jev evidence-relation check
                    │
                    ▼
             human review ledger
                    │
                    ▼
       manifest.json + static review site
```

The GitHub Pages site will use fixtures or exported manifests only. It will never contain a
TypeSafe API key or call Jev directly from the browser.

## Before adding a remote

Review the scope and naming, then provide the personal GitHub repository URL. At that point
the remote, Pages build, and deployment workflow can be added deliberately.

Before the repository becomes public, also choose an open-source license and confirm that all
fixtures are synthetic and safe to publish.
