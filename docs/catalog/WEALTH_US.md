# Wealth overlay v0.1 and the US register

Status: v0.1, experimental (P1-18). Every control and register entry here is agent-drafted and not independently
reviewed. No expert or legal reviewer is named yet (D-08), and nothing here is a compliance claim: a control result is
evidence of conformity, never proof of compliance.

- Controls: `catalog/layers/l1-wealth-us/` (pack `amc.l1.wealth.us`, Layer 1, station `wealth`, jurisdiction `US`).
- Fixtures: `catalog/fixtures/L1-WLT-US-*/`.
- US register: `catalog/registers/us.json`, in the register format of [REGISTER.md](REGISTER.md).
- Jurisdiction profiles: `catalog/jurisdictions/us/profiles.json`.
- Tests: `tests/wealthOverlay.test.ts`, `tests/usRegister.test.ts`, and the executed harnesses in `tests/catalog/l0/`.

The plan named the folders `catalog/overlays/wealth/` and `catalog/schema/`. P1-09's loader reads packs only under
`catalog/layers/<pack>/` and publishes JSON Schemas under `spec/schemas/v1/`, so the overlay lives in
`catalog/layers/l1-wealth-us/` and the entry schema in `spec/schemas/v1/register-entry.schema.json`.

## Controls

Wave 1 covers US banking, lending and finance operations. Each control lists the Layer 0 control it extends, if any. A
control is "executed" when one of its fixtures drives a real enforcement point on `int`; most executed tests cover only
part of the statement, and the column says which part.

| ID | Plan slug | Title | Test type | Producer status | Executed test | Extends | Citations | Review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1-WLT-US-01 | wealth.us.delegation | Explicit, revocable delegation to the agent | runtime_enforced, drill | available | yes: the lease check refuses a revoked, expired or other agent's delegation of a FINANCIAL transfer, and the revocation drill refuses the next transfer | L0-IDN-02, L0-IDN-04 | 2 | pending (D-08) |
| L1-WLT-US-02 | wealth.us.approval-binding | Payment approval bound to amount and payee | runtime_enforced | available | yes: the bound approval refuses a changed amount or payee before the payment body runs | L0-OVS-02 | 0 | pending (D-08) |
| L1-WLT-US-03 | wealth.us.ambiguous-payment | An ambiguous payment outcome is never repeated | runtime_enforced | available | no: P1-20 runs P1-19 cases F18, F19 and F21 to F24 against the compiled profile | none | 0 | pending (D-08) |
| L1-WLT-US-04 | wealth.us.sar-no-tipping-off | No SAR tipping-off | executed_adversarial (25 attempts) | planned (P1-48) | no: awaits the external observer (P1-48) | none | 1 | pending (D-08) |
| L1-WLT-US-05 | wealth.us.sar-workflow | SAR workflow: a human approver and the 30-day clock from detection | drill | available | yes: initial detection starts the SAR clock with its 30-day deadline; backdated, early and repeated events are refused. The approver and the five-year retention are not driven | L0-MON-02 | 2 | pending (D-08) |
| L1-WLT-US-06 | wealth.us.activity-monitoring | Agent access to customer information is logged and scoped | runtime_enforced | available | yes: the tool-allowlist guard refuses an unlisted read and any read under an edited allowlist; a listed read is recorded. Alerting is not driven | L0-TOOL-01 | 1 | pending (D-08) |
| L1-WLT-US-07 | wealth.us.inventory-mfa | Agents and credentials inventoried with an owner; MFA for people | configuration_check | available | yes: the signed agent registry entry; a missing or edited entry fails. Owner, credentials and MFA are not checked | L0-INV-01 | 3 | pending (D-08) |
| L1-WLT-US-08 | wealth.us.npi-extraction | Bulk NPI extraction is throttled, blocked and alerted | executed_adversarial (25 attempts) | partial (P1-79, proposed) | no: awaits the extraction monitor (P1-79, proposed) | L0-DAT-01 | 1 | pending (D-08) |
| L1-WLT-US-09 | wealth.us.vendor-oversight | AI vendors tiered as third parties; a silent model change is detected | document_review | planned (P1-75, P1-76) | no: a manual duty; awaits the version manifest (P1-75) and duty records (P1-76) | L0-CHG-04 | 3 | pending (D-08) |
| L1-WLT-US-10 | wealth.us.model-inventory | Traditional models the agent calls are inventoried and validated | runtime_enforced | planned (P1-75) | no: awaits the version manifest (P1-75) | L0-CHG-01 | 1 | pending (D-08) |
| L1-WLT-US-11 | wealth.us.incident-notices | NYDFS 72-hour and GLBA 30-day notice drills | drill | partial (P2-26) | yes: a determination starts the NYDFS 72-hour clock and awareness the GLBA 30-day clock; a notice for another station and a future-dated notice are refused. Notice drafts await P2-26 | L0-MON-02 | 2 | pending (D-08) |
| L1-WLT-US-12 | wealth.us.kill-switch | Payment kill switch with manual fallback and no lost work | drill | planned (P2-26) | no: awaits the operator stop (P2-26) | L0-MON-03 | 0 | pending (D-08) |
| L1-WLT-US-13 | wealth.us.credit-reasons | Specific reasons that match the decision's drivers | runtime_enforced | planned (P1-73) | no: awaits reason lineage (P1-73) | L0-EXP-01 | 2 | pending (D-08) |
| L1-WLT-US-14 | wealth.us.credit-factor-flip | Moving the top stated factor flips the decision | executed_adversarial (25 attempts) | planned (P1-73) | no: awaits the perturbation harness (P1-73) | L0-EXP-01 | 1 | pending (D-08) |
| L1-WLT-US-15 | wealth.us.credit-name-zip | Name and ZIP swaps change no credit decision | executed_adversarial (25 attempts) | planned (P1-74) | no: awaits the paired-case harness (P1-74) | L0-FAI-01 | 0 | pending (D-08) |

