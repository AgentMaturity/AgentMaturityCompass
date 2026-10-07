# Regulatory Incident Clocks, Human-Oversight Records and Evidence Packets

Track F4 of the 2026-10-03 regulated-platform program, landed by P1-17. This
document describes the clock table in `src/incidents/regulatoryClocksTable.ts`,
the clock arithmetic in `src/incidents/regulatoryClocks.ts`, the signed
human-oversight record in `src/incidents/oversightRecord.ts`, the regulator
evidence packet in `src/incidents/evidencePacket.ts`, and the signed clock
events in `src/incidents/incidentClockEvents.ts` that connect them to stored
incidents through the CLI, the API (and so Studio) and one MCP tool.

**AMC computes and records deadlines; it does not file notices.** People file
them. Every duration is agent-drafted and experimental until a named expert
signs off (D-08), and nothing here is legal advice.

## Entry points (P1-17)

| Surface | Command or route | What it does |
|---|---|---|
| CLI | `amc incident clocks <id> --station <station> [--now <iso>] [--json]` | Lists the station's clocks for a stored incident |
| CLI | `amc incident clocks <id> --station <station> --trigger <TRIGGER> --at <iso>` | Records that a trigger happened, then lists |
| CLI | `amc incident clocks <id> --station <station> --notified <clockId> --at <iso>` | Records that a notice was submitted, then lists |
| CLI | `amc incident oversight <id> --decision <decision> --reviewer <id> --rationale <text> [--clock <clockId>...]` | Appends a chained oversight record signed with the workspace auditor key |
| CLI | `amc incident show <id> --packet <dir> --station <station>` | Writes `<id>.packet.json` and `<id>.packet.md` |
| API | `GET /api/v1/incidents/:id/clocks?station=&now=` | The `--json` listing |
| API | `POST /api/v1/incidents/:id/clock-events` `{ station, trigger \| notified, at }` | Records a trigger or a notice (201) |
| API | `POST /api/v1/incidents/:id/oversight` `{ decision, reviewerId, rationale, clockIds? }` | Appends an oversight record (201) |
| MCP | `amc_incident_clocks { incidentId, station, now?, workspace? }` | Read-only listing |

The API routes sit under the protected `/api/v1/incidents` prefix, so Studio
reaches them through its API delegation. They answer 400 on a bad station,
trigger, clock id, decision or timestamp and 404 on an unknown incident.
Timestamps must be ISO 8601 with a zone (`2026-03-02T10:00:00Z`), so a
deadline never depends on the host's local time.

### Clock events

Table `incident_clock_events` (created by `initIncidentTables`, append-only)
holds `incident_id, event_id, kind (TRIGGER | NOTIFIED), trigger_or_clock_id,
station, ts, recorded_ts, recorded_by, signature`. `ts` is the operator's
claim; `recorded_ts` is set by AMC from the server clock when the row is
signed and `recorded_by` names the surface (`cli` or `api`). Rows are signed
with the workspace monitor key, like `amc incident create`. AMC refuses an
event dated before the incident, more than 5 minutes after `recorded_ts`, with
a trigger or clock the station does not have, a second notice for a clock, or
one that would put a notice before its trigger. `loadIncidentClocks` checks
every row's signature and the same guards again and refuses a failing row by
its event id. For triggers the earliest claimed time wins, so a later row can
only bring a deadline forward; for notices the first-recorded row wins, so a
later row claiming an earlier notice cannot turn a missed deadline into a met
one. Events are kept per station.

### What the signatures prove

Clock events verify against the workspace's own monitor key history and
oversight records against its own auditor key history. That makes both a
**local audit trail**: they expose an edited, deleted, reordered or inserted
row by anyone without those keys, and they show which workspace wrote each
row. They do not prove that a claimed time is true or who reviewed: a holder
of the workspace keys can write any claim, and the reviewer id is stored as
stated (binding reviewers to authenticated identities is P1-20).

## What this gives an on-call operator

