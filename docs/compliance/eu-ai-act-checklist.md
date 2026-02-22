# EU AI Act Checklist for AMC (Pass/Fail/Partial)

- Audit date: 2026-02-22
- Scope: AMC repository controls and documentation artifacts
- Assessment basis: engineering evidence only

## Applicability Snapshot

- AMC can operate in domains mapped internally as high-risk (`docs/DOMAIN_PACKS.md:14`, `docs/DOMAIN_PACKS.md:20`), so Annex III obligations are deployment-dependent.
- Current AMC implementation does not enforce a formal Annex III applicability decision workflow (`src/score/euAIActCompliance.ts:47`).

## Status Legend

- `PASS`: implemented with repeatable evidence path
- `PARTIAL`: some controls exist but not complete for legal-grade assurance
- `FAIL`: control not implemented or no evidentiary implementation found

## Checklist

| Requirement | Status | Evidence in AMC | Gap Notes |
|---|---|---|---|
| Art. 6 + Annex III classification workflow | PARTIAL | Domain risk mapping exists (`docs/DOMAIN_PACKS.md:12`) | No deterministic classification decision record; optional file read only (`src/score/euAIActCompliance.ts:47`) |
| Art. 9 risk management system | FAIL | Scorer expects `docs/RISK_MANAGEMENT.md` (`src/score/euAIActCompliance.ts:56`) | Required risk-management artifact missing |
| Art. 10 data governance | FAIL | Scorer expects `docs/DATA_GOVERNANCE.md` (`src/score/euAIActCompliance.ts:62`) | Data governance artifact missing |
| Art. 11 technical documentation (Annex IV-ready) | PARTIAL | General docs exist (`README.md`, `docs/ARCHITECTURE_MAP.md`) via scorer (`src/score/euAIActCompliance.ts:68`) | No Annex IV-style technical dossier structure |
| Art. 12 automatic logs/traceability | PARTIAL | Append-only ledger (`src/ledger/ledger.ts:187`), transparency chain (`src/transparency/logChain.ts:98`) | No explicit per-use-case high-risk log profile templates |
| Art. 13 deployer transparency / instructions for use | PARTIAL | EU article pack expects transparency artifact (`src/assurance/packs/euAiActArticlePack.ts:31`) | No dedicated instructions-for-use documentation set |
| Art. 14 human oversight | PARTIAL | Approvals/governor controls exist (`src/score/euAIActCompliance.ts:80`) | Oversight evidence in assurance pack is artifact-token based (`src/assurance/packs/euAiActArticlePack.ts:44`) |
| Art. 15 accuracy/robustness/cybersecurity | PARTIAL | Assurance/enforce/shield modules exist (`src/score/crossFrameworkMapping.ts:69`) | No obligation-specific acceptance criteria registry per deployment |
| Art. 17 quality management system | FAIL | Scorer looks for `docs/QA.md` (`src/score/euAIActCompliance.ts:92`) | QMS/AIMS manual artifacts missing |
| Art. 26 deployer obligations baseline | PARTIAL | Logging/monitoring infrastructure exists | No explicit deployer-obligation control matrix and assignment workflow |
| Art. 26(6) log retention baseline | PARTIAL | Archive + retention policy (`src/ops/policy.ts:80`, `src/ops/retention/retentionEngine.ts:235`) | No explicit legal-policy mapping demonstrating deployer retention conformance by use case |
| Art. 27 FRIA (where applicable) | FAIL | FRIA question exists (`src/diagnostic/questionBank.ts:1491`) | No FRIA workflow artifact/schema (`docs/FRIA.md` missing) |
| Art. 43 conformity assessment readiness | PARTIAL | Conformity readiness question and mapping exist (`src/diagnostic/questionBank.ts:1556`, `src/score/crossFrameworkMapping.ts:73`) | No end-to-end conformity dossier generator with mandatory annex evidence |
| Art. 47 EU declaration of conformity | FAIL | No explicit artifact flow found | Missing declaration artifact template/workflow |
| Art. 48 CE marking workflow | FAIL | No CE-marking workflow found | Missing |
| Art. 49 registration obligations support | FAIL | No registration workflow found | Missing |
| Art. 72 post-market monitoring plan | PARTIAL | Post-market question exists (`src/diagnostic/questionBank.ts:1517`) | No dedicated PMM plan artifact template |
| Art. 73 serious incident reporting to authorities | PARTIAL | Incident subsystem exists (`src/incidents/incidentTypes.ts:27`) | No regulator-deadline and external-report receipt workflow |
| Art. 86 right to explanation | FAIL | Explainability packet exists (`src/watch/explainabilityPacket.ts:20`) | No data-subject explanation request/response/appeal lifecycle and SLA evidence |
| Art. 4 AI literacy | PARTIAL | Governance docs discuss competence and oversight (`docs/GOVERNANCE.md`) | No formal AI literacy training records/cadence artifact |
| Art. 50 transparency for AI interaction/synthetic content | PARTIAL | Transparency-related controls and logs exist | No dedicated policy controls for all Article 50 disclosure duties |

## Aggregate Result

- `PASS`: 0
- `PARTIAL`: 13
- `FAIL`: 8

## Priority Fixes

1. Add formal high-risk applicability workflow (Annex III classifier + signed determination record).
2. Add missing mandatory documentation artifacts (`RISK_MANAGEMENT`, `DATA_GOVERNANCE`, `FRIA`, `QMS/AIMS`, technical dossier, instructions-for-use).
3. Build rights workflows for explanation/appeal and regulator incident reporting timelines.
4. Integrate EU AI Act into evidence-linked compliance report engine (not standalone heuristic scorer only).

## External References

- EU AI Act text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
