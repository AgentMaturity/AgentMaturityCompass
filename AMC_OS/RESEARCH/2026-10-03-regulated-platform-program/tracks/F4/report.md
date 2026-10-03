# Track F4 — Regulatory incident clocks and human-oversight operations

Status: COMPLETE (code, tests, docs committed; one ready-to-wire diff for `src/incidents/index.ts`, which is outside the claimed paths).

## Boundary

| Item | Value |
|---|---|
| Worktree | `/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_fc54d4b0-c89-4` |
| Branch | `worktree-wf_fc54d4b0-c89-4` |
| Base | `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da` (verified with `git rev-parse HEAD` before any edit) |
| Candidate commit | `ff85721153b42d1fe3205b085806cfe0f58745a4` |
| Environment | Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0, vitest 4.1.11 |
| Exercised | the two focused test files, `pnpm typecheck`, `pnpm typecheck:tests`, four guard mutations, one fresh-export reproduction |
| Not exercised | full suite, release gate, lint/knip/coverage, any generator, any CLI or API route, a real `createIncidentStore` database (tests use fixture incidents), `/verify` (it runs beyond the focused-file rule) |

## What changed and why

All files are new; no existing file was modified.

- `src/incidents/regulatoryClocksTable.ts` (462 lines) — the clock table: 19 clocks across 10 instruments. Each entry has `clockId`, `instrument`, `article`, `authority`, `jurisdiction`, `stations`, `trigger`, `deadline {amount, unit}`, `notify[]`, `requiredContent[]`, `condition`, `source {title, url, retrievedAt, verified, reason?}`. Header comment (lines 1–21) explains the local-table decision and how to source from the S5 register later. Texas entries (lines 404–443) are `verified: false` with the reason string at lines 128–129.
- `src/incidents/regulatoryClocks.ts` (212 lines) — `addDuration` (line 94; hours / calendar days / UTC work days / clamped months), `attachRegulatoryClocks` (line 135; explicit `nowTs`, AWARENESS defaults to `incident.createdTs`, chained triggers, satisfied map, status machine at line 127), `clocksForStation`, `listClockInstruments`, `DUE_SOON_WINDOW_MS = 24h` (line 27). Guards: trigger before `incident.createdTs` throws (line 146); satisfaction before trigger throws (line 164); unknown clockId in `satisfied` throws (line 150).
- `src/incidents/oversightRecord.ts` (162 lines) — `createOversightRecord` (line 80) signs `sha256(canonicalize(payload))` with `signHexDigest` from `src/crypto/keys.ts` (the primitive `incidentStore.ts` already uses; `src/receipts/receiptChain.ts` is dirty and `src/receipts/receipt.ts` has a fixed llm/tool payload schema, so neither was used). Backdating guard at creation line 89 and at verification line 127. Storage is append-only JSONL (`appendOversightRecord` line 150, `readOversightRecords` line 155, default path `<workspace>/.amc/incidents/oversight/<incidentId>.jsonl` line 145) — file-backed by design, as the brief allowed.
- `src/incidents/evidencePacket.ts` (297 lines) — `buildEvidencePacket` (line 186) assembles only supplied inputs; `missingItems` (line 125) lists `human-oversight-record`, `oversight-verification-keys`, `ledger-receipts`, `receipt-signature-verification`, `state-transitions`, `causal-edges`, `timeline-events`, `root-cause-claims`, `postmortem`, `resolution-timestamp` with reasons; `unverifiedSources` (line 173); `renderEvidencePacketMarkdown` (line 226). Packet generated before `incident.createdTs` throws (line 189).
- `tests/regulatoryClocks.test.ts` (230 lines) — fixed trigger `Date.UTC(2026,2,2,10)`; no `Date.now()`.
- `tests/incidentEvidencePacket.test.ts` (280 lines) — oversight record and packet tests; keys generated in-test with `generateKeyPairSync("ed25519")`.
- `docs/REGULATORY_INCIDENT_CLOCKS.md` — clock table, sources with retrievedAt, model, guards, sourcing-from-register note, ready-to-wire pointer.

## Commands run (exact results)