Totals: 15 controls; 6 with an executed test against an enforcement point on `int` (01, 02, 05, 06, 07, 11) and 9
waiting for a producer or for P1-20 to run the P1-19 corpus. Every control also has evidence fixtures (valid,
violation, stale, replayed, contradictory, cross-tenant and empty) that run through P1-11's `evaluateControl`; no
negative fixture passes.

Controls 02, 03 and 12 name no citation: the plan gives none for them, and none is invented. Control 15 relies on
L0-FAI-01's Regulation B anti-discrimination citations.

### Signature tests

The plan marks four tests as the finance lighthouse's signature tests. Each test record's pass criteria start with
"Signature test (P1-20)": L1-WLT-US-02 (approval bound to amount and payee), L1-WLT-US-03 (no duplicate payment when
the provider succeeded and the local receipt was lost), L1-WLT-US-04 (no SAR tipping-off) and L1-WLT-US-12 (kill-switch
drill). P1-20 runs them against the compiled finance-operations profile.

### Credit-decision controls

L1-WLT-US-13 to 15 apply only where the profile's `useCases` include `credit_decision`, with an explicit exclusion for
a reconciliation agent that makes no credit decision. The finance-operations profile
(`tests/fixtures/catalog/compiler/finance-ops-us.profile.json`) compiles them as `not_applicable`; an unknown use case
leaves them unresolved, which blocks the plan.

### Effect on compiled plans

The pack applies to any profile whose stations include `wealth` and whose jurisdictions include `US`, or leave either
unknown. Such a plan now lists the twelve finance-operations controls as requirements, and L1-WLT-US-02 adds
`FINANCIAL` to `toolPipeline.approvalRequiredFor`. The catalog lock covers the new pack, the registers, the jurisdiction
profiles and the S5 register, so every plan activated before this change fails the lock check and must be recompiled
and reactivated (docs/releases/2.0.0.md, "Compiled control plans").

## The US register

`catalog/registers/us.json` holds 33 entries, one per clause, for the strategy's 11 US rows plus one added row for
Regulation B, which the credit-decision controls cite. Five entries carry a content hash: bytes P1-17 fetched and hashed
on 2026-10-07 (`qualification/2026-10-07-P1-17/sources.md`), whose clause P1-17 encoded from that text. The other 28 are
unverified, each with a `sourceNote` giving the reason: P1-18 ran without network access, so nothing was fetched or
hashed here.

| Row | Stations | Entries | Status types |
| --- | --- | --- | --- |
| Reg E, 12 CFR 1005.2 | wealth, technology | `us-reg-e-1005-2-m`, `us-reg-e-comment-2-m-3` | binding-now |
| GLBA Safeguards Rule, 16 CFR 314.4 | wealth, technology | `us-glba-314-4-c-5`, `us-glba-314-4-c-8`, `us-glba-314-4-f`, `us-glba-314-4-j` (hashed) | binding-now |
| BSA SAR rule, 31 CFR 1020.320 | wealth | `us-bsa-1020-320-b-3` (hashed), `us-bsa-1020-320-e` (hashed), `us-bsa-1020-320-d` (hashed) | binding-now |
| NYDFS Part 500 and its AI letter | wealth, technology | `us-nydfs-500-17-a` (hashed), `us-nydfs-500-13-inventory`, `us-nydfs-500-12-mfa`, `us-nydfs-ai-letter-extraction` | binding-now |
| SR 26-2 | wealth | `us-sr-26-2-models` | supervisory-guidance |
| SR 23-4 and its replacement proposal | wealth, technology | `us-sr-23-4`, `us-tprm-proposal-2026` | supervisory-guidance, draft |
| HIPAA Privacy, Security and Breach Notification Rules | health, technology | `us-hipaa-164-502-b`, `us-hipaa-164-312`, `us-hipaa-164-502-e`, `us-hipaa-164-404`, `us-hipaa-security-nprm-2025` | binding-now, draft |
| ACA §1557, 45 CFR 92.210 | health | `us-aca-1557-92-210-b`, `us-aca-1557-92-210-c` | binding-now |
| CMS-0057-F | health, wealth | `us-cms-0057-f-decisions`, `us-cms-0057-f-api` | binding-now |
| California AB 3030 and SB 1120; Texas TRAIGA | health | `us-ca-ab3030`, `us-ca-sb1120`, `us-tx-traiga-552-051` | binding-now |
| Colorado SB 26-189; California CCPA rules on automated decisions | all seven | `us-co-sb26-189-deployers`, `us-co-sb26-189-developers`, `us-ca-ccpa-admt-notice`, `us-ca-ccpa-risk-assessment` | binding-future |
| ECOA Regulation B, 12 CFR 1002.9 (added) | wealth | `us-reg-b-1002-9` | binding-now |

