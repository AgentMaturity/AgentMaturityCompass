# Regulatory Incident Clocks, Human-Oversight Records and Evidence Packets

Track F4 of the 2026-10-03 regulated-platform program. This document describes
the clock table in `src/incidents/regulatoryClocksTable.ts`, the clock
arithmetic in `src/incidents/regulatoryClocks.ts`, the signed human-oversight
record in `src/incidents/oversightRecord.ts`, and the regulator evidence packet
in `src/incidents/evidencePacket.ts`. All four are additive modules over the
existing incident types (`src/incidents/incidentTypes.ts`); nothing in the
incident store changed.

## What this gives an on-call operator

1. **Clocks per station.** Given an AMC `Incident` and the station it belongs
   to (`Domain`: health, wealth, technology, …), `attachRegulatoryClocks` lists
   the regulation-derived reporting deadlines that are candidates for that
   station, each with a computed due date and a status.
2. **Due / overdue state without a wall clock.** Every computation takes an
   explicit `nowTs`; nothing calls `Date.now()`. Statuses: `NOT_STARTED`
   (trigger not recorded), `PENDING`, `DUE_SOON` (within 24 h), `OVERDUE`,
   `SATISFIED`, `SATISFIED_LATE`.
3. **A signed human-oversight record** — who reviewed, when, what they decided
   — that cannot be dated before the incident, bound to the incident hash,
   chained by `prevRecordHash`, and verifiable against the monitor public keys.
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
`INCIDENT_NOTIFICATION`, `BREACH_DETERMINATION`, and the derived
`CALENDAR_YEAR_END_AFTER_AWARENESS` (1 January UTC of the year after
awareness). A clock whose trigger has not been recorded is `NOT_STARTED` with
no due date — it is never invented.

Arithmetic (`addDuration`) is UTC-only: hours and calendar days are exact
millisecond offsets; work days skip Saturday and Sunday UTC and do **not**
model public holidays; months add a calendar month and clamp the day
(31 Jan + 1 month = 28/29 Feb). DORA RTS Art. 5(4) weekend/bank-holiday
relief and HIPAA 164.412 law-enforcement delay are not modelled; the
`condition` text says so.

## Clock table (as encoded on 2026-10-03)

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
| tx-bcc-521-053-individual-notice | Tex. Bus. & Com. Code § 521.053(b) | all | BREACH_DETERMINATION | 60 calendar days | affected individuals | **no** |
| tx-bcc-521-053-attorney-general | Tex. Bus. & Com. Code § 521.053(i) | all | BREACH_DETERMINATION | 30 calendar days | Texas Attorney General | **no** |

"Station(s)" is where the clock is *surfaced*; it is not an applicability
ruling. 45 CFR 164.404 binds HIPAA covered entities, DORA binds financial
entities, NIS2 binds essential/important entities under national transposition.
The operator confirms applicability in the oversight record.

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
| Tex. Bus. & Com. Code § 521.053 | `https://statutes.capitol.texas.gov/Docs/BC/htm/BC.521.htm` — **site shell only, no section text**; `GetStatute.aspx?Code=BC&Value=521.053` likewise; `texasattorneygeneral.gov` breach page HTTP 404 | 2026-10-03T16:36:58Z |

Boundary: the govinfo copies are the 2024 annual CFR edition, not the live
eCFR point-in-time text; amendments after the annual edition are not reflected.
The two Texas durations (60 days to individuals, 30 days / 250-resident
threshold to the Attorney General) are the engineer's recollection and are
marked `verified: false` with the reason in the table; they must be confirmed
against the statute before anyone relies on them.

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
                        clockIds?, prevRecordHash?, privateKeyPem }) → HumanOversightRecord
verifyOversightRecord(record, incident, publicKeys) → { ok, errors[] }
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

Guards, each mutation-verified (see the F4 receipt):

- `reviewedTs < incident.createdTs` throws at creation (`backdated`).
- The verifier re-checks the same inequality, so a validly signed record whose
  signer bypassed the creation guard is still rejected.
- Hash mismatch, signature failure, incident-hash mismatch and unknown
  decision each produce their own error string.

## Evidence packet

```ts
buildEvidencePacket({ incident, station, generatedTs, clocks, transitions?, causalEdges?,
                      oversightRecords?, oversightPublicKeys?, receipts?, timelineEvents? })
renderEvidencePacketMarkdown(packet) → string
```

`missing` items and when they appear: `human-oversight-record` (none supplied,
or none verified), `oversight-verification-keys` (records without keys),
`ledger-receipts` (none), `receipt-signature-verification` (any receipt not
`verified: true`), `state-transitions`, `causal-edges`, `timeline-events`,
`root-cause-claims`, `postmortem`, `resolution-timestamp`. `overdueClockIds`
lists clocks in `OVERDUE` state at `generatedTs`. `packetSha256` is the SHA-256
of the canonicalised packet body.

## Running the checks

```bash
pnpm vitest run tests/regulatoryClocks.test.ts tests/incidentEvidencePacket.test.ts
```

The tests use a fixed trigger of 2026-03-02T10:00:00Z and never call
`Date.now()`.

## Not wired yet (ready-to-wire)

`src/incidents/index.ts` is outside this track's claimed paths. The additive
export block to apply there is recorded in the F4 receipt
(`AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/tracks/F4/report.md`).
There is no CLI or API route for these modules yet; the incident API
(`src/api/*`) is in the other session's dirty set.
