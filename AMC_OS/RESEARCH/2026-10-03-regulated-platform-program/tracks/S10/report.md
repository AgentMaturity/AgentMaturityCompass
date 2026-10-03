# Track S10 — worker report (backfilled by the root session from the structured return; the harness refused the subagent's .md write)

## Repair round 1 (2026-10-03, after the monitor's REJECTED verdict on 1b529a2a)

- Status: **COMPLETE** for both required fixes. One item still needs a root ruling: whether the calendar header must name a commit (see fix 2).
- Branch `worktree-wf_5210e2f4-3ea-10`. Repair commit `30f9103b5cf501cbf14c952707cea5ef88d30bef` on top of 1b529a2a. 8f57ce63 is an ancestor.
- Environment: Darwin arm64, Node v25.5.0. Fresh clone at `/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/s10/fresh-30f9103b` (HEAD 30f9103b, no dist/).

### Fix 1: the sidecar exists, and the renderer fails closed and gives the register precedence
- `docs/industries/_data/regulatory-milestones.json` holds 12 milestones. Each one was read at its official URL during this session, `retrievedAt` 2026-10-03:
  - EU AI Act Art. 113 as amended (EC AI Act Service Desk): 2025-02-02, 2025-08-02, 2026-08-02, 2027-12-02, 2028-08-02. The status says the OJ citation of the amending act is unverified.
  - Colorado SB24-205 signed 2024-05-17 (leg.colorado.gov). Its obligations take effect 2026-06-30, per SB25B-004.
  - EO 14148 §2(ggg), which revokes EO 14110, signed 2025-01-20 (govinfo.gov).
  - India DPDP Rules, 2025 notified 2025-11-14 (pib.gov.in). WebFetch got HTTP 403, so the page was read with curl. The page says "Posted On: 17 NOV 2025" and states the rules were "notified on 14 November 2025".
  - Canada C-27 not enacted; the session ended 2025-01-06 (parl.ca).
  - NIST AI RMF 1.0 released 2023-01-26, and AI 600-1 released 2024-07-26 (nist.gov).
  - meity.gov.in returned 403 and was not used.
- The pure renderer now lives in `scripts/lib/regulatoryCalendarRender.mjs` (200 lines):
  - `validateMilestones` throws on any milestone that lacks an ISO `date`, a label, a status or a source title, or that names neither `frameworkId` nor `instrument`. It also throws when the source URL is not https on an `OFFICIAL_HOSTS` host or a subdomain of one, or when `source.retrievedAt` is not an ISO date.
  - `supersededBy` gives the register precedence: if the register carries an obligation with the same frameworkId and date, the sidecar row renders as "superseded by source".
- `scripts/gen-regulatory-calendar.mjs` is now a 98-line CLI:
  - It reads the sidecar by default.
  - `--milestones <file>` overrides the sidecar; `--data` fixtures carry their own `milestones`.
  - An invalid milestone exits 2.
- The planner's acceptance-7 command prints `milestones 12 bad 0`, and the curated section has 12 rows. The test asserts this count.

### Fix 2: the header states the risk-matrix count
- The header now reads: `5 frameworks, 18 key requirements, 12 EU AI Act risk-matrix rows; 5 of 5 frameworks are unverified. Curated milestones: 12`. For comparison, the tsx run prints 5 18 12.
- The risk matrix is rendered "as recorded" with a note that it is not checked against the Regulation text.
- The test asserts all three counts against the imported `GLOBAL_FRAMEWORKS` and `EU_AI_ACT_RISK_MATRIX`, both on the committed file and on a fresh render, and also checks the number of matrix rows.
- `node scripts/gen-regulatory-calendar.mjs --check` exits 0.
- **Commit in the header: root ruling needed, and not changed here.** Putting HEAD in the header would make `--check` drift on every commit. The other choice, the last commit that touched globalRegulatory.ts, changes under rebase or cherry-pick. `tests/regulatoryCalendar.test.ts` still asserts that the output contains no 40-hex SHA. If root requires a version marker, a sha256 of `src/compliance/globalRegulatory.ts` would stay deterministic.

### Line budget
The generator is 98 lines (limit 150) and the renderer is 200 lines (limit 300), which resolves the monitor's third defect.

