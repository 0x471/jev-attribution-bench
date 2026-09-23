# Jev foundations for Claim Ledger

**Research date:** 2026-09-23
**Scope:** Current public Jev/TypeSafe contracts and their implications for a small claim/evidence review proof of concept.
**Evidence policy:** Primary sources only: TypeSafe documentation, TypeSafe's official SDK repositories and legal terms, official provider documentation, GitHub documentation, and the DocJev source repository maintained by its author.

## Executive conclusion

Jev is a good fit for one narrow part of Claim Ledger: deciding how a supplied evidence passage relates to a supplied atomic claim, using a closed set such as `supports | contradicts | says_nothing`. It is not a source retriever, quote extractor, citation generator, explanation model, calculator, or authority that can make an evidence record true.

The PoC should therefore be a hybrid system:

1. deterministic local code imports and hashes sources, assigns stable passage IDs, locates quotations, and records exact offsets;
2. local search produces a small candidate evidence set;
3. Jev evaluates each claim-candidate pair with typed questions;
4. code applies explicit thresholds and invariants;
5. a human confirms low-confidence or consequential judgments; and
6. the ledger preserves the request, response, model revision, source hash, ruleset version, and reviewer action.

This architecture follows TypeSafe's own guidance that code should own control flow and side effects while Jev handles narrow common-sense judgments. It also avoids Jev 1.13's documented weaknesses with generation, indirection, irrelevant long context, numerical precision, and adversarial state ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)).

## 1. What Jev is—and is not

Jev is TypeSafe's flagship and first “System One” model. Its interface is `state + typed questions -> typed answers`. It evaluates natural-language or JSON-shaped text state and returns bounded decisions rather than prose ([Introduction](https://docs.typesafe.ai/introduction), [State](https://docs.typesafe.ai/concepts/state)).

The three public primitives are:

| Primitive | Application supplies | Jev returns | Claim Ledger use |
| --- | --- | --- | --- |
| `Choice` | A finite map of option IDs to descriptions | Winning option, full option distribution, derived confidence | Evidence relation, claim type, review route |
| `Score` | Two to ten ordered rubric levels | Probability-weighted score, level distribution, derived confidence | Optional ordinal quality/risk rubric; not exact measurement |
| `Noul` | A yes/no proposition, optionally defining true/false | A number from 0 to 1 representing the probability of “yes” | Relevance, quote-context sufficiency, conflict indicators |

