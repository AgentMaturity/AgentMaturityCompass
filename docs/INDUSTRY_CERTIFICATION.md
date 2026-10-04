# Industry Certification Runs

A certification run composes, for one station (`health`, `education`, `environment`,
`mobility`, `governance`, `technology`, `wealth`), three evidence sources that AMC
already produces into one sealed result:

1. the station's **sector pack assessment** — every question of every industry pack of
   the station (`src/domains/industryPacks.ts`) plus the station's domain pack
   (`src/score/domainPacks.ts`);
2. the station's **required assurance packs** — `DOMAIN_REGISTRY[station].assurancePacks`
   (`src/domains/domainRegistry.ts`) plus any a station profile adds;
3. the **scenario (red-team) packs** — the baseline `injection` (the pack `amc ci red-team`
   runs when no `--plugins` are given) plus any a station profile adds.

Every requirement resolves to `PASS`, `FAIL` or `NOT_EVALUATED` with the evidence ids it
rests on. There is no score, percentage or weighted average anywhere in the artifact: the
overall status is `CERTIFIED` only when at least one requirement exists and **every**
requirement is `PASS`. One `FAIL` or one `NOT_EVALUATED` is `NOT_CERTIFIED`, and the
offending requirement ids are listed.

Module: `src/domains/certification/` (barrel `index.ts`). It consumes the existing APIs
only — `assessDomain`, `getIndustryPacksByStation`, `getDomainPackQuestions`,
`getAssurancePack`, `sealedRunReportVerifies`, the ledger — and writes nothing outside
`reports/certification/` under the agent's reports directory.

## What counts as evidence (and what is refused)

Measured at commit `8f57ce63` (read-only grep of the result types):

| Input | Provenance it carries | Certification treatment |
|---|---|---|
| `AssuranceReport` written by `runAssurance` (`src/assurance/assuranceRunner.ts`) | `sessionId` (the ledger session of the run), `reportJsonSha256` + `runSealSig` (auditor seal), `evidenceEventIds` per scenario (ledger event ids) | **Accepted** after three checks: the seal verifies against the workspace auditor keys (`sealedRunReportVerifies`), the report names a `sessionId`, and every measured scenario's event ids exist in the ledger inside that session. |
| `AssurancePackResult` on its own (e.g. from `latestAssuranceByPack`) | none — the pack result type has no session or run id | Not an input. Pass whole reports. |
| v1 run artifacts under `.amc/assurance/runs/<runId>/` (`src/assurance/assuranceSchema.ts`) | `runId` only; `evidenceRefs.eventHashes` and `receiptIds` are written empty by `persistV1Artifacts` | Not an input. |
| `RedTeamReport` (`src/redteam/runner.ts`) | no `sessionId`; every scenario has `evidenceEventIds: []`; `verification.status` is always `UNSIGNED_VALID` | **Refused** (`CertificationProvenanceError`). Run the same pack ids through `amc assurance run` instead — that path writes ledger events. |
| `runDomainAssurance` (`src/domains/domainCliIntegration.ts`) | none — it grades a hard-coded `SAFE_ASSURANCE_RESPONSE`, no agent is invoked | Not an input. Never will be. |
| Reports written with `amc assurance run --no-sign` | `runSealSig: "unsigned"` | **Refused** by the seal check and listed under `refusedInputs`. |
| Pack responses (`PackResponseEvidence`) | caller-supplied `sessionId` (+ optional `responseId`) | **Refused** when `sessionId` is empty or the level is not an integer 1..5. The run does not yet check that the session exists in the ledger — see *Not exercised*. |

A refused file never contributes; it is named in `refusedInputs` with the reason, and the
requirement it would have satisfied stays `NOT_EVALUATED`.

## Requirement derivation

| Kind | Requirement id | PASS criterion | Source of the rule |
|---|---|---|---|
| `industry-pack-question` | `industry-pack:<packId>:<questionId>` | recorded level ≥ L3 | `scoreIndustryPack` records any response below L3 as a compliance gap (`industryPacks.ts`); the certification applies the same line without the percentage around it |
| `domain-question` | `domain-question:<station>:<questionId>` | `assessDomain` reports no compliance gap for the recorded level | `src/domains/domainAssessmentEngine.ts` (critical questions and weight ≥ 20 need L4, others L3). Only answered questions are handed to the engine, so an unanswered one is `NOT_EVALUATED`, never the engine's default L1 |
| `assurance-pack` | `assurance-pack:<packId>` | every scenario of the pack definition is present, measured (not inconclusive) and passed in the latest accepted assurance run containing the pack | `getAssurancePack(packId).scenarios` is the complete list; a scenario missing from the run makes the requirement `NOT_EVALUATED`; any measured failure makes it `FAIL` |
| `scenario-pack` | `scenario-pack:<packId>` | same as `assurance-pack` | `DEFAULT_SCENARIO_PACK_IDS = ["injection"]`; a pack already required as an assurance pack is kept once |

A station profile (track F1, `src/domains/operatingProfiles/**`, not present at this
commit) is read through the `CertificationStationProfile` shape:
`{ id, source, industryPackIds?, requiredAssurancePacks?, requiredScenarioPacks? }`. The
caller adapts the profile's own shape to it. Profiles add packs; they cannot remove the
registry's.

## Command sequence

Prerequisites: a workspace initialised with `amc init` (auditor keys present) and an
agent reachable by the assurance runner.

