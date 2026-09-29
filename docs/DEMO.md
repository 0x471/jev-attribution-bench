# Claim Ledger demo

## Start it

```sh
npm ci
npm run demo:build
npm run demo:serve
```

Open `http://127.0.0.1:8788`. Everything shown is synthetic and the build makes no network calls.

## Three-minute talk track

1. **Problem — 20 seconds.** “A citation can exist and still support the wrong proposition. Claim
   Ledger makes the claim, evidence relationship, and human decision separately reviewable.”
2. **Claims — 35 seconds.** Point to the two atomic contract claims. Each one is anchored to the
   exact draft bytes rather than treated as an unstructured paragraph.
3. **Evidence — 45 seconds.** Show the quoted source span and `Automated: supports`. Explain that
   exact quote containment was checked deterministically first; the checked-in Jev-shaped result is
   an offline fixture, and the UI does not present it as approval.
4. **Human boundary — 35 seconds.** Point to the separate human Claim and Evidence decisions. The
   model cannot create these records, regardless of confidence.
5. **Reasoning structure — 25 seconds.** Show the `qualifies` relationship. This is the part ordinary
   citation checking misses: whether one proposition changes the scope of another.
6. **Version-bound sign-off — 40 seconds.** Point to Review sign-off and its scope statement. Every
   action binds the exact Claim/relation state, document hash, and source ID/hash pairs. Any byte,
   assessment, rubric, or graph change makes the old action stale.
7. **Close — 20 seconds.** “This proves the local review workflow, not model quality. The next
   evidence-producing step is the frozen controlled experiment; PDF/DOCX ingestion and automatic
   claim extraction stay out until that result justifies them.”

## Technical points if asked

- Node.js/TypeScript, JSON Schema, SHA-256, and Unicode-code-point Anchors.
- `jev-1.13.0` and `@typesafe-ai/sdk@0.6.0` are pinned. Live calls are available only through an
  explicit, capped, synthetic-only local path; the checked-in demo still uses offline fixtures.
- Missing quotations become `fabricated` without a model call.
- Static export replays project policy, artifact metadata/bytes, Anchors, Claims, relations, graph,
  human-action freshness, and Certification integrity.
- The static viewer has no provider adapter, secret, write endpoint, or production data.

## Rebuild verification

```sh
npm run check
npm run claim-ledger -- verify \
  --manifest review/manifest.json \
  --project fixtures/synthetic/project.json
```