1. **Clocks per station.** Given an AMC `Incident` and the station it belongs
   to (`Domain`: health, wealth, technology, …), `attachRegulatoryClocks` lists
   the regulation-derived reporting deadlines that are candidates for that
   station, each with a computed due date and a status.
2. **Due / overdue state without a wall clock.** The clock arithmetic takes
   an explicit `nowTs` and never calls `Date.now()`; the CLI, API and MCP tool
   pass the current time unless `--now` / `now` is given. Statuses: `NOT_STARTED`
   (trigger not recorded), `PENDING`, `DUE_SOON` (within 24 h), `OVERDUE`,
   `SATISFIED`, `SATISFIED_LATE`.
3. **A signed human-oversight record** — who reviewed, when, what they decided
   — that cannot be dated before the incident, bound to the incident hash,
   chained by `prevRecordHash`, and verifiable against the workspace auditor
   key history.
4. **An evidence packet** (JSON + Markdown) assembled only from supplied
   incident data, transitions, causal edges, clocks, oversight records and
   receipt references. Anything absent is listed under `missing` with a
   reason; clocks whose source could not be read from primary text are listed
   under `unverifiedSources`.

## Clock model

```ts
interface RegulatoryClock {
  clockId: string;            // stable id, e.g. "hipaa-164-404-individual-notice"
  instrument: string;         // e.g. "45 CFR 164.404 (HIPAA Breach Notification Rule)"
  article: string;            // e.g. "164.404(b)"
  authority: string;          // who enforces / receives
  jurisdiction: string;
  stations: Domain[];         // AMC stations where the clock is a candidate
  trigger: ClockTrigger;      // event the deadline runs from
  deadline: { amount; unit }; // hours | calendarDays | workDays | months
  notify: string[];           // who must be notified
  requiredContent: string[];  // what the notification must contain
  condition: string;          // statutory precondition (applicability is the operator's call)
  source: { title; url; retrievedAt; verified; reason? };
}
```

