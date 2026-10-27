# AMC conformance suite, v1

This folder holds the conformance classes of the AMC spec and the cases that test each one. The runner is
[`packages/amc-conformance`](../../../packages/amc-conformance/README.md). It starts any implementation, in any language,
as a subprocess and writes a `conformance-results` v1 record ([`spec/schemas/v1/conformance-results.schema.json`](../../schemas/v1/conformance-results.schema.json)).

The class requirements below are the suite's working text. The Core Spec (P1-30, chapter 2) will state them
normatively. Until it does, a requirement here that P1-30 changes is corrected in a PATCH release of the suite.

## Classes

| Class | Status | What an implementation must do |
| --- | --- | --- |
| `verifier` | Normative | Judge a record against a pinned trust list and an as-of time, and report the six dimensions (integrity, issuer admission, scope, freshness, completeness, satisfaction) with their reason codes |
| `producer` | Normative (initial cases) | Write records that parse as the `evidence-event` and `receipt` contracts, chain by hash and carry a claim kind. An importer never claims enforcement |
| `adapter` | Normative (initial cases) | Turn a recorded hook payload and a policy into `allow`, `deny` or `ask`, with a receipt that names the hook as the enforcement boundary. Observation-only mode never claims enforcement |
| `compiler` | Informative | Same inputs give the same plan digest; a crosswalk never auto-passes. Judged once P1-10's golden outputs exist |

A class is never claimed in part. An implementation is conformant to a class only when a results file for that class
says `conformant: true`, which needs every normative case to pass. An importer cannot claim the adapter class: it never
held a boundary, so it can never say a policy was enforced (strategy L624).

### Verifier

One case per directory of [`spec/fixtures/v1/`](../../fixtures/v1/README.md) that holds an `expected.json`. The
implementation prints a verifier report (`spec/schemas/v1/verifier-report.schema.json`) on standard output. A case
passes when that report is a valid verifier report, its six statuses equal `expected.json` exactly, it reports every
expected reason code, and its exit code is the expected one (0 every dimension passes, 1 any fails, 3 none fails and one
is not evaluated). Output that is not JSON, a crash or a timeout is `error`, never a pass. Every negative fixture expects
at least one `fail`, so a verifier that passes the class makes no false accept on them.

### Producer

The implementation gets a scenario (`producer/*.json`: a session id, a role and a list of tool actions) and an empty
output directory. It writes:

| File | Content |
| --- | --- |
| `events.jsonl` | One `evidence-event` v1 per line, in chain order. The first has `prevEventHash: "GENESIS"`; each later one names the previous one's `eventHash`. |
| `receipts.jsonl` | Optional. One `receipt` v1 per line. |
| `producer.json` | `{ "name": "<name>", "role": "producer" \| "importer" }`. |

| Case | Normative | Check |
| --- | --- | --- |
| PRD-001 | yes | Every event parses as `evidence-event` v1 and every receipt as `receipt` v1 (each carries a claim kind) |
| PRD-002 | yes | The events chain by hash from `GENESIS`, with no repeated `eventHash` |
| PRD-003 | yes | The same for an importer's records |
| PRD-004 | yes | An importer (the scenario's or `producer.json`'s role) writes `enforcement` `none` on every receipt and on any event's `meta.enforcement` |
| PRD-005 | no, skipped | `writerSignature` verifies under a test trust list. Waits for P1-30's single key-id rule ([ACCEPTANCE_RULES.md](../../ACCEPTANCE_RULES.md)) |

Recomputing `eventHash` is not a case: AMC's pre-image includes a local `payload_path`, which another implementation
cannot reproduce (ACCEPTANCE_RULES.md). It becomes a case once P1-30 settles a portable pre-image.

### Adapter

The implementation gets a recorded hook payload (`adapter/hooks/`, Claude Code 2.1.296 `PreToolUse`) and a policy
(`adapter/policies/`), and prints `{ "decision": "allow" | "deny" | "ask", "receipt": { "enforcement": { "level": ..., "boundary"?: ... } } }`.
A policy is `{ "mode": "enforce" | "observe", "rules": [{ "tool": "<tool_name>", "decision": ... }], "default": ... }`:
the first rule naming the payload's `tool_name` decides, otherwise `default`.

| Case | Normative | Expect |
| --- | --- | --- |
| ADP-001 | yes | `Bash` under `enforce.json`: `deny`, enforced at a boundary naming `PreToolUse` |
| ADP-002 | yes | `Read` under `enforce.json`: `allow`, enforced at the hook |
| ADP-003 | yes | `WebFetch` under `enforce.json` (no rule): `ask`, enforced at the hook |
| ADP-004 | yes | `Bash` under `observe.json`: `allow`, and the receipt never says `enforced` |

The `enforcement` vocabulary is the one every AMC record uses: `none`, `advisory`, `observed`, or `enforced` with a
`boundary`. The Pi and Claude Code adapters (P1-22, P1-23) add their own cases in a later MINOR.

### Compiler

CMP-001 (same inputs, same plan digest) and CMP-002 (a crosswalk never auto-passes) are listed and skipped. A compiler
run is therefore never conformant until P1-10's golden outputs exist and these cases become normative in a new MINOR.

## Case manifests

`<class>.json` holds `suite` (the suite version), `class` and `cases`. Every case has an `id` that is never reused or
renumbered, a `name`, `normative`, the inputs its class reads (paths from the repository root) and, for a case that is
not run yet, `pending` with the reason. A verifier case:

```json
{ "id": "VER-022", "name": "forged-embedded-key", "normative": true, "fixture": "spec/fixtures/v1/forged-embedded-key/",
  "input": { "artifact": "artifact.json", "trustList": "trust-list.json", "asOf": "2026-10-01T00:00:00.000Z" },
  "expect": "expected.json" }
```

## Versioning

The suite's MAJOR and MINOR follow the spec's. New normative cases arrive only in a new MINOR; corrections to a case
arrive in a PATCH. Every results file names the suite version and the fixture-set digest, the sha256 over the manifest
and every input file the run read, so two results can be compared only when both name the same digest.

## Results

[`results/`](../results/) holds AMC's own runs. They are self-reported evidence of conformity from the implementer.
Interoperability may be claimed only after a second, independently built verifier passes the same suite (P3-03).
