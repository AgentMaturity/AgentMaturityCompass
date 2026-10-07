# Conformance runs

A conformance run is evidence of conformity within the derived requirement set, not a certification.

For one station (`education`, `environment`, `health`, `wealth`, `technology`, `mobility`,
`governance`) and one agent, a run derives a requirement set from AMC's station data, checks each
requirement against sealed evidence that is no older than a limit you set, and writes one sealed
result. Each requirement is `PASS`, `FAIL` or `NOT_EVALUATED`, with the evidence ids it rests on,
its claim kind and its five status dimensions. The run is `REQUIREMENTS_MET` only when at least one
requirement exists and every requirement is `PASS`; one `FAIL` or one `NOT_EVALUATED` makes it
`REQUIREMENTS_NOT_MET`, and the run names it. There is no score, percentage or average anywhere in
the artifact.

Module: `src/domains/conformance/` (barrel `index.ts`).

## Command

```bash
amc domain conformance --station <station> --agent <id> --max-evidence-age <duration> \
  [--responses <file.json>] [--profile <operating-profile.json>] [--out <dir>] [--json]
```

| Flag | Meaning |
|---|---|
| `--station` | A station id, title or alias (`amc domain list`). |
| `--agent` | The agent whose assurance reports are read. |
| `--max-evidence-age` | Required, no default. `<n>h` or `<n>d` with `n` a positive whole number, for example `72h` or `30d`. Evidence recorded longer ago than this before the run, or dated after the run, is refused. |
| `--responses` | Questionnaire answers: a JSON array of `{ "questionId": "...", "level": 1-5, "sessionId": "...", "responseId": "..." }` (`responseId` optional). |
| `--profile` | A signed station operating profile (`amc domain apply`) for the same station and agent. It is verified and parsed from one read (`loadSignedOperatingProfile`); its industry packs select the sector packs assessed and its assurance packs are added to the registry's. |
| `--out` | Where the run's JSON and Markdown go. Default: the agent's `reports/conformance/`, which is where the audit binder looks. |
| `--json` | Print the run with its claim fields (`claimKind`, `statusDimensions`, `claimLabel`) and the two output paths. |

Exit codes:

- `0`: a run was written, whatever its status.
- `1`: every input offered (assurance report or answer) was refused; the run is still written and lists them. Also an unexpected error.
- `2`: usage. A missing `--station`, `--agent` or `--max-evidence-age`, a duration in any other form (`invalid --max-evidence-age`), an unknown station, an unreadable `--responses` file, two accepted answers to one question, or a profile that does not verify or names another station or agent.

Text output prints the claim line, the status, the counts, every `FAIL` and `NOT_EVALUATED` requirement
with its reason, the refused inputs and the export path.

```bash
amc assurance run --agent default --pack healthcarePHI --mode sandbox   # do not pass --no-sign
amc domain conformance --station health --agent default --max-evidence-age 30d --json
```

## Requirement derivation

| Kind | Requirement id | PASS criterion | Source |
|---|---|---|---|
| `industry-pack-question` | `industry-pack:<packId>:<questionId>` | response level ≥ L3; see design rule 1 below | `src/domains/industryPacks.ts#<packId>` |
| `domain-question` | `domain-question:<station>:<questionId>` | response level ≥ the engine's required level (L4 for critical questions and weight ≥ 20, else L3); see design rule 1 | `src/score/domainPacks.ts#<station>` |
| `assurance-pack` | `assurance-pack:<packId>` | every scenario of the pack measured and passed in the newest accepted assurance run that contains the pack | `src/domains/domainRegistry.ts#<station>.assurancePacks`, or the profile |
| `scenario-pack` | `scenario-pack:<packId>` | as for `assurance-pack` | `injection` (the `amc ci red-team` default), or the profile |

A profile adds assurance and scenario packs; it cannot remove the registry's. A pack named in both
lists is kept once, as an assurance pack.

## What counts as evidence

**Assurance reports** under the agent's `reports/assurance/` are accepted only when all of these hold:
the seal (`reportJsonSha256`, `runSealSig`) verifies against the workspace auditor keys; the report names a
ledger `sessionId`; every measured scenario lists `evidenceEventIds` and each one is a ledger event in that
session; and the report's `ts` is within the maximum evidence age and not after the run. Reports written
with `--no-sign` fail the seal check. A red-team report (no session, no event ids) and the canned
`amc domain assurance` path are never inputs.

**Questionnaire answers** are admitted by `resolvePackResponseEvidence`, one check per session:

- `session <id> not found in the ledger`: no such session (`Ledger.getSessionById`).
- `session <id> is not sealed`: no seal; or the session has no events for a seal to bind; or the seal fails
  `verifyEvidenceEventIntegrity` on the session's last event (the ledger chain up to that event, the event's
  writer signature, and the monitor signature over the session's final hash), with the errors appended.
- `session <id> is older than the maximum evidence age`, or `session <id> is dated after this run`: both the
  sealing time (`ended_ts`, written by the server clock but outside the seal) and the last event's time
  (inside the seal) are checked, and either one failing refuses the answer.

The checks read one SQLite snapshot (a read transaction), so the rows checked are the rows read. An answer
with no `questionId`, no `sessionId`, or a level that is not a whole number 1 to 5 is refused too. Every
refusal is listed under `refusedInputs` with its reason; assurance reports by workspace-relative path,
answers as `responses[<index>]`. The requirement it would have met stays `NOT_EVALUATED`.

## Claim kinds and design rule 1