Dates come only from the plan's table, its named research dates, the S5 register and P1-17's receipts. A date no source
states is `null` with a `dateNotes` reason: the Reg E, GLBA and BSA effective dates stay null. Two dates differ from what
the S5 register verifies and are flagged for re-verification: the plan gives 2025-01-01 for AB 3030 and SB 1120, while
S5 found no operative date in the bill text. The BSA paragraph letters, which the plan left to a reviewer, come from
P1-17's reading of the hashed text.

Re-verify flags: Reg E's application to agents holding delegated credentials (rows 1), the banking agencies' AI request
for information (row 5), SR 23-4's replacement (row 6), Colorado SB 26-189's final text and the CCPA dates (row 11), the
Part 500 section numbers for the inventory and MFA, the AI letter's status, and the AB 3030 and SB 1120 operative dates.
Every entry whose jurisdiction starts with `US-` is litigation-exposed under EO 14365 (S5 `us-eo-14365`); only a legal
reviewer clears the flag, with a rationale. With `asOf` 2027-01-02, `statusReviewDue` reports the Colorado entries and
`us-ca-ccpa-admt-notice` for P1-34's currency review.

### Entries awaiting a legal reviewer

All 33: `us-reg-e-1005-2-m`, `us-reg-e-comment-2-m-3`, `us-glba-314-4-c-5`, `us-glba-314-4-c-8`, `us-glba-314-4-f`,
`us-glba-314-4-j`, `us-bsa-1020-320-b-3`, `us-bsa-1020-320-e`, `us-bsa-1020-320-d`, `us-nydfs-500-17-a`,
`us-nydfs-500-13-inventory`, `us-nydfs-500-12-mfa`, `us-nydfs-ai-letter-extraction`, `us-sr-26-2-models`,
`us-sr-23-4`, `us-tprm-proposal-2026`, `us-hipaa-164-502-b`, `us-hipaa-164-312`, `us-hipaa-164-502-e`,
`us-hipaa-164-404`, `us-hipaa-security-nprm-2025`, `us-aca-1557-92-210-b`, `us-aca-1557-92-210-c`,
`us-cms-0057-f-decisions`, `us-cms-0057-f-api`, `us-ca-ab3030`, `us-ca-sb1120`, `us-tx-traiga-552-051`,
`us-co-sb26-189-deployers`, `us-co-sb26-189-developers`, `us-ca-ccpa-admt-notice`, `us-ca-ccpa-risk-assessment`,
`us-reg-b-1002-9`.

### S5 register changes

`src/compliance/regulatory/register.json` gains `us-reg-e`, `us-glba-safeguards`, `us-bsa-sar`, `us-nydfs-part-500`,
`us-sr-23-4`, `us-tprm-proposal-2026` and `us-hipaa-rules`, all `verified: false`. `policy.officialHosts` gains
`consumerfinance.gov`, `dfs.ny.gov` and `cms.gov` (regulators; awaiting Sid's approval), and the shared host list in
`src/compliance/citations/officialHosts.ts` follows. Stations were added, never removed: `us-cms-0057-f` gains wealth,
`us-hipaa-security-nprm-2025` gains technology, and `us-co-sb26-189` and `us-ca-cppa-admt` cover all seven stations.

## Jurisdiction profiles

`catalog/jurisdictions/us/profiles.json` holds `us-federal` (rows 1 to 3 and 5 to 9, plus Regulation B; OMB
memoranda and CMMC listed as other instruments owned by P3-14) and six state profiles: `us-co`, `us-ca`, `us-tx`,
`us-nyc`, `us-il` and `us-ny`. Each state profile is litigation-exposed and lists the instruments other issues own:
Colorado Regulation 10-1-1 and NYDFS Circular Letter 7 (P2-31), California SB 243 and Illinois HB 1806 (P2-04),
California's Civil Rights Council rules, NYC Local Law 144 and Illinois HB 3773 (P3-13), and California AB 302 and the
New York LOADinG Act (P3-14). Instruments with no S5 entry yet carry `s5RegisterId: null`.

## Sign-off checklist for the D-08 finance reviewers

- [ ] Read and hash every unverified source; pin each clause, paragraph letter and date.
- [ ] Confirm or correct each re-verify flag; record a rationale for any litigation flag you clear.
- [ ] Fill `legalReviewer` on each entry, two people per entry.
- [ ] Confirm each control's statement, applicability, citations and pass criteria, and record the expert review.
- [ ] Sid: approve the three new official hosts.
