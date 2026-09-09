# AMC Automated Installation Contract Report

Schema: 2026-09-08
Status: PASSED
Summary: 103/103 persona checks passed; 0 failed; 0 skipped. Setup: 2/2 checks passed; 0 failed; 0 skipped.
Started: 2026-09-09T11:45:36.343Z
Ended: 2026-09-09T11:47:36.788Z
Personas: 10

## Automated installation contract checks

| Persona | Status | Passed / planned checks | Failed | Skipped | Install wall ms | Score command wall ms | CLI-reported diagnostic ms | Score evidence status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Solo Developer | passed | 10/10 | 0 | 0 | 6686 | 1061 | 314 | INSUFFICIENT_EVIDENCE |
| Platform Engineer | passed | 10/10 | 0 | 0 | 6582 | 1086 | 364 | INSUFFICIENT_EVIDENCE |
| Security Lead | passed | 10/10 | 0 | 0 | 6238 | 1052 | 312 | INSUFFICIENT_EVIDENCE |
| Compliance Officer | passed | 10/10 | 0 | 0 | 6576 | 1037 | 318 | INSUFFICIENT_EVIDENCE |
| AI Product Manager | passed | 11/11 | 0 | 0 | 6816 | 1087 | 311 | INSUFFICIENT_EVIDENCE |
| QA Engineer | passed | 10/10 | 0 | 0 | 7773 | 1053 | 335 | INSUFFICIENT_EVIDENCE |
| DevOps Engineer | passed | 10/10 | 0 | 0 | 6735 | 1053 | 322 | INSUFFICIENT_EVIDENCE |
| Fleet Operator | passed | 11/11 | 0 | 0 | 7722 | 1039 | 315 | INSUFFICIENT_EVIDENCE |
| Data Scientist | passed | 11/11 | 0 | 0 | 7167 | 1032 | 313 | INSUFFICIENT_EVIDENCE |
| Startup Founder | passed | 10/10 | 0 | 0 | 6819 | 1050 | 330 | INSUFFICIENT_EVIDENCE |

## Failed and skipped checks

- None.

## Measurement scope

Automated command exit and declared JSON contract checks. Human usability, workflow quality and maturity qualification are outside this measurement.
- Command wall times include the child invocation. CLI-reported diagnostic elapsed excludes later evidence writing and output.
- Missing measurements are unavailable. CLI-reported SLA target, elapsed and met fields are retained in JSON.
- A fresh INSUFFICIENT_EVIDENCE score can satisfy the output contract; accepted maturity claims require separate evidence.