No ledger event type records pack answers, so a questionnaire answer is `self_reported` even when its
session verifies: the session shows the operator recorded something then, not that the answer is true.
Assurance and scenario packs are `observed`: AMC ran the scenarios against the agent.

Design rule 1 caps a self-reported answer at L1. So an answer at or above a requirement's minimum meets it
only when that minimum is L1 or lower; every question here needs L3 or L4, so such an answer is
`NOT_EVALUATED` with the reason "self-reported answer; levels above L1 need observed evidence (design
rule 1)". An answer below the minimum is the operator's own statement that the requirement is not met,
and stays a `FAIL`.

That is why, until observed evidence exists for questionnaire requirements, every station's run is
`REQUIREMENTS_NOT_MET`. That is the truthful result.

Each requirement also carries five status dimensions from `evaluateClaimEligibility`. Applicability is
`unresolved` ("no compiled plan decides applicability; the requirement comes from the station's derived
set"), so no requirement's `statusDimensions.result` is `pass` even when its conformance status is
`PASS`: the status speaks only within the derived requirement set. The run's `claimKind` is the weakest
requirement's and its dimensions are joined the same way (`envelopeForAggregate`).

## Freshness and its limit

`--max-evidence-age` has no library default; `runIndustryConformance` refuses a limit that is not a
positive whole number of milliseconds. The run's time (`freshness.nowTs`, also `generatedTs`) is the server
clock when the run starts, never a value a caller passes. Assurance report times and ledger event times
are written by the process that recorded them, so freshness is only as good as those clocks until
trusted time for ledger events lands.

## Export format (`schema: "amc.conformance-run/1"`)

| Field | Meaning |
|---|---|
| `conformanceRunId`, `station`, `agentId`, `generatedTs` | identity of the run |
| `sourceCommit`, `sourceCommitResolution`, `environment { platform, arch, node }` | the boundary of the result. The commit is an explicit value, `AMC_SOURCE_COMMIT`, or `git rev-parse HEAD` only when the package root is itself the top of a git checkout; otherwise `unknown` with the reason |
| `profile` | `{ id, source }` of the profile used (source is `sha256:<profile digest>`), or `null` |
| `status`, `counts`, `failedRequirementIds`, `notEvaluatedRequirementIds` | the verdict and exactly why |
| `claimKind`, `statusDimensions` | the weakest requirement's kind and the joined dimensions |
| `freshness { nowTs, maxEvidenceAgeMs }` | the limit the evidence was admitted under |
| `requirements[]` | `{ id, kind, title, source, regulatoryRef?, criterion, status, observed, reason, evidence[], claimKind, statusDimensions }` |
| `inputs` | accepted assurance runs `{ assuranceRunId, sessionId, reportJsonSha256, ts, packIds }` and the number of accepted answers |
| `refusedInputs[]` | `{ source, reason }` |
| `reportJsonSha256`, `runSealSig` | the seal: the canonical run with both fields empty, hashed and signed with the workspace auditor key |

`verifyConformanceExport(candidate, { workspace, trust })` checks the schema, recomputes the seal hash
over the object as given (so an added field breaks it), finds the signing key among the workspace's
auditor keys and requires `trust` to admit it for `artifact-seal`, and recomputes the status, id lists
and counts from the requirement statuses. With `workspaceSelfTrust(workspace)` it is a local audit
trail; a portable verdict needs pinned trust (P0-09, `loadTrustContext`).

## Audit binder

`amc audit binder create --scope agent --id <agent> --out <file.amcaudit>` (and the binder cache for an
agent scope) adds `sections.conformanceRun` to `binder.json`:
`{ status, conformanceRunId, station, counts, reportJsonSha256, checkSha256, summarySha256, notes }`.
The collector (`src/audit/binderConformanceRun.ts`) reads each run under the agent's `reports/conformance/`
once and verifies it under the operator's pinned trust. If there is no run, the scope is not an agent,
the trust context cannot load, or any run file there does not verify, the section has `status: null`
and the note "no verified conformance run", and no conformance file is written.

A binder never copies the run file, which holds free text (titles, reasons, refused input paths) and raw
identifiers. It carries a projection of the newest verified run, built field by field from an allowlist
(`amc.binder-conformance-run/1`): the run id, station, hashed agent id, times, source commit (or
`unknown`), status, counts, claim kind, the five status dimensions as states, freshness, input counts,
the run's seal digest, and per requirement its id, kind, status, claim kind, dimension states and evidence
references. Ledger event ids are kept; session, answer and assurance-run ids are hashed with the binder's
own identifier hashing (`hashAuditId` with the audit policy's `hashTruncBytes`, as for the binder's scope
id). Any id with whitespace, `/`, `@` or `|` is hashed too. The projection must pass the binder's PII scan,
or the section is `status: null`. A field added to the run later reaches no binder until it is added to
the projection.

The binder writes the projection as `checks/conformance-run.json` (canonical JSON) and
`summaries/conformance-run.md`, and `sections.conformanceRun.checkSha256` and `summarySha256` are the
SHA-256 of exactly those bytes, so the binder's signature covers what it carries.

## Library use

```ts
import { runIndustryConformance, verifyConformanceExport } from "./src/domains/conformance/index.js";
import { loadTrustContext } from "./src/trust/index.js";

const { run, jsonPath } = runIndustryConformance({
  workspace: process.cwd(), agentId: "default", station: "health",
  packResponses: [], maxEvidenceAgeMs: 30 * 24 * 3_600_000
});
console.log(run.status, jsonPath, verifyConformanceExport(run, { workspace: process.cwd(), trust: loadTrustContext() }).ok);
```

This document encodes no regulation text; `regulatoryRef` values come from the pack questions unchanged.
