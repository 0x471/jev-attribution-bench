# Claim Ledger

Claim Ledger is a local-first research PoC for reviewing the evidentiary structure of
consequential documents. It maps hand-authored claims in a draft to exact source spans, asks a
pluggable checker for a narrow three-way evidence assessment, and records what a human reviewed
for the exact artifact bytes involved. The workflow and controlled experiment do not require
access to any particular hosted model.

The project tests one question:

> Does atomic claim review, dependency review, and exact-version sign-off catch material defects
> that ordinary citation checking misses?

It does **not** certify truth, legal compliance, or clinical correctness. A checker produces an
Automated Assessment; only a person can create a Review Action or Certification.


## What works now

- Markdown and UTF-8 plain-text Artifact ingestion with SHA-256 identity.
- Hand-authored Claims, Evidence Spans, and Argument Edges validated by JSON Schema.
- Unicode-code-point Anchors back to exact draft and source text.
- Deterministic fabricated-quote detection before any model call.
- Provider-neutral `EvidenceRelationChecker` seam with deterministic fixture replay.
- Optional pinned `jev-1.13.0` adapter through `@typesafe-ai/sdk@0.6.0`, retained for future
  comparison if access becomes available.
- SDK timeout, retry, and cancellation configuration plus a content-addressed local cache.
- Strict response validation and full probability/input/output-token capture.
- Offline fixture replay for deterministic tests and public demonstrations.
- Append-only human approve/reject/waive actions; waivers require a reason.
- Certification only when every Claim, Evidence Relation, and Argument Edge is approved or waived.
- Artifact, Anchor, manifest-reference, and Certification integrity checks.
- Safe failure receipts with no source text, provider response, or credential.
- A credential-free static viewer restricted to explicitly synthetic, non-sensitive fixtures.

PDF, DOCX, OCR, automatic claim extraction, authenticated identity, approval carry-forward, and
autonomous correctness scores are intentionally out of scope for v0.

## Install and check

Requires Node.js 20 or newer:

```sh
npm ci
npm run check
```

`npm run check` type-checks the code, runs the test suite, and validates the project and manifest
fixtures. It makes no network request and needs no credential.

## Reproduce the offline fixture

```sh
npm run claim-ledger -- build \
  --project fixtures/synthetic/project.json \
  --checker fixture \
  --assessments fixtures/synthetic/assessments.json \
  --timestamp 2026-09-23T09:00:00.000Z \
  --out work/manifest.json

npm run claim-ledger -- verify \
  --manifest work/manifest.json \
  --project fixtures/synthetic/project.json
```

The deterministic fixture represents an **automated proposal**, not an approval. Review each
subject explicitly:

```sh
npm run claim-ledger -- review \
  --manifest work/manifest.json \
  --subject-type claim \
  --subject claim-notice \
  --decision approve \
  --reviewer "Your name"
```

Repeat for every Claim, Evidence Relation, and Argument Edge. Then certify:

```sh
npm run claim-ledger -- certify \
  --manifest work/manifest.json \
  --reviewer "Your name"
```

Reviewer identity is explicitly `self-asserted` in v0; this is not a digital signature.

## Optional Jev adapter

The `jev-1.13.0` adapter is implemented and contract-tested, but Jev access is not a dependency of
the PoC or its first controlled experiment. The CLI deliberately refuses live Jev runs while
provider access is unavailable and until data-handling terms, an outbound-data preview, and
enforceable budget controls are approved. `.env` is ignored by Git for any later opt-in path. The
browser viewer has no provider adapter or credential path, and no live Jev result is committed in
this repository.

## Preview the static fixture viewer

The checked-in [`review/`](./review/) bundle contains only the synthetic legal fixture:

```sh
npm run claim-ledger -- export-site \
  --manifest fixtures/synthetic/manifest.json \
  --project fixtures/synthetic/project.json \
  --out review

python3 -m http.server 8765 --directory review
```

Open `http://127.0.0.1:8765`. The exporter refuses non-fixture manifests and any manifest marked
as containing sensitive data. A GitHub Pages workflow will be added only after you provide and
review the personal repository remote.

For the presentation-ready certified flow and three-minute talk track, see
[`docs/DEMO.md`](./docs/DEMO.md). Build and serve it with:

```sh
npm run demo:build
npm run demo:serve
```

## Design and research

- [Domain language](./CONTEXT.md)
- [Technical plan](./docs/TECHNICAL-PLAN.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Persisted-data dictionary](./docs/MANIFEST-DATA-DICTIONARY.md)
- [Implementation status](./docs/IMPLEMENTATION-STATUS.md)
- [Controlled experiment](./docs/EXPERIMENT-PLAN.md)
- [Threat model](./docs/THREAT-MODEL.md)
- [Jev primary-source research](./docs/research/jev-foundations.md)

Before making the repository public, choose an open-source license and confirm again that every
published fixture is synthetic.
