---
"agent-maturity-compass": minor
---

Citation corrections (experimental until expert review): OMB M-25-21, SR 26-2, EO 14110 removed, QMSR, NIST AI RMF, ISO/IEC 42001 and MITRE ATLAS labels, EU AI Act Art. 5(1)(f). An AI agent drafted every correction; each stays experimental until a named expert signs it, and `docs/program/citation-corrections.md` lists them with their sources.

- Domain rubrics, the domain registry and the module map cite OMB M-25-21 instead of the rescinded M-24-10, and Federal Reserve SR 26-2 (17 April 2026) instead of the superseded SR 11-7. The wealth rubric's model-risk question (FIN-1) now asks about the traditional models the agent calls under SR 26-2, with generative or agentic parts governed separately, because SR 26-2 excludes generative and agentic AI. FIN-2 and FIN-3 cite SR 26-2 section V. GOV-2 no longer cites EU AI Act Art. 68.
- The health rubric's HC-1 cites 21 CFR §820.10 (QMSR) and ISO 13485:2016 clause 7.3 instead of the removed 21 CFR 820.30.
- `amc compliance risk-classify --emotion-recognition` (and `classifyEuAiActRisk({ emotionRecognition: true })`) now returns `UNACCEPTABLE` with `Art. 5(1)(f)`, not `LIMITED` with `Art. 50(3)`: inferring emotions in the workplace or in education is prohibited unless it is for medical or safety reasons. The flag's help text says so.
- MITRE ATLAS coverage uses the official technique ids: prompt injection is `AML.T0051` (was `AML.T0048`, which is External Harms), LLM jailbreak `AML.T0054` (was `AML.T0051`), and LLM data leakage `AML.T0057` (was `AML.T0054`). The built-in ATLAS compliance mapping descriptions use the same ids.
- The industry-pack audit labels NIST AI RMF GOVERN 1.1 with its official title (legal and regulatory requirements involving AI are understood, managed, and documented); TECH-CI-9 is reworded to match.
- Future-of-work, circular-economy and digital-citizens-rights questions WLT-FW-1, WLT-FW-11, WLT-FW-12, WLT-CE-6 and GOV-DCR-9 cite 29 CFR 1607.4(D), 820 ILCS 42/5 and 42/15, 42 U.S.C. 12112(b)(5)-(7) and 29 CFR 1630.11, SR 26-2, and EU AI Act Art. 5(1)(c) instead of the withdrawn EEOC AI guidance, SR 11-7 and Art. 5(1)(d). Six EU AI Act classification strings are updated. Question weights are unchanged.
- The pack catalogue gains records for OMB M-25-21, SR 26-2, 29 CFR 1607.4, 29 CFR 1630.11, 42 U.S.C. 12112 and the Commission guidelines on prohibited AI practices, and marks OMB M-24-10, SR 11-7, EO 14110, EO 13985 and the EEOC AI technical assistance repealed or withdrawn.
- The diagnostic question on multi-jurisdiction AI regulation no longer tells users to assess against the revoked EO 14110.

Contributor tooling: `npm run check:citations` now fails on any superseded-as-live citation (CIT001 is zero tolerance), and `scripts/citations-baseline.json` is lowered to the remaining counts.

freeze-exception: P0-24 — citation corrections to existing station-pack questions, which the freeze allows; no question or CLI command path is added