| # | Command / action | Result |
|---|---|---|
| 1 | `git rev-parse HEAD && git branch --show-current` | `8f57ce63d8331f1bef1c2a18fde82a7e8f4511da`, `worktree-wf_fc54d4b0-c89-4`, status clean |
| 2 | `pnpm install --frozen-lockfile --prefer-offline` (worktree) | exit 0 |
| 3 | WebFetch × 10 primary URLs (EUR-Lex CELEX ×5, eCFR ×4, Texas statutes) | all failed: EUR-Lex returned empty bodies; eCFR → HTTP 302 to `unblock.federalregister.gov`; Texas returned navigation only |
| 4 | `curl` EUR-Lex `TXT/HTML` ×5 | HTTP 202, 0 bytes (challenge) |
| 5 | `curl` govinfo CFR-2024 title45-vol1 sec164-404/408/410 | HTTP 200 but "Page Not Found" (wrong volume) |
| 6 | `curl` govinfo CFR-2024 title21-vol8 sec803-50 / 803-53 | HTTP 200, 3255 / 2238 bytes, section text present, revised as of 2024-04-01 |
| 7 | `curl` EUR-Lex ELI ×5 | HTTP 202, 2035-byte AWS WAF challenge page |
| 8 | WebFetch hhs.gov breach page / EBA RTS page / Texas AG page / EC AI-Act page / FDA MDR page | 403 / 404 / 402 / general statement only / FDA page read (content current 03/27/2025: 30 calendar days, 5 work days) |
| 9 | `curl -H "Accept: application/xhtml+xml"` publications.europa.eu cellar CELEX 32024R1689, 32022R2554, 32025R0301, 32022L2555, 32016R0679 | HTTP 200, text/xml, 1,262,391 / 746,866 / 56,853 / 702,913 / 806,864 bytes |
| 10 | `curl` govinfo CFR-2024 title45-vol2 sec164-404/408/410 | HTTP 200, 7196 / 2500 / 3416 bytes, section text present |
| 11 | `curl` Texas `BC.521.htm` and `GetStatute.aspx?Code=BC&Value=521.053` | HTTP 200 (250,874 / 122,407 bytes) but zero occurrences of `521.053` in either body; AG page HTTP 404 |
| 12 | WebSearch restricted to official EU domains (DORA RTS, NIS2) | used only to locate URLs; not cited as a source |
| 13 | `pnpm vitest run tests/regulatoryClocks.test.ts tests/incidentEvidencePacket.test.ts` (before implementation) | RED: 2 files failed, "Cannot find module" |
| 14 | same, after implementation | GREEN: 2 files, 28 passed |
| 15 | mutations A+B+C applied (see below), same command | RED: 4 failed, 24 passed |
| 16 | mutations restored, one test added, same command | GREEN: 29 passed |
| 17 | `pnpm typecheck` | exit 0 |
| 18 | `pnpm typecheck:tests` | exit 0 |
| 19 | mutation D applied, `pnpm vitest run tests/incidentEvidencePacket.test.ts` | RED: 2 failed, 11 passed (13) |
| 20 | mutation D restored, both files | GREEN: 29 passed |
| 21 | `git status --porcelain` after all test runs | only the six new source/test files; `.amc/keys/*` not rotated, no `*.previous-*` files |
| 22 | `git add <7 paths> && git commit` | `ff85721153b42d1fe3205b085806cfe0f58745a4` |
| 23 | `git archive ff857211 \| tar -x -C <scratchpad>/f4-archive-ff857211`; `pnpm install --frozen-lockfile --prefer-offline`; both test files | install exit 0 ("Done in 1.6s using pnpm v10.33.0"); 2 files, 29 passed; finished 2026-10-03T16:59:12Z. (`git clone` into the scratchpad was refused by the worktree-isolation guard, so the export is a `git archive` of the exact commit, not a `.git`-bearing clone.) |

## Mutation observations

| Guard | Mutation | RED | Restored GREEN |
|---|---|---|---|
| HIPAA 164.404 deadline duration | `amount: 60` → `59` calendarDays (`regulatoryClocksTable.ts`) | "lists HIPAA individual notice and EU AI Act clocks with computed due dates": `expected 1777543200000 to be 1777629600000`; "is PENDING before the deadline…": `expected 'OVERDUE' to be 'DUE_SOON'` | 29 passed |
| Creation-side backdating guard | `input.reviewedTs < input.incident.createdTs` → `< 0` (`oversightRecord.ts:89`) | "cannot be backdated past the incident timestamp": `expected [Function] to throw an error` | 29 passed |
| Verify-side backdating guard | `record.reviewedTs < incident.createdTs` → `< 0` (`oversightRecord.ts:127`) | first run: "a stored record whose reviewedTs was edited…" failed with `expected 'record hash does not match its content' to match /backdated/` — i.e. the hash check also caught that forgery, so the guard looked partly redundant (brief §2 rule 7). Added "a validly signed but backdated record is rejected by the verifier itself" (payload hashed and signed directly, bypassing creation). Mutation D re-run: that test RED `expected true to be false` — the verifier returned `ok: true` for a validly signed backdated record. | 29 passed |

## Sources (official text actually read)

