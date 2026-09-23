# Threat model

## Assets to protect

- draft and source contents;
- provider credentials;
- reviewer identity and actions;
- integrity of Artifact digests and Anchors;
- integrity of the Review Manifest and Certification;
- separation between automated assessment and human approval.

## Threats and required controls

### Credential exposure

Threat: a TypeSafe key is bundled into the static site, committed, logged, or copied into a
manifest.

Controls: local environment variable only; `.env` ignored; allowlist manifest fields; scan the
Pages artifact and Git diff for secret patterns; never call the provider from browser code.

### Sensitive-document disclosure

Threat: source text reaches GitHub Pages, logs, fixtures, crash reports, or a hosted provider
without informed intent.

Controls: synthetic public fixtures; local-only real manifests; minimal Jev state; redacted
structured logs; an explicit outbound-data preview before live calls; documented provider data
handling; a fixture/offline adapter.

### Prompt injection in source material

Threat: an Artifact contains instructions designed to manipulate the evidence classifier.

Controls: treat state as untrusted data; use literal Choice criteria; minimize context; test
adversarial fixtures; never let source text change questions, rubric, routing, or permissions.

### False authority

Threat: users read model confidence, a green badge, or Certification as proof that a claim is
true or professionally sound.

Controls: neutral language; no “verified true” label; separate Automated Assessment from Review
Action in the schema and UI; visible scope disclaimer; no global correctness score.

### Stale approval

Threat: a reviewed draft or source is edited while the prior approval remains visible as valid.

Controls: bind actions and Certification to Artifact digests; recompute on open/export; fail
closed; no approval carry-forward in v0.

### Anchor drift

Threat: extracted text offsets no longer refer to the quoted bytes after parsing or normalization.

Controls: preserve raw bytes; store raw span digests; replay artifact and Anchor checks from the
declared project files before static export. Parser provenance and lossy-extraction warnings become
required when document extraction is introduced after v0.

### Reviewer impersonation or ledger tampering

Threat: a manifest claims that somebody approved content they did not review.

Controls: v0 labels reviewer identity as self-asserted and offers no cryptographic identity
claim. A later signing milestone must bind a trusted identity to the canonical manifest bytes.

## Out of scope for v0

- malicious operating-system administrators;
- compromised TypeSafe infrastructure;
- legally binding electronic signatures;
- multi-tenant authorization;
- secure deletion guarantees.
