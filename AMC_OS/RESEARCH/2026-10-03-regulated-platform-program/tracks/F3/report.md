# Track F3 — Industry certification runs — receipt

- Worktree: `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_fc54d4b0-c89-3`
- Branch: `worktree-wf_fc54d4b0-c89-3`
- Base: `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` (verified with `git rev-parse HEAD` before the first edit; no merge needed)
- Code commit: `44ba1d9d` — `feat: add industry certification runs composed from sealed evidence`
- Environment: Darwin arm64 (macOS 26.6.2), Node v25.5.0, pnpm v10.33.0, vitest v4.1.11 (printed by the runner)
- Date: 2026-10-03
- Status: **PARTIAL** — the track's own acceptance is met; binder ingestion is at a ready-to-wire boundary because `src/audit/**` belongs to another session.

## What changed and why

All paths are new files; no existing file was edited. Line counts measured with `wc -l`.

| File | Lines | Purpose |
|---|---:|---|
| `src/domains/certification/certificationSchema.ts` | 123 | zod schema + types for the export (`v: 1`). Status enums `PASS/FAIL/NOT_EVALUATED` and `CERTIFIED/NOT_CERTIFIED`; no numeric score field exists in the artifact. |
| `src/domains/certification/environment.ts` | 56 | `currentCertificationEnvironment()` (platform/arch/node) and `resolveSourceCommit()` (explicit full sha → `AMC_SOURCE_COMMIT` → `git rev-parse HEAD` of the module checkout → `"unknown"` with reason). |
| `src/domains/certification/certificationRequirements.ts` | 127 | `deriveStationRequirements(station, profile?)`: one requirement per sector-pack question (`getIndustryPacksByStation`), per domain-pack question (`getDomainPackQuestions`), per registry assurance pack (`DOMAIN_REGISTRY[station].assurancePacks`) and per scenario pack (`DEFAULT_SCENARIO_PACK_IDS = ["injection"]`, the `amc ci red-team` default plugin, `src/cli.ts:10626`). `INDUSTRY_PACK_MINIMUM_LEVEL = 3` mirrors the `scoreIndustryPack` gap rule (`industryPacks.ts:2460`). Profile shape is the module's own (`CertificationStationProfile`); F1's module is absent at this commit. |
| `src/domains/certification/certificationEvidence.ts` | 227 | Provenance guards (`assertPackResponseProvenance`, `assertAssuranceReportProvenance` → `CertificationProvenanceError`) and `resolveRequirements()`: sector question → L≥3; domain question → `assessDomain` compliance gap (only answered questions are passed, so an unanswered one is `NOT_EVALUATED`, never the engine's default L1, `certificationEvidence.ts:187-195`); pack → latest accepted report containing the pack, `FAIL` on any measured failure, `NOT_EVALUATED` when any definition scenario is missing/inconclusive or the report is `INSUFFICIENT_EVIDENCE`, `PASS` only when all scenarios measured and passed. |
| `src/domains/certification/certificationRun.ts` | 261 | `certificationStatusFrom()` (`:41-57`, the only status rule), `composeCertificationRun()`, `sealCertificationRun()` (hash canonical with empty seal fields, sign with `ledger.signRunHash`), `runIndustryCertification()` (workspace: loads `reports/assurance/*.json`, refuses on seal (`sealedRunReportVerifies`), on missing provenance, on `maxEvidenceAgeMs`, and when any `evidenceEventIds` entry is absent from the ledger or belongs to another session (`eventsBelongToSession`, `:127-141`); writes `reports/certification/<runId>.json|.md`). |
| `src/domains/certification/certificationExport.ts` | 104 | `renderCertificationJson`, `parseCertificationExport`, `verifyCertificationExport` (schema + seal + status/ids/counts recomputed from requirements), `renderCertificationMarkdown` (binder `summaries/summary.md` style). |
| `src/domains/certification/index.ts` | 60 | barrel |
| `tests/industryCertification.test.ts` | 553 | 16 tests (listed below). Fixture writes assurance reports the way the runner does: `startAssuranceSession` + `writeScenarioPrompt/Response/TestResult` into the real ledger, canonical hash, `ledger.signRunHash`. |
| `docs/INDUSTRY_CERTIFICATION.md` | — | evidence table (what carries provenance at HEAD), derivation table, exact command sequence, export format, binder ready-to-wire pointer, boundary. |

## Step 1 — provenance measurement at HEAD (read-only grep, commit 8f57ce63)

| Result type | Session-id provenance | Evidence |
|---|---|---|
| `AssuranceReport` (`src/types.ts:4200`) | **yes** — `sessionId?` (optional field, documented "A report without one predates this field and cannot make the claim"), `reportJsonSha256`, `runSealSig`; set by `runAssurance` (`assuranceRunner.ts:617`) | per-scenario `evidenceEventIds` populated from `writeScenarioPrompt/Response/TestResult` (`assuranceRunner.ts:446,497,507,546`) |
| `AssurancePackResult` (`src/types.ts:4189`) | **no** — no session or run id on the pack | `latestAssuranceByPack` (`assuranceRunner.ts:800`) returns packs stripped of their report, so provenance is lost at that API |
| v1 artifacts `run/findings/traceRefs` (`src/assurance/assuranceSchema.ts`) | **no** — `runId` only (`grep sessionId` → 0 hits); `evidenceRefs.eventHashes: []`, `receiptIds: []` written empty by `persistV1Artifacts` (`assuranceRunner.ts:243,262`) | |
| `RedTeamReport` (`src/redteam/runner.ts:125`) | **no** — no `sessionId`; every scenario `evidenceEventIds: []` (`runner.ts:516,539`); `verification.status` always `UNSIGNED_VALID` (`runner.ts:453-463`) | refused by the certification; its pack ids must be run through `amc assurance run` to produce evidence |
| `runDomainAssurance` (`src/domains/domainCliIntegration.ts:189`) | **none** — validates a hard-coded `SAFE_ASSURANCE_RESPONSE` (`:105`), no agent invoked | not an input |
| `scoreIndustryPack` (`industryPacks.ts:2441`) | n/a — defaults a missing response to L1 (`:2451`), hiding NOT_EVALUATED | not consumed; the certification resolves questions itself |

## Commands run and exact results

| # | Command | Result |
|---|---|---|
| 1 | `git rev-parse HEAD` / `git branch --show-current` | `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` / `worktree-wf_fc54d4b0-c89-3`; `git status --porcelain` empty |
| 2 | `pnpm install --frozen-lockfile --prefer-offline` | `Done in 6s using pnpm v10.33.0`, exit 0 |
| 3 | `pnpm vitest run tests/industryCertification.test.ts` (before implementation) | `Test Files 1 failed (1)`, `Tests no tests` — import of `src/domains/certification/index.js` unresolved (RED) |
| 4 | same, after implementation | `Tests 16 passed (16)`, `Duration 10.96s` (GREEN) |
| 5–8 | mutation runs (below) | RED each time; restore → `16 passed` each time |
| 9 | `pnpm typecheck` (`tsc -p tsconfig.json --noEmit`) | exit 0, no output |
| 10 | `pnpm typecheck:tests` (`tsc -p tsconfig.tests.json --noEmit`) | exit 0, no output |
| 11 | `git commit` (explicit paths, 9 files) | `44ba1d9d` |
| 12 | `pnpm vitest run tests/industryCertification.test.ts` on the committed state | `Tests 16 passed (16)`, `Start at 22:22:15`, `Duration 12.38s` |
| 13 | `ls .amc/keys \| grep -c previous` after every test run | `0` — no key rotation occurred; `git status --porcelain` showed no `.amc/keys` change |

Tests in the file (all passing in runs 4 and 12):

1. health station requirements come from the sector packs, the domain pack, the registry's assurance packs and the scenario baseline
2. a station profile adds packs without duplicating registry packs across kinds
3. NOT_EVALUATED never counts as pass: one unanswered requirement is NOT_CERTIFIED and named
4. every requirement evaluated and passing is CERTIFIED
5. a failed assurance scenario is FAIL for its pack and NOT_CERTIFIED overall
6. a pack with a scenario never measured is NOT_EVALUATED, not a partial pass
7. a sector-pack response below L3 and a domain question below its required level are FAIL
8. certificationStatusFrom is not an average: many passes do not outweigh one NOT_EVALUATED
9. an assurance report without a ledger session is refused
10. a measured scenario without ledger event ids is refused
11. a pack response without a session id is refused
12. a red-team report shape (no sessionId, empty evidenceEventIds) is refused rather than scored
13. fixture health run with one evidence item missing is NOT_CERTIFIED, names the requirement, and the export carries the boundary
14. a report whose seal does not verify, or whose events are not in the ledger, is refused and listed — not scored
15. export round-trips through JSON, verifies against the auditor key, and voids on edit
16. resolveSourceCommit returns a full sha or an explicit unknown, never a guess

## Acceptance self-report

| Check | Observed | Pass |
|---|---|---|
| `pnpm vitest run tests/industryCertification.test.ts` → all pass | run 12: `16 passed (16)` | yes |
| health fixture with one evidence item missing reports NOT_CERTIFIED and lists the missing requirement | test 13: assurance reports for `healthcarePHI` + `safetyCriticalSIL` only → `status NOT_CERTIFIED`, `notEvaluatedRequirementIds == ["scenario-pack:injection"]`, `failedRequirementIds == []`; Markdown contains the id. Test 3 covers the pack-question variant (one dropped response → named `NOT_EVALUATED`, `counts.notEvaluated == 1`). | yes |
| exported JSON carries sourceCommit, environment and per-requirement evidence ids | test 13 reads `result.jsonPath`: `sourceCommit == 8f57ce63…`, `environment == {platform, arch, node}`; `assurance-pack:healthcarePHI` evidence has `assurance-run`, `ledger-session`, and `3 × scenarioCount` `ledger-event` ids; a sector question has `[{ledger-session}, {pack-response}]`; `verifyCertificationExport` → `{ ok: true, errors: [] }` | yes |

## Mutation observations (guard → mutation → RED → restored GREEN)

| Guard | Mutation | RED | Restored |
|---|---|---|---|
| `certificationStatusFrom` treats NOT_EVALUATED as not-pass (`certificationRun.ts:53`) | dropped `&& notEvaluatedRequirementIds.length === 0` from the CERTIFIED condition | `5 failed \| 11 passed` — tests 3, 6, 8, 13, 14 each `expected 'CERTIFIED' to be 'NOT_CERTIFIED'` | `16 passed` |
| `assertAssuranceReportProvenance` sessionId check (`certificationEvidence.ts:50-52`) | removed the sessionId throw | `1 failed \| 15 passed` — test 9 `expected error to be instance of CertificationProvenanceError`. This also proves the existing seal guard does not cover the case: the fixture report was sealed and verified, and only this guard refused it. | `16 passed` |
| `assertAssuranceReportProvenance` evidenceEventIds check (`:58`) | condition replaced by `if (false)` | `1 failed \| 15 passed` — test 10 `expected [Function] to throw an error` | `16 passed` |
| `eventsBelongToSession` ledger lookup (`certificationRun.ts:127`) | early `return null` | `1 failed \| 15 passed` — test 14 `expected [ 'tampered.json' ] to deeply equal [ 'phantom-events.json', … ]` (the report with non-existent event ids was accepted) | `16 passed` |

Existing-guard check before adding guards: `sealedRunReportVerifies` (`src/diagnostic/reportSeal.ts`) is reused as-is for the seal; the three provenance guards above are the ones it does not cover, shown by mutations 2–4 passing the seal and failing only on the new guard.

## Ready-to-wire: audit binder ingestion (binder files are another session's; not applied)

```diff
--- a/src/audit/binderSchema.ts
+++ b/src/audit/binderSchema.ts
@@ sections: z.object({
+    industryCertification: z.object({
+      status: z.enum(["CERTIFIED", "NOT_CERTIFIED"]).nullable(),
+      certificationRunId: z.string().min(1).nullable(),
+      station: z.string().min(1).nullable(),
+      counts: z.object({ total: z.number().int(), pass: z.number().int(), fail: z.number().int(), notEvaluated: z.number().int() }).nullable(),
+      reportJsonSha256: z.string().length(64).nullable(),
+      notes: z.array(z.string()).default([])
+    }).optional(),
     controls: binderControlsSectionSchema
--- a/src/audit/binderCollector.ts   (inside collectAuditBinderData, next to the assurance facts)
+import { parseCertificationExport, verifyCertificationExport } from "../domains/certification/index.js";
+// latest reports/certification/*.json for the scope agent; accepted only when verifyCertificationExport(workspace, run).ok
+// → sections.industryCertification = { status, certificationRunId, station, counts, reportJsonSha256, notes: [] }
+// → otherwise { status: null, …nulls, notes: ["no verified industry certification run"] }  (INSUFFICIENT, never a pass)
--- a/src/audit/binderArtifact.ts   (createAuditBinderArtifact, after summary.md)
+    writeFileAtomic(join(root, "checks", "industry-certification.json"), renderCertificationJson(run), 0o644);
+    writeFileAtomic(join(root, "summaries", "industry-certification.md"), renderCertificationMarkdown(run), 0o644);
```

Also ready-to-wire (unclaimable `src/cli.ts`): an `amc certify --station <id> --responses <file.json>` verb calling `runIndustryCertification`; until then the documented `pnpm exec tsx` script is the entry point.

## Sources

No regulation content was encoded; `regulatoryRef` strings are passed through from pack questions unchanged. Research digests under `AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/research/{health,education,environment}/` were empty directories at run time (listed 2026-10-03; no `digest.json` present) and were not used.

## Not exercised

- No live agent, no `amc assurance run`, no `amc` CLI invocation; the fixture writes runner-shaped reports into a real ledger.
- Pack-response `sessionId` existence in the ledger (only non-emptiness is checked; the ledger exposes no lookup by session id without a time window).
- `maxEvidenceAgeMs` freshness refusal (implemented, default off, untested).
- Stations other than `health`; a real F1 station profile (adapter shape is the module's own).
- Full suite, release gate, generators, fresh-clone reproduction (program rules: focused files only; the Verify stage reproduces).
- Line-budget script (`scripts/architecture-boundaries-check.mjs`) not run; all new files are ≤ 261 lines, under the 800 cap.

## Blockers

None for the track's own scope. Binder ingestion and a CLI verb are blocked on paths this track may not write (recorded above as ready-to-wire).