All questions in one call see the same state and are evaluated independently. They do not reason from or condition on one another. TypeSafe recommends atomic questions and composition in code ([Introduction](https://docs.typesafe.ai/introduction), [API reference](https://docs.typesafe.ai/api)).

Jev is **not**:

- a chat, code-completion, or generative model; it does not write explanations, quotes, citations, or source summaries ([Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents));
- a drop-in model for an autonomous agent; application code owns sequencing, authorization, and side effects;
- a calculator, counter, date engine, or reliable exact numeric extractor ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13));
- a document parser or OCR system; current model input is text only ([Models](https://docs.typesafe.ai/models));
- a correctness guarantee. Typed output prevents an invented output label, but the selected allowed label can still be wrong. TypeSafe's customer agreement explicitly says output may be inaccurate and the customer must independently evaluate it ([Master Customer Agreement, §9.3](https://typesafe.ai/legal/mca)).

For Claim Ledger, “no text generation” is an advantage only if the product needs a bounded semantic judgment. It does not solve provenance, exactness, or explanation.

## 2. Current model and integration contract

As of the research date, the stable model is **Jev 1.13**, with versioned ID `jev-1.13.0`. The alias `jev-latest` currently resolves to it; `jev-preview` also currently resolves to the same version. Aliases can move without an application change, while every response reports the concrete model ID that answered ([Models](https://docs.typesafe.ai/models)).

The native HTTP call is:

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

```json
{
  "model": "jev-1.13.0",
  "state": {
    "claim": "The agreement may be terminated on 30 days' notice.",
    "evidence": {
      "source_id": "contract-a",
      "passage_id": "contract-a:p0042",
      "text": "Either party may terminate this Agreement upon thirty (30) days' written notice."
    }
  },
  "questions": {
    "relation": {
      "type": "choice",
      "instructions": "How does the evidence passage relate to the claim? Judge only the supplied passage.",
      "criteria": {
        "supports": "The passage states the claim or directly implies it.",
        "contradicts": "The passage states the opposite or directly implies the claim is false.",
        "says_nothing": "The passage does not establish or contradict the claim."
      }
    }
  }
}
```

The result is keyed by the caller's question IDs and includes `model`, `answers`, and token `usage`. A `Choice` answer contains `choice`, `probabilities`, and `confidence` ([API reference](https://docs.typesafe.ai/api)).

Current direct-service limits are:

- **price:** $0.042 per million input tokens; output tokens are free;
- **rate limits:** 250,000 tokens/second and 1,200 requests/minute, explicitly described as dynamically adjustable;
- **context:** 64k tokens across the complete request and 32k for `state + longest question`;
- **input:** text only, represented as a string, JSON object, or array of text values; no native image, audio, or video input.

These values are current facts, not contractual constants; check them again before a public launch ([Models](https://docs.typesafe.ai/models)).

### SDK choices and pins

The official SDKs are thin hosted-API clients, not local inference runtimes:

- JavaScript/TypeScript: `@typesafe-ai/sdk` **v0.6.0**, Node.js 20+, MIT-licensed ([release](https://github.com/typesafe-ai/typesafe-sdk-js/releases/tag/v0.6.0), [package manifest](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/package.json));
- Python: `typesafe-sdk` **v0.7.1**, Python 3.10+, MIT-licensed ([release](https://github.com/typesafe-ai/typesafe-sdk-python/releases/tag/v0.7.1), [project manifest](https://github.com/typesafe-ai/typesafe-sdk-python/blob/v0.7.1/pyproject.toml)).

The JS SDK's browser option is deliberately named `dangerouslyAllowBrowser`; its own type comment says this exposes the API key to page users and the default is `false` ([JS SDK configuration](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts)). Claim Ledger must not enable that option in a public build.

## 3. Hosted versus local availability

The documented first-party path is TypeSafe's hosted API. Hosted third-party paths also exist, including Vercel AI Gateway (`typesafe-ai/jev`), OpenRouter (`typesafe/jev-1.13` or its latest alias), and Cloudflare Workers AI (`typesafe/jev`) ([Vercel model page](https://vercel.com/ai-gateway/models/jev), [OpenRouter TypeSafe models](https://openrouter.ai/typesafe), [Cloudflare model page](https://developers.cloudflare.com/ai/models/typesafe/jev/)). Their identifiers, request adapters, prices, context descriptions, retention controls, and billing are provider-specific.

No first-party document or TypeSafe repository reviewed here publishes Jev model weights, a local inference runtime, or a supported self-hosting recipe. The TypeSafe customer agreement describes the product as TypeSafe-hosted web and API services and restricts reverse engineering, model distillation, and using output to develop a competing model ([Master Customer Agreement, §§1–2](https://typesafe.ai/legal/mca)). The safe conclusion is therefore:

> Publicly documented Jev inference is hosted. A supported local/on-premises deployment is **not established by the public sources reviewed**.

That is not proof that TypeSafe never offers private deployment by separate enterprise agreement; public materials do not answer that question. Ask sales directly if on-premises inference is a requirement.

### GitHub Pages consequence

GitHub Pages is static hosting for repository HTML, CSS, and JavaScript ([GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). It cannot safely hold a TypeSafe secret or provide a trusted server-side API route. Therefore the deployable shape must be:

```text
GitHub Pages UI ──authenticated request──> small server-side proxy ──secret──> Jev API
       │                                           │
       └── public/static demo data                 ├── input limits
                                                   ├── origin/auth checks
                                                   ├── rate + spend limits
                                                   └── redacted audit metadata
```

An offline showcase may instead use checked-in, clearly labeled recorded responses. A “bring your own API key in the browser” mode would expose the visitor's key to the page origin and is inappropriate as the default.

## 4. Pricing, licensing, and product constraints

Separate three different licenses/agreements:

1. **SDK source:** official TypeSafe SDK repositories are MIT-licensed.
2. **Jev hosted service:** governed by the TypeSafe order and Master Customer Agreement, not the SDK's MIT license.
3. **Claim Ledger source:** can use the user's chosen open-source license, but that license cannot grant rights to the Jev service.

Relevant service restrictions include:

- an application may integrate the API for its end users;
- it may not offer the TypeSafe service as a standalone resold service;
- it may not reverse engineer the service, distill it, or use its output to develop an imitating/competing model;
- access credentials must remain confidential;
- the customer is responsible for having rights and permissions for submitted input;
- purchased credits ordinarily expire at the earlier of the end of the service term or 12 months after purchase; and
- TypeSafe disclaims ownership of output and assigns any TypeSafe rights in it to the customer, to the extent permitted by law.

See the [Master Customer Agreement, §§2, 4, 5, and 8](https://typesafe.ai/legal/mca). This note is technical planning, not legal advice; re-check the agreement applicable to the actual account before launch.

## 5. Probabilities and confidence: do not conflate them

For `Choice`, `probabilities[label]` is the returned distribution across the caller-defined options and sums to 1. The selected `choice` is the highest-probability option. `confidence` is a separate 0–1 statistic derived from the shape of that distribution. For `Score`, probabilities apply to rubric levels and the returned score is their probability-weighted value. `Noul` returns only its yes-probability and has no separate confidence field ([API reference](https://docs.typesafe.ai/api), [Confidence](https://docs.typesafe.ai/confidence)).

Consequences for Claim Ledger:

- Do not label `confidence` as “probability the verdict is correct.” TypeSafe documents it as a derived certainty summary.
- Preserve the entire distribution, not just the winner and confidence.
- Tune thresholds separately for each question formulation, primitive, model version, and action. TypeSafe explicitly warns not to transfer a threshold between a Noul and a Choice.
- Include an explicit escape option such as `says_nothing` or `insufficient_context`; otherwise a Choice must select the least-wrong supplied label.
- Use asymmetric product policy. A “supports” verdict that could publish or approve a consequential claim should need stronger evidence and/or human review than a route to “needs review.”
- Calibrate on a labeled Claim Ledger dataset. The vendor's general statements about calibrated decisions do not validate a project-specific threshold.

The model's own jaggedness page also shows that a Noul and an equivalent yes/no Choice need not give arithmetically interchangeable values, and separately phrased propositions need not satisfy logical identities ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)).

## 6. State, reduce, and Choice patterns

### State

Use a JSON object, not a concatenated prompt string. Keep the relevant claim and one candidate passage adjacent and named:

```json
{
  "claim": {"id": "c-017", "text": "..."},
  "evidence": {
    "source_id": "s-003",
    "passage_id": "s-003:p-042",
    "section": "4.1.3",
    "text": "..."
  }
}
```

Do not send the whole corpus. TypeSafe documents accuracy loss when state contains irrelevant detail and recommends filtering first ([State](https://docs.typesafe.ai/concepts/state), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)). Metadata that is not meant to influence judgment—hashes, filesystem paths, UI flags—should remain outside model state.

### Reduce

`reduce` is **not a Jev primitive**. The official primitives are only Choice, Score, and Noul. Reduction must be an application-level operation:

1. split sources deterministically into stable passages;
2. retrieve a recall-oriented shortlist locally;
3. ask a relevance Noul or relation Choice per candidate;
4. keep the raw per-candidate outputs;
5. sort/filter in code; and
6. require an abstention/review path when nothing passes.

This matches TypeSafe's official reranking and RAG-passage recipes: fast search makes the shortlist, Jev judges query-candidate pairs, and code sorts/routes the outputs ([Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe), [Classifying RAG passages](https://docs.typesafe.ai/cookbooks/classifying_rag_passages)). Never collapse candidates irreversibly before the audit record is written.

For small already-segmented sources, TypeSafe also documents a line-selection variant: assign stable IDs to quotable lines, use a Choice distribution to rank them, and ask a companion Noul whether the document contains an answer at all. This companion check matters because Choice always allocates its probability mass and therefore always has a winner, even when every option is irrelevant. Choice supports at most 255 options, so larger sources require a deterministic shortlist or hierarchical/two-pass search ([Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find)).

### Choice

Use Choice where labels are mutually exclusive and relative. For the primary evidence relation:

```text
supports       passage states or directly implies the atomic claim
contradicts    passage states or directly implies the claim is false
says_nothing   passage does neither
```

Keep criteria literal and aligned with the instruction. Avoid `true/false` labels whose meaning reverses the prose, hidden conjunctions, double negatives, or questions that combine relevance, authority, freshness, and support in one judgment. Ask those dimensions independently and combine them in code.

## 7. Citation and exact-quote verification recipe

TypeSafe's official citation-checking cookbook provides the right division of labor ([Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check)):

1. **Locate exactly in code.** Normalize only documented presentation differences (for example, whitespace and curly quotes), then perform deterministic substring matching against the canonical source text.
2. **A missing quoted span is fabricated under the selected normalization policy.** No model call is needed.
3. **Recover context deterministically.** Use the containing section or a stable bounded window around the exact match.
4. **Judge semantic support with Choice.** Send `{claim, section}` and ask `supports | contradicts | says_nothing`.
5. **Gate on validated policy.** The cookbook demonstrates 0.8 as a starting threshold and explicitly says to tune it on one's own documents; it is not a universal Claim Ledger threshold.
6. **Preserve human review.** Low-confidence judgments should not silently become final verdicts.

For Claim Ledger, strengthen the cookbook's minimal data model. Each evidence attachment should store:

- `source_id` and immutable source SHA-256;
- extraction/parser name and version;
- canonical text SHA-256;
- exact quote as displayed;
- normalized quote and normalization-policy version;
- UTF-8 byte offsets and/or Unicode code-point offsets into canonical text;
- page/section locator for humans;
- surrounding context hash;
- deterministic exact-match status;
- Jev request hash, raw relation distribution, confidence, returned model ID, and timestamp;
- policy/ruleset version; and
- reviewer identity, action, and time when applicable.

Exact quote presence and semantic support are independent checks. A verbatim quote may not support the claim; a source section may support a claim without containing the proposed quote. Keep those statuses separate. Also expose the cookbook's known limitation: an exact normalized match treats a truncated or lightly paraphrased quote as missing; fuzzy matching, if later added, needs a distinct status and must never be presented as exact.

## 8. Reproducibility and version pinning

For a reproducible evaluation or review record:

- pin `jev-1.13.0`, not `jev-latest`; aliases move and answers may change ([Models](https://docs.typesafe.ai/models));
- pin the SDK exactly (`@typesafe-ai/sdk@0.6.0` or `typesafe-sdk==0.7.1`) and commit the package lock;
- pin parser/OCR versions and record their configuration;
- hash raw files, canonical extracted text, passages, questions, criteria, and full requests;
- store the concrete response `model`, raw answer distribution, token usage, provider/request ID when available, and error/retry metadata;
- version the normalization, chunking, retrieval, prompt/rubric, and threshold policies separately;
- freeze a labeled development set and a distinct locked test set;
- cache immutable raw responses for report replay, but clearly distinguish replayed evidence from fresh inference; and
- never claim that a second live call is a replay of the first merely because input and pinned model are the same.

The public API exposes no seed or deterministic-decoding control in its request schema ([API reference](https://docs.typesafe.ai/api)). TypeSafe's own self-consistency cookbook reports Choice label flips across repeated semantically equivalent runs, while noting that its fresh irrelevant `uid` field means the experiment cannot separate sensitivity to that field from variation on byte-identical requests ([Self-consistency: choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook)). The public sources therefore do not establish bit-for-bit deterministic responses. Treat reproducibility as **artifact replay plus exact version/input provenance**, not guaranteed re-inference identity.

## 9. Privacy and security implications

Every live Jev call sends the supplied claim/evidence text to a hosted provider. TypeSafe says it does not train or fine-tune models on customer requests/responses. Its public privacy policy nevertheless says it collects service input, may use personal data to provide and improve the service, may disclose input to service providers, and hosts services in the United States. General retention is “as long as reasonably necessary”; zero-data-retention is described as an enterprise option, not the default ([Models: data handling](https://docs.typesafe.ai/models), [Privacy Policy](https://typesafe.ai/legal/privacy-policy), [Legal overview](https://docs.typesafe.ai/legal)).

The DPA identifies the customer as controller and TypeSafe as processor for customer personal data, lists subprocessors through the trust site, provides security-incident terms, and addresses international transfers ([Data Processing Addendum](https://typesafe.ai/legal/data-processing)). Do not infer certification, residency, or ZDR from marketing copy; verify the actual account and provider route.

Minimum PoC controls:

- keep the API key only in a server-side secret store;
- never log authorization headers; avoid request-body debug logging because the official JS SDK notes that debug bodies are not redacted;
- impose authentication, allowed-origin checks, payload limits, rate limits, and a hard spend limit on the proxy;
- minimize state to the claim and necessary passage, and redact personal/sensitive data when it is not needed for the judgment;
- obtain rights/consent to send each document to every selected provider;
- encrypt private ledger data at rest and avoid publishing source text or live response payloads in the GitHub Pages repository;
- define deletion for uploaded files, extracted text, caches, and logs;
- treat source text as adversarial data. Jev 1.13 does not treat state as hostile by default, and injected instructions can influence answers ([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13));
- validate every returned answer key, type, label set, probability range/sum, and model ID before use; and
- keep Jev advisory. It must not directly publish, delete, approve, or execute a consequential action.

## 10. Relationship to DocJev

[DocJev](https://github.com/jerryjliu/docjev) is an **independent** Apache-2.0 Python project by Jerry Liu, not an official TypeSafe product. It classifies whole documents and splits PDF/DOCX/PPTX packets. LiteParse performs local extraction/OCR, while normalized page text is sent to hosted Jev for category and boundary judgments; optional LlamaParse performs cloud OCR. Its README explicitly says local OCR does not make inference offline. The revision reviewed here is `7e6b48d3f7eec8db7b582e7276f2778c0d12ca3d`; its package version is `0.1.0` ([pinned DocJev README](https://github.com/jerryjliu/docjev/blob/7e6b48d3f7eec8db7b582e7276f2778c0d12ca3d/README.md), [pinned project manifest](https://github.com/jerryjliu/docjev/blob/7e6b48d3f7eec8db7b582e7276f2778c0d12ca3d/pyproject.toml), [license](https://github.com/jerryjliu/docjev/blob/7e6b48d3f7eec8db7b582e7276f2778c0d12ca3d/LICENSE)).

DocJev is useful as a reference implementation for:

- pinned `jev-1.13.0` requests;
- stable category IDs and explicit `other` fallback;
- bounded windows without silent truncation;
- validation of complete answer sets and allowed labels;
- separate exact page provenance, model judgments, review reasons, and timing/usage records;
- conservative failure on unreadable nonblank pages; and
- honest benchmark manifests and limitations.

It is not Claim Ledger's semantic or architectural parent. DocJev solves document classification and page-boundary splitting, whereas Claim Ledger should solve claim atomization, evidence attachment, exact quote provenance, relation assessment, and human attestation. Importing DocJev as a dependency would bring a Python/OCR/document-splitting stack that a browser-facing claim ledger may not need. Reuse patterns or code only after a concrete requirement justifies it and retain Apache-2.0 notices.

DocJev's own security guidance is also directly relevant: its demo is localhost-only without production authentication or multi-tenant isolation; local caches contain document content; and untrusted PDFs/Office files should be parsed in an isolated environment ([DocJev security policy](https://github.com/jerryjliu/docjev/blob/7e6b48d3f7eec8db7b582e7276f2778c0d12ca3d/SECURITY.md)).

## 11. Practical limitations for the Claim Ledger PoC

1. **No claim generation.** Jev cannot reliably turn prose into novel atomic claims. The PoC should start with user-authored claims or use deterministic/imported claim rows; any future generative atomizer is a separate model and trust boundary.
2. **No citation discovery guarantee.** Retrieval determines recall. Jev can only judge candidates it receives.
3. **No native PDFs or images.** OCR/extraction quality is upstream and must be recorded.
4. **Context rot.** Whole-document state may reduce accuracy even before hard limits. Pairwise candidate evaluation is safer and more inspectable.
5. **Literalness and indirection.** Compound claims should be split. A citation that supports only one conjunct must not verify the compound.
6. **Adversarial evidence.** Prompt-like source text can steer Jev; explicit criteria, minimal context, tests, and human review are required.
7. **No rationale.** Jev returns a typed judgment and distributions, not a faithful explanation. UI prose must not fabricate reasoning. Show the actual claim, passage, labels, and probabilities instead.
8. **Confidence is not correctness.** Thresholds require an application-specific labeled set and error-cost analysis.
9. **Hosted dependency.** Live review needs network access, an account, credits, and a secure proxy. GitHub Pages alone is insufficient.
10. **Mutable service surface.** Rate limits and aliases can change; API compatibility may also change under the customer agreement. Pin and monitor.
11. **Language quality is uneven.** English is the primary training language; TypeSafe advises testing non-English workloads independently ([Models](https://docs.typesafe.ai/models)).
12. **Small demos prove little.** Evaluate by claim type, source type, document length, negation, partial support, contradiction, missing evidence, OCR noise, and injection—not just aggregate accuracy.

## 12. Recommended PoC contract

The smallest credible Jev-backed slice is:

```text
Input:      one user-authored atomic claim + one text source
Local:      hash source -> canonicalize -> chunk -> retrieve candidates
Exact:      locate user-selected quote -> record offsets/hashes
Jev:        relation Choice per claim/candidate pair
Policy:     auto-reject fabricated exact quotes;
            accept nothing consequential without validated threshold/human review
Output:     immutable ledger entry + reviewer decision + exportable provenance bundle
```

Success should mean more than a polished interface. Before expanding scope, require:

- a frozen, labeled dataset with support, contradiction, partial support, irrelevant evidence, missing quotes, paraphrases, OCR errors, and adversarial text;
- reported confusion matrices and selective accuracy/coverage at each review threshold;
- zero false “exact quote” matches under the declared normalization policy;
- complete provenance for every displayed verdict;
- successful replay from stored artifacts without a live provider call; and
- no client-visible provider secret in the built GitHub Pages assets or network trace.

## 13. Open uncertainties and verification gates

The following are not established by the reviewed public sources and must not be presented as facts:

- whether TypeSafe offers customer-hosted/on-premises Jev under a private enterprise agreement;
- a formal mathematical definition of the returned `confidence` statistic;
- bit-for-bit determinism for identical live calls;
- a Claim Ledger-specific calibrated threshold;
- default request/response retention duration for the account that will be used;
- exact data residency and ZDR status for TypeSafe or any chosen gateway route;
- future model alias, price, rate-limit, or context-window values; and
- whether gateway adapters preserve every native Jev response field identically.

Release gates should therefore include: confirm the active provider contract and retention settings; confirm current model/price/limits from live first-party pages; make one authenticated smoke call and record the concrete model ID; validate CORS/proxy behavior; and run the frozen evaluation before enabling any automatic “verified” state.