| Instrument | Publisher / URL | retrievedAt (UTC, file mtime) | verified |
|---|---|---|---|
| Reg. (EU) 2024/1689 Art. 73(1)–(5) | EU Publications Office cellar `https://publications.europa.eu/resource/celex/32024R1689` | 2026-10-03T16:38:02Z | yes — "not later than 15 days", "not later than two days", "not later than 10 days", initial incomplete report |
| Reg. (EU) 2022/2554 Art. 19(1), 19(4), 20 | cellar `…/celex/32022R2554` | 2026-10-03T16:38:04Z | yes — Art. 19(4) defers time limits to Art. 20(a)(ii) RTS |
| Del. Reg. (EU) 2025/301 Art. 5 | cellar `…/celex/32025R0301` | 2026-10-03T16:38:05Z | yes — 4 h from classification / 24 h from awareness; 72 h intermediate; one month final |
| Dir. (EU) 2022/2555 Art. 23(1), (3), (4) | cellar `…/celex/32022L2555` | 2026-10-03T16:38:06Z | yes — 24 h early warning; 72 h notification; final report one month |
| Reg. (EU) 2016/679 Art. 33(1), 33(3), 34(1) | cellar `…/celex/32016R0679` | 2026-10-03T16:38:08Z | yes — 72 hours, content (a)–(d) |
| 45 CFR 164.404, 164.408 | GPO govinfo CFR-2024 title45 vol2 | 2026-10-03T16:38:09Z | yes — 60 calendar days; contemporaneous (≥500); 60 days after calendar-year end (<500) |
| 45 CFR 164.410 | GPO govinfo CFR-2024 title45 vol2 | 2026-10-03T16:38:10Z | yes — 60 calendar days |
| 21 CFR 803.50 | GPO govinfo CFR-2024 title21 vol8 | 2026-10-03T16:36:55Z | yes — 30 calendar days |
| 21 CFR 803.53 | GPO govinfo CFR-2024 title21 vol8 | 2026-10-03T16:36:56Z | yes — 5 work days |
| Tex. Bus. & Com. Code § 521.053 | `https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm` (+ GetStatute.aspx, + texasattorneygeneral.gov) | 2026-10-03T16:36:58Z | **no** — primary text unreachable 2026-10-03; durations encoded are recollection |

Inputs considered but not cited: the Opus research digest `research/health/digest.json` did not exist when read (directory empty); the knowledge graph was not queried (grep over `src/incidents`, `src/receipts`, `src/crypto` sufficed).

Boundary on the CFR sources: govinfo serves the 2024 annual edition, not live eCFR; amendments after that edition are not reflected.

## Acceptance self-report

| Check | Observed |
|---|---|
| `pnpm vitest run tests/regulatoryClocks.test.ts tests/incidentEvidencePacket.test.ts` → all pass | 2 files, 29 passed (worktree and fresh export of `ff857211`) |
| clock table ≥ 6 instruments, each with url + retrievedAt or verified:false | 10 distinct instruments (test "has at least 6 instruments…" asserts url, retrievedAt format, and reason-when-unverified for every row) |
| fixture health incident lists HIPAA and EU AI Act clocks with computed due dates | test "lists HIPAA individual notice and EU AI Act clocks with computed due dates": HIPAA due `2026-05-01T10:00:00.000Z`, AI Act Art. 73(2) due `2026-03-17T10:00:00.000Z` from trigger `2026-03-02T10:00:00.000Z` |
| mutation: deadline change → RED | yes (row 1 above) |
| mutation: backdated oversight allowed → RED | yes (rows 2–3 above) |

## Blockers

None for the track. Texas § 521.053 could not be verified from any reachable official page; it is encoded `verified: false` and surfaces in every packet's `unverifiedSources`.

## Ready-to-wire diff (not applied — `src/incidents/index.ts` is outside F4's claimed paths)

```ts
// append to src/incidents/index.ts
export {
  REGULATORY_CLOCK_TABLE,
  DUE_SOON_WINDOW_MS,
  addDuration,
  attachRegulatoryClocks,
  clocksForStation,
  listClockInstruments,
  type AttachRegulatoryClocksInput,
  type ClockDuration,
  type ClockDurationUnit,
  type ClockSource,
  type ClockStatus,
  type ClockTrigger,
  type IncidentClockInstance,
  type RegulatoryClock
} from "./regulatoryClocks.js";

export {
  OVERSIGHT_DECISIONS,
  appendOversightRecord,
  computeOversightRecordHash,
  createOversightRecord,
  oversightRecordPath,
  readOversightRecords,
  verifyOversightRecord,
  type CreateOversightRecordInput,
  type HumanOversightRecord,
  type OversightDecision
} from "./oversightRecord.js";

export {
  buildEvidencePacket,
  renderEvidencePacketMarkdown,
  type EvidencePacketInput,
  type IncidentEvidencePacket,
  type MissingEvidenceItem,
  type PacketOversightEntry,
  type PacketReceiptRef,
  type PacketTimelineEvent,
  type UnverifiedClockSource
} from "./evidencePacket.js";
```

## Cleanup

No servers or processes were started. Scratchpad artefacts left in place for the Verify stage: `scratchpad/f4-src/` (fetched source texts and `strip.py`), `scratchpad/f4-archive-ff857211/` (fresh export with `node_modules`).