Triggers: `AWARENESS` (defaults to `incident.createdTs`, overridable),
`CLASSIFICATION_MAJOR`, `INITIAL_NOTIFICATION`, `INTERMEDIATE_REPORT`,
`INCIDENT_NOTIFICATION`, `BREACH_DETERMINATION`, `INCIDENT_DETERMINATION`
(23 NYCRR 500.17(a)(1): "after determining that a cybersecurity incident has
occurred"), `EXTORTION_PAYMENT` (500.17(c)), `INITIAL_DETECTION`
(31 CFR 1020.320(b)(3): "the date of initial detection by the bank of facts
that may constitute a basis for filing a SAR"), and the derived
`CALENDAR_YEAR_END_AFTER_AWARENESS` (1 January UTC of the year after
awareness). A clock whose trigger has not been recorded is `NOT_STARTED` with
no due date — it is never invented.

Arithmetic (`addDuration`) is UTC-only: hours and calendar days are exact
millisecond offsets; work days skip Saturday and Sunday UTC and do **not**
model public holidays; months add a calendar month and clamp the day
(31 Jan + 1 month = 28/29 Feb). DORA RTS Art. 5(4) weekend/bank-holiday
relief and HIPAA 164.412 law-enforcement delay are not modelled; the
`condition` text says so.

## Clock table (F4 on 2026-10-03; P1-17 on 2026-10-07)

Every duration below is agent-drafted and experimental until a named expert
signs off (D-08). Each computed clock carries `review: "experimental:
agent-drafted, expert review pending (D-08)"`. Nothing here is legal advice.

| clockId | Instrument / article | Station(s) | Trigger | Deadline | Notify | Verified |
|---|---|---|---|---|---|---|
| eu-ai-act-73-2-serious-incident | Reg. (EU) 2024/1689 Art. 73(2) | all | AWARENESS | 15 calendar days | market surveillance authority | yes |
| eu-ai-act-73-3-widespread | Reg. (EU) 2024/1689 Art. 73(3) | all | AWARENESS | 2 calendar days | market surveillance authority | yes |
| eu-ai-act-73-4-death | Reg. (EU) 2024/1689 Art. 73(4) | all | AWARENESS | 10 calendar days | market surveillance authority | yes |
| hipaa-164-404-individual-notice | 45 CFR 164.404(b) | health | AWARENESS | 60 calendar days | affected individuals | yes |
| hipaa-164-408-secretary-500-or-more | 45 CFR 164.408(b) | health | AWARENESS | 60 calendar days (contemporaneous with 164.404) | Secretary of HHS | yes |
| hipaa-164-408-secretary-under-500 | 45 CFR 164.408(c) | health | CALENDAR_YEAR_END_AFTER_AWARENESS | 60 calendar days | Secretary of HHS | yes |
| hipaa-164-410-business-associate | 45 CFR 164.410(b) | health | AWARENESS | 60 calendar days | covered entity | yes |
| gdpr-33-1-supervisory-authority | Reg. (EU) 2016/679 Art. 33(1) | all | AWARENESS | 72 hours | supervisory authority | yes |
| nis2-23-4a-early-warning | Dir. (EU) 2022/2555 Art. 23(4)(a) | all but education | AWARENESS | 24 hours | CSIRT / competent authority | yes |
| nis2-23-4b-incident-notification | Dir. (EU) 2022/2555 Art. 23(4)(b) | all but education | AWARENESS | 72 hours | CSIRT / competent authority | yes |
| nis2-23-4d-final-report | Dir. (EU) 2022/2555 Art. 23(4)(d) | all but education | INCIDENT_NOTIFICATION | 1 month | CSIRT / competent authority | yes |
| dora-rts-2025-301-art5-initial-awareness | Del. Reg. (EU) 2025/301 Art. 5(1)(a) | wealth | AWARENESS | 24 hours | competent authority (DORA Art. 46) | yes |
| dora-rts-2025-301-art5-initial-classification | Del. Reg. (EU) 2025/301 Art. 5(1)(a), 5(2) | wealth | CLASSIFICATION_MAJOR | 4 hours | competent authority | yes |
| dora-rts-2025-301-art5-intermediate | Del. Reg. (EU) 2025/301 Art. 5(1)(b) | wealth | INITIAL_NOTIFICATION | 72 hours | competent authority | yes |
| dora-rts-2025-301-art5-final | Del. Reg. (EU) 2025/301 Art. 5(1)(c) | wealth | INTERMEDIATE_REPORT | 1 month | competent authority | yes |
| fda-803-50-mdr-30-day | 21 CFR 803.50(a) | health | AWARENESS | 30 calendar days | FDA | yes |
| fda-803-53-five-day | 21 CFR 803.53 | health | AWARENESS | 5 work days | FDA | yes |
| tx-bcc-521-053-individual-notice | Tex. Bus. & Com. Code § 521.053(b) | all | BREACH_DETERMINATION | 60 calendar days | affected individuals | yes (2026-10-07) |
| tx-bcc-521-053-attorney-general | Tex. Bus. & Com. Code § 521.053(i) | all | BREACH_DETERMINATION | 30 calendar days (250 or more Texas residents) | Texas Attorney General | yes (2026-10-07) |
| nydfs-500-17-notice | 23 NYCRR 500.17(a)(1) | wealth, technology | INCIDENT_DETERMINATION | 72 hours | NYDFS superintendent | yes |
| nydfs-500-17-extortion-notice | 23 NYCRR 500.17(c)(1) | wealth, technology | EXTORTION_PAYMENT | 24 hours | NYDFS superintendent | yes |
| nydfs-500-17-extortion-explanation | 23 NYCRR 500.17(c)(2) | wealth, technology | EXTORTION_PAYMENT | 30 calendar days ("30 days") | NYDFS superintendent | yes |
| glba-314-4j-ftc-notice | 16 CFR 314.4(j)(1) | wealth, technology | AWARENESS | 30 calendar days ("30 days"), notification event affecting 500 or more consumers | Federal Trade Commission | yes |
| bsa-1020-320-sar-filing | 31 CFR 1020.320(b)(3) | wealth | INITIAL_DETECTION | 30 calendar days | FinCEN (SAR); law enforcement by telephone when immediate attention is needed | yes |

"Station(s)" is where the clock is *surfaced*; it is not an applicability
ruling. 45 CFR 164.404 binds HIPAA covered entities, DORA binds financial
entities, NIS2 binds essential/important entities under national transposition,
23 NYCRR Part 500 binds NYDFS covered entities, 16 CFR Part 314 binds
financial institutions under FTC jurisdiction and 31 CFR 1020.320 binds banks.
The operator confirms applicability in the oversight record. Condition texts
are descriptive: AMC does not check that 500 or more consumers, or 250 or more
Texas residents, were affected.

### What the US financial rows encode from their texts

- **NYDFS 500.17.** The 72-hour clock runs from the determination that a
  cybersecurity incident occurred, not from awareness. A cybersecurity incident
  is an event at the covered entity, an affiliate or a third-party service
  provider that requires notice to a government or supervisory body, is
  reasonably likely to materially harm normal operations, or deploys
  ransomware within a material part of its systems (500.1(g)). The covered
  entity must also answer the superintendent's requests and keep updating
  (500.17(a)(2)). An extortion payment starts two clocks: notice within
  24 hours and a written explanation (reasons, alternatives considered,
  diligence, OFAC compliance) within 30 days (500.17(c)). The 500.19(a)
  limited exemption does not list 500.17.
- **GLBA Safeguards 314.4(j).** A notification event is the acquisition of
  unencrypted customer information without authorization (314.2(m)). When it
  involves at least 500 consumers, the FTC notice is due as soon as possible
  and no later than 30 days after discovery, discovery being the first day
  any employee, officer or other agent (other than the person committing the
  breach) knows of it (314.4(j)(2)). The six content items of
  314.4(j)(1)(i)–(vi) are listed. The rule binds financial institutions under
  FTC jurisdiction (314.1(b)).
- **BSA SAR 1020.320.** The SAR is due 30 calendar days after initial
  detection of facts that may be a basis for filing. If no suspect was
  identified, the bank may take 30 more days, never beyond 60 days from
  detection; that extension is in the condition text and is not modelled as
  a separate clock. Violations needing immediate attention also require an
  immediate telephone call to law enforcement. A SAR and anything revealing
  its existence are confidential (1020.320(e)); supporting records are kept
  five years (1020.320(d)). AMC never files a SAR.

## Sources (what was actually read)

EUR-Lex itself answered every request with an HTTP 202 AWS-WAF challenge page
and eCFR redirected to `unblock.federalregister.gov`, so the primary texts were
read from two other official publishers, with retrieval times taken from the
saved files' modification times (UTC):

| Instrument | Publisher and URL | retrievedAt |
|---|---|---|
| Reg. (EU) 2024/1689 Art. 73 | EU Publications Office cellar, `https://publications.europa.eu/resource/celex/32024R1689` | 2026-10-03T16:38:02Z |
| Reg. (EU) 2022/2554 Art. 19(1), 19(4), 20 | cellar, `https://publications.europa.eu/resource/celex/32022R2554` | 2026-10-03T16:38:04Z |
| Del. Reg. (EU) 2025/301 Art. 5 | cellar, `https://publications.europa.eu/resource/celex/32025R0301` | 2026-10-03T16:38:05Z |
| Dir. (EU) 2022/2555 Art. 23 | cellar, `https://publications.europa.eu/resource/celex/32022L2555` | 2026-10-03T16:38:06Z |
| Reg. (EU) 2016/679 Art. 33–34 | cellar, `https://publications.europa.eu/resource/celex/32016R0679` | 2026-10-03T16:38:08Z |
| 45 CFR 164.404 / 164.408 | GPO govinfo CFR 2024 annual edition, Title 45 Vol. 2 | 2026-10-03T16:38:09Z |
| 45 CFR 164.410 | GPO govinfo CFR 2024 annual edition, Title 45 Vol. 2 | 2026-10-03T16:38:10Z |
| 21 CFR 803.50 | GPO govinfo CFR 2024 annual edition, Title 21 Vol. 8 (revised 2024-04-01) | 2026-10-03T16:36:55Z |
| 21 CFR 803.53 | GPO govinfo CFR 2024 annual edition, Title 21 Vol. 8 (revised 2024-04-01) | 2026-10-03T16:36:56Z |
| 23 NYCRR 500.1, 500.17, 500.19, 500.22 | NYDFS, Second Amendment as adopted (effective 2023-11-01), `https://www.dfs.ny.gov/system/files/documents/2023/10/rf_fs_2amend23NYCRR500_text_20231101.pdf`; cross-read against the department's consolidated Part 500 text at `https://www.dfs.ny.gov/cybersecurity/23-NYCRR-Part-500` (2026-10-07T17:12:35Z), which it labels unofficial | 2026-10-07T17:11:34Z |
| 16 CFR 314.4(j) | GPO govinfo CFR 2026 annual edition, Title 16 Vol. 1 (revised 2026-01-01), `https://www.govinfo.gov/content/pkg/CFR-2026-title16-vol1/xml/CFR-2026-title16-vol1-sec314-4.xml`; 314.1 and 314.2 from the same edition (2026-10-07T17:10:47Z); eCFR version history: last amendment 2024-05-13 | 2026-10-07T17:10:30Z |
| 31 CFR 1020.320 | GPO govinfo CFR 2025 annual edition, Title 31 Vol. 3 (revised 2025-07-01), `https://www.govinfo.gov/content/pkg/CFR-2025-title31-vol3/xml/CFR-2025-title31-vol3-sec1020-320.xml`; eCFR text for 2026-10-01 read at 2026-10-07T17:11:12Z with the same (b)(3) deadlines; eCFR version history: last amendment 2016-12-23 | 2026-10-07T17:10:02Z |
| Tex. Bus. & Com. Code § 521.053 | Texas Legislative Council statute file `https://tcss.legis.texas.gov/resources/BC/htm/BC.521.htm`, the file `statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm` loads (the site itself is a script shell); amended through Acts 2023, 88th Leg., ch. 246 (S.B. 768), eff. 2023-09-01 | 2026-10-07T17:14:09Z |

Boundary: the F4 govinfo copies are the 2024 annual CFR edition, not the live
eCFR point-in-time text; amendments after the annual edition are not reflected.
For the P1-17 CFR rows the eCFR version history (ecfr.gov, read 2026-10-07)
shows no amendment after the annual edition cited. No later amendment to
Part 500 was looked for beyond the department's pages listed above.
The two Texas durations were the F4 engineer's recollection on 2026-10-03,
when only the site shell answered. P1-17 read § 521.053 on 2026-10-07: both
durations and the 250-resident threshold match the statute, the rows now quote
it, list the six Attorney General content items of § 521.053(i) and are
`verified: true`.

## Sourcing from the S5 regulatory register later

The table is local by design (S5 is rewriting `src/compliance/globalRegulatory.ts`
and `src/compliance/regulatoryRegister/**` concurrently). When the register
settles, each `RegulatoryClock` should become a projection of a register row:
keep `clockId`, `trigger`, `deadline`, `notify`, `requiredContent` and
`condition` here (they are clock semantics, not register facts), and replace
the hand-maintained `source` block with the register row's `{title, url,
retrievedAt, verified}` looked up by instrument + article. A currency check
(`scripts/check-regulatory-currency.mjs`, S5) can then flag any clock whose
register source is older than its policy window. Do not import from
`src/compliance/**` until S5 lands.

## Human-oversight record

```ts
createOversightRecord({ incident, reviewerId, reviewedTs, decision, rationale,
                        clockIds?, prevRecordHash?, privateKeyPem, now? }) → HumanOversightRecord
verifyOversightRecord(record, incident, publicKeys) → { ok, errors[] }
verifyOversightChain(records, incident, publicKeys) → { ok, errors[] }
recordWorkspaceOversight({ workspace, incident, reviewerId, decision, rationale, clockIds,
                           reviewedTs, privateKeyPem, publicKeys }) → HumanOversightRecord
appendOversightRecord(filePath, record); readOversightRecords(filePath)
oversightRecordPath(workspace, incidentId) → <workspace>/.amc/incidents/oversight/<id>.jsonl
```

Decisions: `ACKNOWLEDGED`, `ESCALATED`, `REPORT_REQUIRED`, `NO_REPORT_REQUIRED`,
`CLOSED`. The record hash is `sha256(canonicalize(payload))` and the signature
is `signHexDigest(recordHash, privateKeyPem)` — the same Ed25519 primitive the
incident store uses (`src/crypto/keys.ts`). `src/receipts/receiptChain.ts` is
being rewritten by another session, so storage is a plain append-only JSONL
file rather than a chain entry; the `prevRecordHash` field preserves ordering
for a later migration.

Guards, each mutation-verified in the F4 track (receipt commit `ed9b45a2`):

- `reviewedTs < incident.createdTs` throws at creation (`backdated`).
- The verifier re-checks the same inequality, so a validly signed record whose
  signer bypassed the creation guard is still rejected.
- Hash mismatch, signature failure, incident-hash mismatch and unknown
  decision each produce their own error string.

P1-17 additions:

- Each record carries `recordedTs`, set from the server clock when it is
  signed and inside the hashed payload, beside the operator-stated
  `reviewedTs`. A `reviewedTs` more than 5 minutes after `recordedTs` is
  refused at creation and fails verification.
- `verifyOversightChain` checks a whole file: every record, a null first
  `prevRecordHash`, each later one equal to its predecessor's `recordHash`,
  and non-decreasing `reviewedTs`. `recordWorkspaceOversight` (used by the CLI
  and the API) refuses to append to a file that fails it, so a forged or
  edited record is never endorsed, and the evidence packet runs it too.

## Evidence packet

```ts
buildEvidencePacket({ incident, station, generatedTs, clocks, transitions?, causalEdges?,
                      oversightRecords?, oversightPublicKeys?, receipts?, timelineEvents? })
renderEvidencePacketMarkdown(packet) → string
```

`missing` items and when they appear: `human-oversight-record` (none supplied,
or none verified), `oversight-chain` (the supplied records fail
`verifyOversightChain`; every record is then reported unverified),
`oversight-verification-keys` (records without keys),
`ledger-receipts` (none), `receipt-signature-verification` (any receipt not
`verified: true`), `state-transitions`, `causal-edges`, `timeline-events`,
`root-cause-claims`, `postmortem`, `resolution-timestamp`. `overdueClockIds`
lists clocks in `OVERDUE` state at `generatedTs`. `packetSha256` is the SHA-256
of the canonicalised packet body. `amc incident show <id> --packet <dir>
--station <station>` builds the packet from the stored incident, its
transitions and causal edges, the station's clocks from verified clock events
and the workspace oversight file; receipts and timeline events are not
supplied there yet, so they are listed as missing.

## Running the checks

```bash
pnpm vitest run tests/regulatoryClocks.test.ts tests/incidentEvidencePacket.test.ts
```

The tests use a fixed trigger of 2026-03-02T10:00:00Z and never call
`Date.now()`.

## Exports

`src/incidents/index.ts` exports the four modules (P1-17 applied the F4
ready-to-wire block and added `incidentClockEvents.ts`). The F4 track receipt is commit `ed9b45a2` on the public
branch `worktree-wf_fc54d4b0-c89-4`; the code was cherry-picked from `ff857211`.