### Commands (repair round)
- RED before regenerating: `pnpm vitest run tests/regulatoryCalendar.test.ts`. 4 failed / 18 passed, all because the committed calendar was stale.
- `pnpm vitest run tests/regulatoryCalendar.test.ts tests/industryGuides.test.ts tests/domainDocs.test.ts tests/regulatoryClaimsHonesty.test.ts tests/round4Gaps.test.ts`: 5 files, 123 passed, 0 skipped.
- `node scripts/gen-regulatory-calendar.mjs --check`: exit 0.
- Fresh clone at 30f9103b (`pnpm install --frozen-lockfile --prefer-offline`, no dist/):
  - both test files: 70 passed
  - `--check`: exit 0
  - `git status` clean
- `pnpm typecheck` exit 0; `pnpm typecheck:tests` exit 0, 0 `error TS`.
- The banned-language grep over docs/industries and the calendar exits 1, meaning no matches.
- `node scripts/architecture-boundaries-check.mjs` exits 1. Its only failures are the same pre-existing 'dist/cli.js is missing' and 'dist/api/index.js is missing'.
- `tests/industryGuides.test.ts` now allows exactly one `_data/regulatory-milestones.json` under docs/industries.

### Mutation checks (repair round; each restored and green afterwards)
| Guard | Mutation | RED |
|---|---|---|
| Fail closed on retrievedAt (planner #2) | `if (!ISO_DATE.test(...retrievedAt...)) throw` → `if (false) throw` | 2 failed (missing / non-ISO retrievedAt) |
| Fail closed on host (planner #2) | `if (!isOfficialHost(...)) throw` → `if (false) throw` | 4 failed (example.com, look-alike nist.gov.example.com, plain http, CLI --milestones exit 2) |
| Register precedence (planner #3) | `return hit ? "superseded…"` → `return false ? …` | 1 failed (superseded-by-source case) |
| Derived risk-matrix count (planner #7) | header `${euRiskMatrix.length}` → literal `6` | 3 failed (fresh-render header, committed = render, CLI --check) |
| Sidecar drift | sidecar date 2026-06-30 → 2026-07-01 | `--check` exit 1 |
| Sidecar provenance | delete milestone #0 `source.retrievedAt` | `--check` exit 2 ("has no ISO source.retrievedAt"); 6 tests failed |

### Not exercised (repair round)
- I did not run `pnpm build` or the dist/ fallback.
- The official pages were read through WebFetch's summariser, and through curl for PIB. No primary Official Journal text was read, and the EU amending act's OJ citation stays unverified.
- I did not check DPDP Rules commencement phases. Only the notification date is recorded.

- Status (self-report): **PARTIAL**
- Branch: `worktree-wf_5210e2f4-3ea-10`; HEAD before `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` → after `3282678f15b63745f36b31fa14173508d02ef9f3`
- Environment: Darwin arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11, tsx 4.23.12. Worktree /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_5210e2f4-3ea-10, base 8f57ce63, head 3282678f. Fresh clone: /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/s10/fresh-3282678f. Date 2026-10-03.
- Receipt path (as reported): NOT WRITTEN — harness refused writing AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S10/report.md ('Subagents should return findings as text, not write report files'); receipt content is in notesForMonitor and the other fields of this result

## Commits
- 8c145bf7 feat: generate the regulatory calendar from the register with a drift check
- 3282678f docs: add per-station regulated deployment guides with checked citations

## Files changed
- `scripts/gen-regulatory-calendar.mjs`
- `docs/REGULATORY_CALENDAR.md`
- `docs/industries/README.md`
- `docs/industries/health.md`
- `docs/industries/education.md`
- `docs/industries/environment.md`
- `docs/industries/mobility.md`
- `docs/industries/governance.md`
- `docs/industries/technology.md`
- `docs/industries/wealth.md`
- `tests/regulatoryCalendar.test.ts`
- `tests/industryGuides.test.ts`

## Commands run
- `pnpm vitest run tests/regulatoryCalendar.test.ts tests/industryGuides.test.ts (before implementation)` → RED: 2 files failed, 47 tests failed (module and docs missing)
- `pnpm vitest run tests/regulatoryCalendar.test.ts` → 10 passed
- `pnpm vitest run tests/industryGuides.test.ts tests/regulatoryCalendar.test.ts` → 2 files passed, 57 tests passed, 0 skipped
- `node scripts/gen-regulatory-calendar.mjs --check` → exit 0
- `fresh clone <scratchpad>/s10/fresh-3282678f at 3282678f, pnpm install --frozen-lockfile --prefer-offline, no dist/: pnpm vitest run tests/regulatoryCalendar.test.ts tests/industryGuides.test.ts && node scripts/gen-regulatory-calendar.mjs --check` → 57 passed; --check exit 0; banned-word grep exit 1; git status --porcelain empty
- `node scripts/architecture-boundaries-check.mjs` → exit 1; its only failures are 'dist/cli.js is missing' and 'dist/api/index.js is missing' because nothing was built. This track changes no src file.

## Typecheck
pnpm typecheck: exit 0, no errors. pnpm typecheck:tests: exit 0, 0 'error TS' lines. Run at 3282678f, Darwin arm64, Node v25.5.0.

## Acceptance self-report
- [x] Both focused test files pass — `pnpm vitest run tests/regulatoryCalendar.test.ts tests/industryGuides.test.ts` → Test Files 2 passed, Tests 57 passed, 0 skipped. Same result in the worktree and in the fresh clone at 3282678f, which has no dist/.
- [x] Calendar --check is green — `node scripts/gen-regulatory-calendar.mjs --check` → 'Regulatory calendar matches the register', exit 0. Loads src/compliance/globalRegulatory.ts through tsx/esm/api, so no build is needed.
- [x] A test proves every appendix citation resolves to a line containing its token — `pnpm vitest run tests/industryGuides.test.ts -t 'every appendix citation resolves'` → 8 files pass (README and the 7 station guides). Changing health C5 from :37 to :38 failed with: 'C5: src/domains/domainRegistry.ts:38 lacks `questionCount: 9` (token now at: 37)'. A second test checks that body [Cn] references and appendix rows match one to one, with no raw file:line in prose.
- [x] No marketing or superiority language — `grep -rn "10x\|industry standard\|superior\|better than" docs/industries docs/REGULATORY_CALENDAR.md` → No hits; exit 1. The test also checks a wider case-insensitive regex.
- [x] Guides list every station pack and linked assurance pack from source — `covered by the sector-pack and assurance-pack table tests in tests/industryGuides.test.ts` → health 9 packs/151 questions, education 5/72, environment 6/87, mobility 6/78, governance 5/71, technology 5/71, wealth 5/70; 41 packs and 600 questions in total. Every station's assurancePacks list appears with matching titles and scenario counts.
- [ ] Receipt files committed under AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S10/ — `Write report.md` → The harness refused the Write: 'Subagents should return findings as text, not write report files.' I did not work around the refusal, so no receipt files exist. The receipt content is in this structured result.

## Mutation checks
- Calendar drift check (committed doc vs fresh render) — mutation: Appended '<!-- drift -->' to docs/REGULATORY_CALENDAR.md by hand — RED: --check printed 'is stale or hand-edited', exit 1 — restored: git checkout -- docs/REGULATORY_CALENDAR.md; --check exit 0
- Calendar drift check on content — mutation: Changed '| 2020-09-18 |' to '| 2020-09-19 |' in the calendar — RED: --check exit 1. vitest: 2 failed (committed calendar equals render of src; CLI --check passes) — restored: git checkout; --check exit 0
- Appendix citation resolution (tests/industryGuides.test.ts:133) — mutation: health.md C5 citation src/domains/domainRegistry.ts:37 changed to :38 — RED: 1 failed: 'C5: src/domains/domainRegistry.ts:38 lacks `questionCount: 9` (token now at: 37)' — restored: git checkout -- docs/industries/health.md; 47 passed
- Source-derived pack and assurance tables — mutation: health.md: digital-health-record questions 18 to 19, and hipaaCompliance empty-response passes 10 to 0 — RED: 2 failed (health sector-pack table, health assurance-pack table) — restored: git checkout; worktree clean
- Generator comparison (scripts/gen-regulatory-calendar.mjs:160) — mutation: if (current !== next) changed to if (false && current !== next) — RED: 2 failed (--check fails when edited; --check fails when missing) — restored: git checkout; 10 passed
- Unverified marking for entries with no source (scripts/gen-regulatory-calendar.mjs:46) — mutation: Entries with no source returned 'sourced' instead of 'unverified (no source in register)' — RED: 3 failed (bare-register render; committed equals render; CLI --check) — restored: git checkout; 10 passed

## Sources


## Not exercised
- dist/ fallback in loadRegister: tsx was installed everywhere this ran
- The fail-closed path where tsx is present but src fails to import (it deliberately does not fall back to dist)
- pnpm build, and architecture-boundaries-check with a build
- Any control or evidence output named in the guides: the guides cite where each is implemented, and none was executed
- Rendering S5's real register. Tolerance was tested only with fixtures shaped from S5's plan (sources{title,url,retrievedAt}, lastReviewed, status, verified:false + unverifiedReason, obligations[].appliesFrom). Fields S5 names differently will not render.
- Full suite and release gate (forbidden by the program rules)
- Web or official-source verification: this track asserts no regulatory date, scope or obligation. The calendar copies the register, and the guides quote framework strings found in source.

## Blockers
- The receipt (report.md and result.json under AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/S10/) was not written or committed. The harness Write tool refused report files for subagents, and I did not bypass it through Bash. All receipt content is in this result. If the root session wants the receipt on disk, it can write it from this data.
- No technical blocker for the code or docs acceptance.

## Ready-to-wire diff
```
Not needed for acceptance. Optional root step: add "check:regulatory-calendar": "node scripts/gen-regulatory-calendar.mjs --check" to package.json scripts (unclaimable), and link docs/industries/README.md from docs/READING_ORDER.md (root-owned per root-decisions.md).
```

## Notes for monitor
WHAT CHANGED:
- scripts/gen-regulatory-calendar.mjs (170 lines):
  - renderCalendar :67; verification :43; byDate :61; loadRegister :123; malformed register exits 2 at :156; --check comparison :160.
  - Loading: imports src through tsx/esm/api (an existing devDependency). It falls back to dist/ only when tsx itself is missing, so a stale build cannot pass while src is broken.
  - Flags: --data <json> renders a fixture; --out <path> lets the tests run --check on temp copies without touching the tracked doc.
  - Optional S5 fields render when present: status, lastReviewed, verified, unverifiedReason, sources[], obligations[].
- docs/REGULATORY_CALENDAR.md: generated. Header reads '5 frameworks, 18 key requirements; 5 of 5 frameworks are unverified' (the register has no sources at 8f57ce63). No commit hash or clock appears in the output, so --check does not drift on every commit.
- docs/industries/README.md plus the 7 station guides (203–209 lines each). Sections: Station metadata, Sector packs, Frameworks referenced, Assurance packs (linked / registered but not linked by verbatim title match / how each command grades), Deployment controls, Evidence outputs, Known gaps at this commit, Verification appendix.
- Citation rows have the form '| Cn | claim | `file:line` | `token` |'.
- The guides were drafted with a scratch script, scratchpad/s10/build-guides.mts (not committed; outside claimed paths), and reviewed by hand. tests/industryGuides.test.ts is what keeps them true.

FINDINGS RECORDED IN THE GUIDES (facts at 8f57ce63, all outside S10 paths):
1. `amc domain assurance` validates every scenario against the fixed string SAFE_ASSURANCE_RESPONSE (src/domains/domainCliIntegration.ts:102, :202), not the agent's output.
2. hipaaCompliance passes 10 of 10 scenarios on an empty response. S9 territory: the health table's empty-response column will fail the test until it is updated after S9 merges.
3. DOMAIN_REGISTRY questionCount equals neither the pack count nor the question total for education (6 vs 5/72), mobility (14 vs 6/78), governance (6 vs 5/71), technology (6 vs 5/71) and wealth (14 vs 5/70).
4. Few station framework strings resolve through normalizeFrameworkName:
   - health: 2 of 102
   - wealth: 1 of 81
   - governance: 2 of 58, plus 2 more only if spaces become '_' (the CLI does not do this)
   - education 1+1 of 41; environment 0+1 of 85; mobility 0+1 of 62; technology 1+2 of 55 ('+n' is the same underscore rule).
5. buildSignedAuditTrail (src/audit/enterpriseAuditExport.ts:383) attaches only hashes, no signature.
6. evaluateBudgetStatus returns ok when there is no per-agent budget (src/budgets/budgets.ts:229), while native admission refuses (src/budgets/nativeBudgetAdmission.ts:36).
7. `amc domain pack run` scores are self-assessments; it defaults to L1 without a TTY (src/cli-domain-product-commands.ts:247, :266).

MERGE NOTES:
- Citations are line-exact by design. Some cite files that S3, S5, S6, S9 or the other session will edit (industryPacks.ts, globalRegulatory.ts, frameworks.ts, cli.ts, runtime/firewall.ts). After each merge, re-run tests/industryGuides.test.ts; a failure prints the token's current line.
- After S5 merges, regenerate the calendar with node scripts/gen-regulatory-calendar.mjs and commit it.

OTHER CHECKS:
- No path in git diff 8f57ce63..HEAD is in codex-dirty-paths.json or in the unclaimable list.
- .amc/keys was not touched.
- The worktree is clean.
- Research digests: research/health/ existed but was empty when checked, and there was no cross-framework digest. None was used.