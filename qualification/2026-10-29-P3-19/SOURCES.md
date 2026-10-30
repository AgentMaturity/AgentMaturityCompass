# P3-19 source re-verification

Each regime fact the issue lists, checked at its primary source on 2026-10-29. The sha256 is of the bytes fetched that
day (kept outside the repository). Text was extracted with `pdftotext -layout` (the OMB PDF) or by stripping tags.

| Fact (from the issue) | Primary source and URL | Checked | Result |
| --- | --- | --- | --- |
| M-25-22 issued 3 Apr 2025 | OMB M-25-22 PDF, <https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf> (sha256 `e157538371eb9665fabdacff748788fc6afc0575bb3661d15b146f3138084cd8`) | 2026-10-29 | Holds: dated April 3, 2025. |
| Covers solicitations from 1 Oct 2025 | same, Sec. 2(c) | 2026-10-29 | Corrected: applies to contracts awarded on solicitations issued on or after 180 days after issuance (computed 30 Sep 2025, as the register records) and to options exercised after that date. The memo states no calendar date. |
| Contract terms for "high-impact" AI | same, Sec. 4(d)(iii)(D) | 2026-10-29 | Holds: contracts must ensure M-25-21 minimum practices for high-impact use cases. |
| Agency rights to test and monitor | same, Sec. 4(d)(iii)(E)(I)-(III) | 2026-10-29 | Holds. Used in PC-EVIDENCE-DELIVERY, PC-INDEPENDENT-VERIFICATION, PC-TEST-AND-MONITOR. |
| Data and IP terms | same, Sec. 3(e)(iv), 4(d)(iii)(A) and (C), 4(f)(i) | 2026-10-29 | Holds. Used in PC-DATA-USE-AND-EXIT. |
| Vendor notice of new AI features | same, Sec. 4(d)(iii)(G) | 2026-10-29 | Holds, but softer than the issue: agencies "should consider, where relevant" requiring it. Used in PC-CHANGE-NOTICE. |
| Incident notice (M-25-22) | same | 2026-10-29 | Not found: the memo has no incident-notice term, so PC-INCIDENT-NOTICE cites DORA and RBI only. |
| DORA register of information and contract requirements (Arts. 28-30) | Regulation (EU) 2022/2554, OJ text via Publications Office, <https://publications.europa.eu/resource/celex/32022R2554> (xhtml, sha256 `cf50d8f023d23b2a56f535aaee0760eba7f1925ef08a9858c5c31d43d414f46b`) | 2026-10-29 | Holds: Art. 28(3) register, 28(8) exit, 28(9) templates; Art. 30(2) and 30(3) key contractual provisions. EUR-Lex HTML returned an empty body to the fetcher, so the Cellar copy of the same OJ text was used. |
| RBI 2025 outsourcing directions: loan sanction and KYC determinations cannot be outsourced | RBI (Commercial Banks - Managing Risks in Outsourcing) Directions, 2025, RBI/DOR/2025-26/171, 28 Nov 2025, <https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13139> (sha256 `76c12d2a79bfb80aa4b6c936da5e60bfb0c2a7e78c42575f8abe6e125d8321bc`), para 15 | 2026-10-29 | Holds at the primary source. The NBFC directions (RBI/DOR/2025-26/363, id=12941, sha256 `f37d44d8ee186cfba6dd005a551f9773198773e662e43665bad7816e1d0bc102`) say the same with an intra-group exception; the Payments Banks directions (id=13088, sha256 `1c44b7d6f4219601aa39ad8c0d50841699326f24eecaed0844ab24564367623a`) omit loan sanction; the UCB directions (id=13012, sha256 `092969045103cebafd4de912d3f4b89fce0a2b036d9366cf3226d05c9f6ff0f4`) say "credit sanction". PC-RBI-RETAINED-DECISIONS states these differences. |
| RBI Nov 2025 consolidation into master directions (strategy re-verify list) | same pages | 2026-10-29 | Holds: the four entity-type directions above are each dated 28 Nov 2025. |
| RBI incident timing | Commercial Banks directions para 56 and 69(iii) | 2026-10-29 | Found: the bank reports cyber incidents to RBI within six hours of detection by the service provider. Used in PC-INCIDENT-NOTICE. |

These checks were made by an AI agent. They are leads for counsel, not legal conclusions.
