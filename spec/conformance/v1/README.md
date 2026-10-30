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
| `a4-record` | Normative | Judge an exported A4 Forge project (`amc.a4-record/v1`) against the "A4 project record" rules in [ACCEPTANCE_RULES.md](../../ACCEPTANCE_RULES.md) and report the six dimensions with their reason codes |

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

### A4 record (`a4-record`)

A class of its own (P3-24), so that conformance to the `verifier` class never needs the A4 chain, binding and readiness
rules. A `verifier` results file says nothing about A4 records, and "A4 record interoperable" is a separate claim that
needs this class's own results from two independently built verifiers.

The implementation gets one `amc.a4-record/v1` export (P1-63, `tests/fixtures/contracts/a4-record/`) and the fixture
trust list, and prints a verifier report (`spec/schemas/v1/verifier-report.schema.json`) on standard output. A case
passes when that report is a valid verifier report, its six statuses equal the case's `expect.dimensions` exactly, and
it reports every code in `expect.reasonCodes`. A code counts when the report's `reasonCodes` lists it for that
dimension, or when one of the dimension's `errors` (integrity) or `reasons` lines opens with it (`A4_CHAIN_INVALID: …`).
The claim fields every AMC CLI JSON result carries (`claimKind`, `statusDimensions`, `claimLabel`) may sit beside the
report; any other extra member fails. The exit code is not judged: the A4 record rules define the report, not an exit
code. Placeholders: `{record}`, `{trustList}`, `{trustRoots}` (the `amc.trust-roots` file) and `{trustRoot}` (its root
key id).

| Case | Fixture | integrity | scope | freshness | completeness | satisfaction |
| --- | --- | --- | --- | --- | --- | --- |
| A4R-001 | `valid` | pass | pass | pass | pass | pass, `GATE_OPEN` |
| A4R-002 | `second-vote-lands` | pass | pass | pass | pass | pass |
| A4R-003 | `builder-approved-own-revision` | pass | pass | pass | pass | fail, `SOD_VIOLATION` |
| A4R-004 | `stale-approval` | pass | pass | fail, `DECISION_NOT_BOUND` | pass | pass, `GATE_OPEN` |
| A4R-005 | `dangling-evidence-ref` | pass | pass | pass | fail, `REF_DANGLING` | not-evaluated |
| A4R-006 | `deleted-evidence-ref` | fail, `A4_SIDE_ROW_MISMATCH` | pass | pass | fail, `A4_SIDE_ROW_MISMATCH` | not-evaluated |
| A4R-007 | `tampered-transition` | fail, `A4_CHAIN_INVALID` | not-evaluated, `INTEGRITY_FAILED` | not-evaluated, `INTEGRITY_FAILED` | not-evaluated, `INTEGRITY_FAILED` | not-evaluated, `INTEGRITY_FAILED` |

Issuer admission is `pass` in every case: the fixture trust list pins the workspace's monitor and auditor keys. All
seven cases are normative. A pass is evidence about the record's bytes and its gate rules, never about the agent: every
gate decision is `self_reported`.

#### Known traps for A4 record implementers

The second-verifier implementer guide (P3-03) points here. Each trap is a rule in ACCEPTANCE_RULES.md "A4 project
record" that a first implementation tends to get wrong.

1. Chain continuity. Transitions run from seq 0 with no gap; `prev_digest` is `GENESIS` at seq 0, then the previous
   `body_digest`, which is sha256 over `body_json` exactly as stored. Never re-serialize a column before hashing it
   (A4R-007).
2. Binding and intent recomputation. `binding_digest` is recomputed from `request_json` with `status` set to
   `"PENDING"`, and every intent slot is recomputed from the rows as they stood before the gate's `GATE_REQUESTED`;
   neither is read from the record.
3. Stale or digest-less decisions count for nothing. A decision whose request digest is not its gate's
   `binding_digest`, or that carries none, fails freshness (`DECISION_NOT_BOUND`) and is not counted toward the quorum,
   so the gate stays open (A4R-004).
4. A builder who approves their own revision fails. On a completion gate, an approval by any principal with a build
   transition on the revision is `SOD_VIOLATION`, even when the row was written past the gate rules (A4R-003).
5. Side-row completeness comes from the transition body. Each body's `sideRows` names every row its transition
   inserted; compare the named set with the exported rows as key sets, never as counts. A missing row fails integrity
   and completeness both (A4R-006).
6. The readiness digest excludes `evaluatedAt` and `allowed`, the gate-derived items and the three unbound environment
   facts, so a first approval never moves the digest a second approver binds (A4R-002).
7. The gate-policy digest is derived, and so is `selfApprovalAllowed`. The policy in force is the latest
   `GATE_POLICY_CHANGED` before a transition, else the `CREATED` body; self-approval needs recorded facts on a chain
   not ratcheted before it. Never read either from a column that claims it.
8. The lane is derived from the claim kind and the referenced row's tier and method (`laneForClaimKind`), never taken
   from the stored lane.
9. Envelope keys count only within their validity window. An auditor key that is expired, revoked, distrusted or not
   yet valid is `KEY_ROTATED_OUT`: not evaluated, never valid. Keys carried in the record only locate a signer; admit
   them from the pinned trust list.

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
arrive in a PATCH. A new class arrives with its own manifest and changes no other class's cases or fixture-set
digest, so it does not move the suite version (`a4-record`, P3-24, joined suite 1.0.0). Every results file names the suite version and the fixture-set digest, the sha256 over the manifest
and every input file the run read, so two results can be compared only when both name the same digest.

## Results

[`results/`](../results/) holds AMC's own runs. They are self-reported evidence of conformity from the implementer.
Interoperability may be claimed only after a second, independently built verifier passes the same suite (P3-03).
