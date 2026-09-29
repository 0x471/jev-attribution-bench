# Jev API verification for Claim Ledger

**Verified:** 2026-09-24  
**Scope:** TypeSafe's current first-party HTTP API and official SDKs, with emphasis on a bounded
claim/evidence verification experiment.  
**Evidence policy:** Primary sources only: TypeSafe documentation, TypeSafe legal terms, and the
official TypeSafe SDK repositories. No authenticated request was made, and no API key was used or
stored while preparing this note.

## Executive conclusion

Claim Ledger can use the existing `@typesafe-ai/sdk@0.6.0` integration against the native TypeSafe
API without changing its basic domain model. The correct Jev task is one narrow `Choice` over a
single claim and a short evidence context:

```text
supports | contradicts | says_nothing
```

Application code must continue to locate exact quotations, retrieve context, apply thresholds,
enforce invariants, and require human review. Jev returns a bounded semantic judgment and a
distribution; it does not establish truth, locate evidence, generate a rationale, or certify a
document. This division matches TypeSafe's own guidance to keep control flow and deterministic
work in code and use System One for narrow judgments ([How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)).

The main integration cautions are:

1. Pin `jev-1.13.0`; do not use a moving alias for a reproducible experiment.
2. Follow the stricter HTTP documentation even where the JavaScript SDK types accept `null` or
   omitted instructions.
3. Enforce a local request and token budget. The response reports token usage, but no public
   first-party balance/usage API is documented.
4. Treat the SDK's timeout as **per attempt**, not a total deadline, and decide explicitly whether
   retries are acceptable for a small prepaid test.
5. Never enable browser use or debug body logging for private source material.

## 1. Native endpoint and authentication

The first-party evaluation endpoint is:

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

