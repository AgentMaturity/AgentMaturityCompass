# Normative verifier fixtures, v1

A conforming verifier MUST produce the dimension statuses and reason codes in each expected.json.

Each case directory here that holds an `expected.json` is one normative case for verifiers of AMC records (P1-06).
The rules each case exercises are in [docs/STANDALONE_VERIFIER.md](../../../docs/STANDALONE_VERIFIER.md) and
[ACCEPTANCE_RULES.md](../../ACCEPTANCE_RULES.md). Other folders here are separate fixture families with their own
format: `lighthouse-finance/` (P1-19) is not run by the conformance runner. The A4 project record fixtures (P1-63) are
still in `tests/fixtures/contracts/a4-record/`, checked by AMC's `verifyA4Bundle` and run as the separate `a4-record`
conformance class (P3-24), never as verifier cases.

## Case format

Every file is JSON (UTF-8), except evidence items, which are raw bytes.

| File | Content |
| --- | --- |
| `artifact.json` | The record to verify. A receipt is its token as a JSON string. P1-08 records (rotation statements, revocation lists) are in their one canonical encoding. |
| `trust-list.json` | One signed trust list (P0-09 format) the verifier is given. |
| `more-trust-lists/<n>.json` | Optional further trust lists, given after `trust-list.json` in name order. |
| `params.json` | `asOf` (RFC 3339), `trustRoots` (pinned root key ids), optional `rootThreshold` (the pinned m-of-n), optional `expect` (`tenant`, `deployment`, `subject`, `profile`) and optional `knownSequences` (`{ "<id>": <n> }`). |
| `evidence/<sha256>` | Optional evidence items, each named by the sha256 of its bytes. |
| `expected.json` | `case`, `normative`, `dimensions` (the six statuses), `reasonCodes` (per dimension, the codes that must be reported) and `exitCode`. |
| `README.md` | What is wrong with the record and why it must not pass (or why it must). |

A verifier passes a case when its six statuses equal `dimensions` exactly, the codes it reports for each dimension
include every code `reasonCodes` lists (it may report more), and its exit code equals `exitCode` (0 every dimension
passes, 1 any fails, 3 none fails and one is not evaluated). Each case has exactly one defect, so the expected codes do
not depend on the order in which a verifier checks.

## Running a verifier

```bash
node packages/verifier/conformance/run.mjs --cmd "<command>" [--fixtures spec/fixtures/v1] [--out conformance-results.json]
```

For each case the runner calls `<command> verify artifact.json --trust-list trust-list.json [--trust-list more-trust-lists/<n>.json]... --trust-root <id>...
[--root-threshold <n>] --as-of <asOf> [--expect-<key> <value>]... [--known-sequence <id>=<n>]... [--evidence-dir evidence] --json` and reads a
verifier report (spec/schemas/v1/verifier-report.schema.json) from standard output: `<dimension>.status` and
`reasonCodes.<dimension>`. `<command> --version` names the implementation. The command is split on whitespace and run
without a shell. Results go to `conformance-results.json`:

```json
{ "suite": "amc-verifier-fixtures", "version": "v1", "implementation": "<name>@<version>",
  "ranAt": "<RFC 3339>", "passed": 55, "failed": 0,
  "cases": [{ "case": "cross-tenant", "result": "pass", "diff": null }] }
```

## Regenerating

```bash
node spec/fixtures/v1/generate.mjs              # rewrites every case directory in place
node spec/fixtures/v1/generate.mjs --out <dir>  # writes them elsewhere
```

The generator uses only Node built-ins and shares no code with any verifier. Each key comes from a fixed 32-byte seed,
sha256(`amc-verifier-fixtures/v1:<name>`), so no private key is committed. Ed25519 signatures are deterministic and every
time is a constant: regeneration is byte-identical, so these fixtures fix the bytes as well as the verdicts
(`tests/verifier/fixturesDeterministic.test.ts`). The verdicts are written by hand from the rules, never computed by a
verifier. Every fixture key's trust-list `subject` starts with `TEST ONLY`; their seeds are public, so they must never
appear in a trust list outside this corpus.

## Cases

The 19 cases P1-06 names: `valid-attestation`, `valid-external-evidence-attested`, `forged-embedded-key`,
`unpinned-issuer`, `wrong-purpose`, `revoked-key-compromise`, `revoked-superseded-earlier-claim`, `distrusted-key`,
`stale-attestation`, `stale-trust-list`, `replayed`, `contradictory`, `cross-tenant`, `empty`, `missing-evidence`,
`unanchored`, `backdated`, `tampered` and `rollback-revocation-list`. P1-27 adds the DSSE in-toto cases `dsse-valid`
(exit 3: satisfaction is `NOT_RECOMPUTABLE`), `dsse-subject-mismatch`, `dsse-wrong-payload-type`, `dsse-unpinned-key`,
`dsse-expired` and `dsse-independent-claim-seal-key`. The others give every reason code and every record kind at least
one case. The spec expected `revoked-superseded-earlier-claim` to pass with a claimed-time warning; it is
refused here (`ISSUER_REVOKED`) because a claimed time is not a trusted timestamp, and
`revoked-superseded-as-of-before-revocation` shows the cut-off the verifier's user sets with `--as-of`. Once P1-25 adds
RFC 3161 timestamps to these records, a signature a pinned TSA proves earlier than the revocation becomes a pass with a
warning; that case will be a new fixture. Scoped attestations here are v2 (`spec/schemas/v2/scoped-attestation`);
`scoped-attestation-v1` shows that v1 is not a supported version. Do not claim interoperability until an independently built verifier (P3-03) passes them all.
