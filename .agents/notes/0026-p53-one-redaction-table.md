# ADR-0026 — P5.3: one redaction table, and the private key it was letting through

Status: accepted · Date: 2026-08-26 · Follows [ADR-0025](0025-p52b-drift-sprawl-measured.md)

## Five engines, not three

The plan says "three redaction impls". Measured, there are **five** places with
their own secret-pattern table, and they fall into two kinds:

**Redactors** (rewrite text):
- `src/bridge/bridgeRedaction.ts` — 13 patterns → `<AMC_REDACTED>`
- `src/enforce/secretBlind.ts` — 13 typed patterns → `[SECRET_BLIND:<type>]`
- `src/sdk/amcEvidence.ts` — 5 patterns → `<AMC_REDACTED>`

**Detectors** (report findings):
- `src/shield/validators/index.ts` — `validateSecretLeakage`
- `src/truthguard/truthguardRules.ts` — feeds truthguard findings

A sixth, `src/gateway/redaction.ts`, is **policy-driven by design**: operators
supply `textRegexDenylist`, and its default is two patterns. It is not a
duplicate engine and folding a hardcoded table into it would override a
deliberate configuration surface.

`src/llm/adapter/credentialGuard.ts` is also not one of these, and says so in its
own header: an exact-value guard on one path, deliberately not a pattern engine.

## They did not merely duplicate — they disagreed, 15 times out of 18

Measured before touching anything:

| sample | bridge | secretBlind | gateway (default) |
|---|---|---|---|
| AWS access key | yes | yes | no |
| Anthropic key | yes | **no** | no |
| Google API key | yes | **no** | no |
| xAI key | yes | **no** | no |
| AMC lease / token | yes | **no** | no |
| Slack bot token | **no** | yes | no |
| Slack webhook | **no** | yes | no |
| RSA private key | **no** | yes | no |
| Postgres conn string | **no** | yes | no |
| password in URL | **no** | yes | no |
| generic `api_key` | **no** | yes | no |

Which engine saw your text decided whether your secret survived.

## The row that matters: a private key crossing the bridge unredacted

`bridgeRedaction` carried:

    /BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY/gi

which requires `" KEY"` immediately after the algorithm word. A real PEM header
reads `BEGIN RSA PRIVATE KEY`. Measured against the five real forms:

    -----BEGIN RSA PRIVATE KEY-----        MISS
    -----BEGIN EC PRIVATE KEY-----         MISS
    -----BEGIN DSA PRIVATE KEY-----        MISS
    -----BEGIN OPENSSH PRIVATE KEY-----    MISS
    -----BEGIN PRIVATE KEY-----            match

**One of five.** A private key pasted into text bound for a durable, signed
bridge row was written out intact. Duplication is what hid it: `secretBlind`'s
pattern is correct, so the other path was covered, and nothing compared them.

`src/sdk/amcEvidence.ts` carried a copy of the same broken pattern — the fourth
instance in the tree. `src/shield/validators/index.ts` had a third variant,
`-----BEGIN (RSA |EC )?PRIVATE KEY-----`, which scans clean on OPENSSH and DSA.

## What was done

`src/shield/redaction/secretPatterns.ts` — one table, 18 patterns, each carrying
`type` and the `source` engine that contributed it.
`src/shield/redaction/redactSecrets.ts` — one pass, with the placeholder chosen
by the caller.

The three redactors now delegate. Their placeholders are preserved because the
difference is deliberate: a durable signed bridge row writes an anonymous
`<AMC_REDACTED>`, since naming the KIND of secret present is itself a small
disclosure, while `blindSecrets` writes `[SECRET_BLIND:<type>]` because its
consumers act on which kind leaked.

The two detectors stay separate, per ADR-0021's discipline — they answer a
different question about different content — but `validateSecretLeakage`'s PEM
pattern was widened to all five forms, because missing OPENSSH and DSA keys in a
scanner is the same defect regardless of consolidation.

## Where overlaps existed, the broader pattern won

This is ADR-0021's lesson, where consolidating the injection matchers silently
narrowed two patterns and reading the regexes did not catch it:

- `sk-` keeps bridge's `{12,}` over secretBlind's `{20,}`
- `Bearer` keeps bridge's `{8,}` over secretBlind's `{20,}`
- JWT keeps bridge's, whose second segment need not itself start with `eyJ`
- `private_key` keeps secretBlind's, which is the only correct one

`anthropic_key` is ordered before the generic `sk-` rule because `sk-ant-` has a
hyphen four characters in, so the generic pattern stops short and never covers it.

## Verification is a coverage comparison, not a reading

`tests/secretRedaction.test.ts` carries **one sample per ORIGINAL pattern from
both redactors** — 12 from bridge, 13 from secretBlind — and asserts every one
still matches, through both engines. That is the check that would have caught
ADR-0021's narrowing, and it caught two mutations here:

| mutation | result |
|---|---|
| restore the broken PEM pattern | **4 tests red** |
| drop the Google `AIza` pattern | 2 red |
| narrow `sk-` from `{12,}` to `{20,}` | 1 red |
| re-narrow the validators PEM | 1 red |

Also pinned: no table entry may carry `g` or `y` (a shared sticky regex matches
once and then does not — the service adds `g` per use), findings are collected
against the ORIGINAL text so replacements cannot shift each other's offsets, and
ordinary prose stays untouched.

One test in the first draft ended in an early `return` when a symbol was not
found, which would have passed by not running. It now imports
`validateSecretLeakage` by name and asserts.

## Verification

Full suite **10,055 / 10,055** across 1,247 files. `lint`, `typecheck`,
`check:architecture-boundaries`, `check:counts` pass.

## Still open in P5.3

The observation half: `wrap` (`cli.ts:4958`), `supervise` (`cli.ts:5014`) and
`adapters run` (`cli.ts:4447`) are three generations of the same capability on a
**shipped** CLI surface. The plan's requirement is one entry point with the three
kept as deprecation aliases for at least one release cycle, emitting a pointer.
That is a user-facing surface change and has not been started.