The API key is a bearer credential. Both official SDKs read it from `TYPESAFE_API_KEY` by default.
The API root is `https://api.typesafe.ai`, overrideable with `TYPESAFE_BASE_URL` in the SDKs
([HTTP API reference](https://docs.typesafe.ai/api), [Python constants](https://docs.typesafe.ai/sdk/python/api/constants), [JavaScript client source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts)).

The only other public first-party endpoint documented for ordinary clients is authenticated
`GET /v1/models`, which returns the model IDs or aliases available to the account, plus their
descriptions and release dates ([Models: listing models](https://docs.typesafe.ai/models)).

Do not send the key from a static site or browser. The JavaScript SDK refuses browser construction
unless `dangerouslyAllowBrowser` is explicitly enabled, and its own configuration type says that
doing so exposes the key to page users ([JavaScript SDK configuration](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts)).

## 2. Request contract

The raw HTTP request has three required top-level fields:

| Field | Documented shape | Integration rule |
| --- | --- | --- |
| `state` | string, JSON object, or array | Use a non-null object containing one atomic claim and one short evidence context. |
| `model` | string | Send the pinned ID `jev-1.13.0`. |
| `questions` | map from caller-chosen ID to a typed question | Send a nonempty map; keep each judgment atomic. |

Question IDs only correlate requests and answers; TypeSafe says the ID is not passed to the
underlying model or used in inference. Every question sees the same state and is evaluated
independently ([API reference](https://docs.typesafe.ai/api), [State](https://docs.typesafe.ai/concepts/state)).

### Question types

| Type | Request | Response |
| --- | --- | --- |
| `noul` | Required `instructions`; optional `criteria.true` and `criteria.false` | `{type: "noul", noul: number}` where `noul` is the probability of yes. |
| `choice` | Required `instructions`; required option-description map, maximum 255 options | Selected `choice`, complete option `probabilities` summing to 1, and `confidence`. |
| `score` | Required `instructions`; ordered rubric of 2–10 descriptions | Probability-weighted `score`, `legend`, per-level `probabilities`, and `confidence`. |

See the complete [HTTP API reference](https://docs.typesafe.ai/api). For Claim Ledger, `Choice` is
the relevant primitive because the evidence relation is a closed, mutually exclusive set. `Noul`
can be useful for a separately calibrated relevance screen, but its probability is not
interchangeable with a `Choice` confidence.

### Recommended Claim Ledger request

```json
{
  "model": "jev-1.13.0",
  "state": {
    "claim": "The agreement may be terminated on 30 days' notice.",
    "evidence_context": "Either party may terminate this Agreement upon thirty (30) days' written notice."
  },
  "questions": {
    "relation": {
      "type": "choice",
      "instructions": "How does `evidence_context` relate to `claim`? Judge only the supplied evidence context.",
      "criteria": {
        "supports": "The evidence context states the claim or directly implies that it is true.",
        "contradicts": "The evidence context states the opposite of the claim or directly implies that it is false.",
        "says_nothing": "The evidence context does not establish or contradict the claim."
      }
    }
  }
}
```

This mirrors TypeSafe's own citation-checking recipe, which first locates a quotation with
deterministic string matching and then asks one three-way `Choice` about the containing section
([Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check)).

### Stricter-than-SDK validation rule

There are public-contract inconsistencies between the HTTP documentation and
`@typesafe-ai/sdk@0.6.0`:

- The HTTP reference requires every question's `instructions`, while the JavaScript interfaces
  make it optional and the `noul()` helper can default it to `null`.
- The HTTP reference describes `state` as string/object/array, while the JavaScript `EntryType`
  also includes `null`.
- The HTTP reference describes Score levels as strings/objects/arrays, while the SDK type permits
  `null` entries.

These differences are visible by comparing the [HTTP API reference](https://docs.typesafe.ai/api)
with the pinned [JavaScript question and request types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts)
and [question builders](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/questions.ts).
Until TypeSafe reconciles them, Claim Ledger should follow the stricter HTTP shape: non-null state,
explicit non-null instructions, and non-null Score descriptions. A server-side `422` is the final
authority on request validation.

## 3. Response contract and provenance

A successful response has:

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "relation": {
      "type": "choice",
      "choice": "supports",
      "probabilities": {
        "supports": 0.91,
        "contradicts": 0.01,
        "says_nothing": 0.08
      },
      "confidence": 0.84
    }
  },
  "usage": {
    "input_tokens": 321,
    "output_tokens": 34
  }
}
```

The numbers above are illustrative, not a recorded call. The authoritative shape is documented in
the [API response reference](https://docs.typesafe.ai/api) and the pinned SDK's
[`SystemOneResult`](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts).

Persist at least:

- the exact request hash and question/rubric version;
- returned concrete `model` ID;
- complete probability distribution and `confidence`;
- `input_tokens` and `output_tokens`;
- the TypeSafe request ID from `x-typesafe-request-id`, when present; and
- latency, attempt count, terminal error category, and timestamp.

`confidence` is derived from the shape of the returned distribution. It is not documented as the
probability that the selected verdict is correct. TypeSafe advises calibrating thresholds on the
application's own data and varying them with the risk of the resulting action
([Confidence](https://docs.typesafe.ai/confidence)). The citation cookbook's `0.8` auto-accept
threshold is an example and explicitly requires tuning; it is not a validated Claim Ledger policy
([Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check)).

## 4. Model, context, and task semantics

As verified on 2026-09-24:

| Property | Current first-party value |
| --- | --- |
| Stable version | `jev-1.13.0` |
| Stable alias | `jev-latest` -> `jev-1.13.0` |
| Preview alias | `jev-preview` -> `jev-1.13.0` |
| Total request context | 64k tokens across state and all questions |
| Per-question constraint | 32k tokens for state plus the longest individual question |
| Input modality | Text only; string, JSON object, or array of text values |
| Primary language | English; other languages are accepted but documented as less accurate |

Aliases can move, while the response reports the concrete model ID. Pinning `jev-1.13.0` is
therefore necessary for an experiment whose thresholds and results must be attributable to one
version ([Models](https://docs.typesafe.ai/models)).

Jev is intended for fast, bounded common-sense judgments rather than generation. TypeSafe's own
Jev 1.13 limitations include literal reading, numerical and date precision, extra indirection,
irrelevant long state, adversarial content, contradictory criteria, and generation. The official
mitigations are to be explicit, filter context first, keep arithmetic and structural invariants in
code, and use a generative model when generation is required
([Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)).

For Claim Ledger this means:

1. retrieve a short candidate context before Jev;
2. locate quoted text deterministically;
3. ask one literal evidence-relation question;
4. preserve `says_nothing` rather than forcing support or contradiction;
5. combine multiple evidence records in code rather than asking Jev for a multi-hop argument; and
6. route consequential or uncertain results to a human.

## 5. Price, usage, and credit visibility

The published native price for Jev 1.13 is **$0.042 per million input tokens**. Output tokens are
free. The service response still reports both input and output token counts
([Models](https://docs.typesafe.ai/models), [API reference](https://docs.typesafe.ai/api)). At the
published token rate, $5 corresponds mathematically to about 119 million input tokens, before any
account-specific terms, taxes, or future price changes. This is only a planning ceiling, not a
guarantee of available balance or successful throughput.

The public contract distinguishes two visibility mechanisms:

- each evaluation response reports that request's input/output tokens; and
- the customer agreement says the current TypeSafe-managed credit balance is visible in the
  customer's account ([Master Customer Agreement, section 8.2](https://typesafe.ai/legal/mca)).

No documented first-party HTTP endpoint or method in the official JavaScript/Python SDKs was found
for querying remaining credit, cumulative spend, or account-level usage. The official JavaScript
client exposes evaluation and model listing, not billing. Therefore Claim Ledger should calculate
estimated spend from successful response usage and enforce its own maximum request count/input
token estimate before dispatch. The TypeSafe console remains the authoritative published place to
check remaining credit.

Also verify that automatic credit refill is disabled for a capped experiment. The customer
agreement says the service can automatically add purchased credits when a customer has opted into
refills ([Master Customer Agreement, section 8.2(a)](https://typesafe.ai/legal/mca)).

## 6. Rate limits, timeouts, retries, and errors

### Service limits

The current published direct-service limits are:

- 250,000 tokens per second;
- 1,200 requests per minute;
- `429 Too Many Requests` when either limit is exceeded.

TypeSafe explicitly says these limits are dynamically adjusting and may change without notice, so
they must not be treated as stable capacity commitments ([Models](https://docs.typesafe.ai/models)).

### JavaScript SDK transport defaults

`@typesafe-ai/sdk@0.6.0` defaults to:

- 10,000 ms timeout **per attempt**, with no total retry budget;
- 2 retries after the initial attempt;
- retries for HTTP 408, 429, and 500–599;
- retries for connection failures and timeouts;
- initial exponential-backoff delay of 500 ms, capped at 5,000 ms, with 25% subtractive jitter;
- `Retry-After` / `retry-after-ms` honored up to 60,000 ms; and
- caller cancellation through `AbortSignal`.

These are defined in the official [retry interface](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RetryPolicy),
[client source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts), and
[retry source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/retry.ts).

Because the timeout is per attempt, a 10-second configuration can take materially longer than ten
seconds after retries and backoff. Use an outer `AbortSignal` deadline if the experiment needs a
true wall-clock limit.

The endpoint is a billable POST. The public documents reviewed do not establish an idempotency key
or a server deduplication guarantee for retried evaluations. The SDK sends an
`X-TypeSafe-Retry-Count` header, but its source does not claim deduplication. Conservatively assume
that an ambiguous timeout followed by a retry may consume work twice. For a small controlled test,
explicitly choose `maxRetries: 0` or `1`, record every attempt, and reconcile response usage with
the console balance.

### Errors

The HTTP reference documents JSON error bodies and these principal statuses:

| Status | Meaning / action |
| --- | --- |
| `401` | Missing or invalid API key; do not retry without correcting credentials. |
| `422` | Request validation failure; inspect the body for the offending field and fix the request. |
| `429` | Rate limit exceeded; back off, honoring a supplied retry delay. |
| `529` | Service overloaded; retry with backoff. |

See [API errors and rate-limit handling](https://docs.typesafe.ai/api). The JavaScript SDK also
maps 400, 401, 403, 404, 422, 429, and 5xx responses to typed errors and retains the parsed body,
headers, status, and `x-typesafe-request-id`; other non-2xx statuses become a generic `APIError`
([JavaScript error source](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/errors.ts),
[APIError reference](https://docs.typesafe.ai/sdk/javascript/api/classes/APIError)).

Uncertainties that must remain explicit:

- The public API reference does not specify the exact status/body for insufficient credit.
- It does not specify whether exceeding context size produces 413, 422, or another status.
- It does not document idempotent retry semantics.
- Rate-limit headers beyond optional retry timing are not documented as a stable contract.

Do not make application logic depend on an unverified status for those cases. Record the sanitized
status, request ID, and error category, then fail closed.

## 7. Official SDKs and the project pin

| SDK | Current verified release | Runtime | Notes |
| --- | --- | --- | --- |
| JavaScript/TypeScript | `@typesafe-ai/sdk@0.6.0` | Node.js 20+ | ESM, CommonJS, TypeScript declarations; MIT-licensed. |
| Python | `typesafe-sdk==0.7.1` | Python 3.10+ | Sync and async clients; Pydantic response-model support; MIT-licensed. |

Sources: [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript),
[JavaScript v0.6.0 manifest](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/package.json),
[Python changelog](https://docs.typesafe.ai/sdk/python/changelog), and
[Python v0.7.1 manifest](https://github.com/typesafe-ai/typesafe-sdk-python/blob/v0.7.1/pyproject.toml).

Claim Ledger already pins the current JavaScript release exactly. Keep the package lock committed
and record the SDK version beside each assessment. Do not silently update the SDK or model during
one experimental series.

### Logging and sensitive inputs

The JavaScript SDK says `info` logs request summaries and `debug` also logs headers and bodies.
Known credential headers are redacted, but request/response bodies are **not**. The default level is
`warn` ([JavaScript SDK configuration](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts)).
Keep the default or use `error`/`off` for sensitive documents, and never persist raw source content
in error receipts.

## 8. Minimum safe live-test sequence

This note does not authorize or perform a live call. When a live test is separately approved, the
minimum defensible sequence is:

1. Store the key only in an ignored local environment file or process environment; never pass it
   on a command line, paste it into source, or expose it to the viewer.
2. Confirm the console balance and disable automatic refill.
3. Use `@typesafe-ai/sdk@0.6.0`, `jev-1.13.0`, `logLevel: "off"`, a true outer deadline, and an
   explicit retry policy.
4. Run one synthetic claim/evidence pair whose expected relation is obvious.
5. Validate the entire response shape, concrete model ID, probabilities, token usage, request ID,
   local cache record, and sanitized failure receipt.
6. Run a tiny balanced smoke set containing support, contradiction, irrelevant evidence, and one
   deterministic missing-quote case. The missing quote must not call Jev.
7. Compare against frozen human labels; do not tune a threshold on the final evaluation set.
8. Stop automatically at the predeclared request/token budget, then reconcile local usage with the
   console before any larger run.

## 9. Open questions for TypeSafe

The public sources do not answer the following; ask TypeSafe support before treating them as
production contracts:

1. Is there a supported API for balance, cumulative usage, or hard spend caps?
2. What exact HTTP response is returned for insufficient credit?
3. Are retried `POST /v1/systemone` calls ever deduplicated, and is there a supported idempotency
   key?
4. What exact error is returned for each context-limit violation?
5. Are account-specific rate limits or remaining quota available programmatically?
6. Does the account have zero-data-retention enabled, and what are its actual retention and
   regional-processing terms?