```bash
# 0. Install (frozen lockfile), once per checkout
pnpm install --frozen-lockfile --prefer-offline

# 1. Produce the assurance evidence the station needs. Do NOT pass --no-sign:
#    an unsigned report is refused by the certification's seal check.
amc assurance run --agent <agentId> --pack healthcarePHI    --mode sandbox
amc assurance run --agent <agentId> --pack safetyCriticalSIL --mode sandbox
amc assurance run --agent <agentId> --pack injection        --mode sandbox

# 2. Run the certification (no CLI verb yet — see "Ready to wire"). From the checkout:
cat > /tmp/certify-health.ts <<'EOF'
import { runIndustryCertification } from "./src/domains/certification/index.js";
import { getIndustryPacksByStation } from "./src/domains/industryPacks.js";
import { getDomainPackQuestions } from "./src/score/domainPacks.js";

// Pack responses must come from a recorded assessment session: one entry per
// question with the ledger session id the answer was captured in. The levels
// below are placeholders for the operator's recorded answers, not defaults.
const sessionId = process.env.ASSESSMENT_SESSION_ID ?? "";
const packResponses = [
  ...getIndustryPacksByStation("health").flatMap((pack) =>
    pack.questions.map((q) => ({ questionId: q.id, level: Number(process.env[`LEVEL_${q.id}`] ?? NaN), sessionId }))
  ),
  ...getDomainPackQuestions("health").map((q) => ({ questionId: q.id, level: Number(process.env[`LEVEL_${q.id}`] ?? NaN), sessionId }))
].filter((row) => Number.isInteger(row.level)); // unanswered questions stay NOT_EVALUATED

const result = runIndustryCertification({
  workspace: process.cwd(),
  agentId: process.env.AGENT_ID,
  station: "health",
  packResponses
});
console.log(result.run.status, result.jsonPath, result.markdownPath);
console.log("not evaluated:", result.run.notEvaluatedRequirementIds);
console.log("failed:", result.run.failedRequirementIds);
console.log("refused inputs:", result.run.refusedInputs);
EOF
ASSESSMENT_SESSION_ID=<ledger session id> AGENT_ID=<agentId> pnpm exec tsx /tmp/certify-health.ts

# 3. Verify an export later, without trusting any field in it
cat > /tmp/verify-cert.ts <<'EOF'
import { readFileSync } from "node:fs";
import { parseCertificationExport, verifyCertificationExport } from "./src/domains/certification/index.js";
const run = parseCertificationExport(readFileSync(process.argv[2]!, "utf8"));
console.log(verifyCertificationExport(process.cwd(), run));
EOF
pnpm exec tsx /tmp/verify-cert.ts .amc/agents/<agentId>/reports/certification/<runId>.json

# 4. The runnable check for the module itself
pnpm vitest run tests/industryCertification.test.ts
```

The export is written to `<agent reports dir>/certification/<certificationRunId>.json`
with a Markdown summary beside it. `resolveSourceCommit` records the commit the module
ran from: an explicit value, else `AMC_SOURCE_COMMIT`, else `git rev-parse HEAD` of the
module's checkout, else the string `unknown` with the reason — never a guess.

## Export format (`certificationExportSchema`, `v: 1`)

| Field | Meaning |
|---|---|
| `certificationRunId`, `station`, `agentId`, `generatedTs` | identity of the run |
| `sourceCommit`, `sourceCommitResolution`, `environment { platform, arch, node }` | the boundary of the result |
| `profile` | `{ id, source }` of the station profile used, or `null` |
| `status`, `counts { total, pass, fail, notEvaluated }`, `failedRequirementIds`, `notEvaluatedRequirementIds` | the verdict and exactly why |
| `requirements[]` | `{ id, kind, title, source, regulatoryRef?, criterion, status, observed, reason, evidence[] }`; `evidence` entries are `{ kind: assurance-run \| ledger-session \| ledger-event \| pack-response, id }` |
| `inputs.assuranceRuns[]` | `{ assuranceRunId, sessionId, reportJsonSha256, ts, packIds }` of every accepted report; `inputs.packResponseCount` |
| `refusedInputs[]` | `{ source, reason }` for every report file that was not accepted |
| `reportJsonSha256`, `runSealSig` | the seal — same discipline and field names as diagnostic and assurance reports, so `sealedRunReportVerifies` applies unchanged |

`verifyCertificationExport(workspace, candidate)` checks the schema, the seal against the
workspace auditor keys, and that `status`, the id lists and `counts` follow from the
requirement statuses. Editing one requirement status voids the seal **and** trips the
status recomputation; both are reported.

## Binder ingestion — ready to wire

The audit binder (`src/audit/binder*.ts`) is owned by another session at this commit, so
the certification is **not** yet inside `binder.json`. The Markdown summary follows the
binder's `summaries/summary.md` style and the JSON carries everything a section needs.
The diff to wire it is recorded in the track receipt
(`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/F3/report.md`): an optional
`sections.industryCertification` in `binderSchema.ts`, a collector fact that reads the
latest `reports/certification/*.json` through `verifyCertificationExport`, and two files in
the tarball (`checks/industry-certification.json`, `summaries/industry-certification.md`).

## Boundary of this document

- Verified at commit `8f57ce63` on Darwin arm64 (macOS 26.6.2), Node v25.5.0, with
  `pnpm vitest run tests/industryCertification.test.ts` (16 tests) and `pnpm typecheck` /
  `pnpm typecheck:tests` — results and mutation observations in the F3 receipt.
- The fixture writes assurance reports the way the runner does (real ledger session,
  real prompt/response/test events, auditor seal). No live agent was invoked and no
  `amc assurance run` was executed in this verification.
- Not exercised: pack-response `sessionId` existence in the ledger (only non-emptiness is
  checked); the `maxEvidenceAgeMs` freshness refusal (implemented, off by default, no
  test); stations other than `health`; a real F1 station profile (the adapter shape is
  the module's own).
- This document encodes no regulation text. `regulatoryRef` values are passed through
  from the pack questions unchanged.
