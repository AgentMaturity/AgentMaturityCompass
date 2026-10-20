# Education overlay draft

This content is experimental, not reviewed, not legal advice. Support is `experimental`, review is `pending`, and promotion is `none`. It is an AI-drafted planning artifact. No privacy, accessibility or legal expert has signed it, and no institution has supplied production evidence.

## Scope and source inventory

The P1-13 domain is `education.schools-skills`: Education · schools, universities, skills and accessibility. Its five pack IDs are `k12-pm3`, `higher-education`, `skills-training`, `specialized-education` and `differently-abled`.

The preserved native inventory at int0462326f3590c78697675f007b0afca78b455ef8 recorded 87 pack questions (19, 19, 15, 18, 16) and 16 handwritten deep questions: 103 unique IDs. Root confirmed those exact IDs through the native runtime on Node v22.23.3 with clean source before and after; the documentation subagent did not run that command. `dispositions.json.sourceInventory.runtimeConfirmation` records the evidence path, SHA-256, source pin and capture time. Static inspection also finds no Education question generator; generators for other stations are outside this inventory. `dispositions.json` records every actual ID once, eight source hashes and the spec drift. The spec's 83-pack total is historical: Higher Education has 19 rather than 18, and Specialized Education has 18 rather than 15. Every explicitly mapped spec target exists. The eight inventory source files remain byte-identical on integrated int52ad3c66e9b122fc8044851c334057c672e52834. This source-identity recheck is separate from that historical runtime measurement.

Keep the actual pack labels. `skills-training` is “Skills & Vocational Training” while its website label is “Skills & Vocational”; `differently-abled` is “Differently Abled Education” while its website label is “Differently Abled”. The strategy aliases K-12, Skills and Specialized do not create additional domains or questions.

## Four signature proposals

| Control | Scope of the proposed observation | Missing-evidence boundary |
| --- | --- | --- |
| `L1-EDU-01` | An exact teacher approval bound to learner, assessment and grade before a synthetic final-grade write. | An unavailable approval store denies the write and yields not evaluated. Prompt text is not approval. |
| `L1-EDU-02` | For an EU education context, inspect the actual capability invoked; emotion inference is refused under the Art. 5(1)(f) candidate mapping. | An absent capability class refuses the call and yields not evaluated. A lecture summary has no affect feature. |
| `L1-EDU-03` | A narrow boundary wrapper around P2-27's two-institution record fixture. | That dependency is absent on this base. It must give not evaluated, without implementing a parallel FERPA authorization system. |
| `L1-EDU-04` | Automatable WCAG 2.1 Level A/AA checks on one synthetic HTML lesson before publication. | An unavailable checker yields not evaluated. A tool result does not establish the manual remainder. |

Historical fixture execution is recorded in the preserved `qualification/2026-10-19-P3-15/receipt.json` at product source `a625ee5cae3cde551701f7c9cfed33a4f142480f`; that receipt and its raw artifacts retain their original pins. The integrated candidate has changed profile composition and needs separate current-source qualification. Its new receipt must identify the actual checker library/version, input bytes, tool/capability or grade/export side effects, subjects, catalog/plan/policy/control binding and five negative classes: stale, replayed, contradictory, cross-tenant and empty. No current execution total or pass is inferred here. A simulator observation is synthetic, not a school's outcome. Production without required evidence or integration stays `not_evaluated` with enforcement `none`.

## Unsupported behaviour

The mapping limits in `dispositions.json` are part of every disposition. A teacher-confirmation fixture does not establish lifecycle risk management, dataset governance or cohort-level accuracy. An export wrapper does not decide a lawful exception, establish a school-official contract, prove de-identification or create an IDEA access record. The emotion gate does not test every Art. 5 prohibition or establish a medical/safety exception.

Automated WCAG 2.1 HTML checks do not establish WCAG 2.2 added criteria or accessible authentication (`EDU-DA-9`, `EDU-DA-14`), ETSI assistive-technology interoperability (`EDU-DA-5`), Revised Section 508 software/electronic-content scope and conformance reporting (`EDU-SE-10`, `EDU-DA-12`), or an accessibility statement and feedback workflow (`EDU-SE-17`). Interfaces, mobile apps, generated documents and media, assistive-technology compatibility, legal applicability, entity deadlines and human usability need separate assessment.

The manual WCAG duty remains OPEN: an assigned accessibility assessor must review keyboard operation and focus sequence, meaningful reading order, accuracy of text alternatives and captions, labels and instructions in context, error recovery and any criteria the selected checker cannot decide. The assessor must record criterion, tested artifact/version, outcome, rationale, defects and remediation, with a signed review on each relevant release. No assessor or manual assessment is supplied; no manual criterion passes by default. Final criterion coverage must be agreed by that specialist.

## Dependencies and reuse

- P2-27's two-institution FERPA fixture is absent; `L1-EDU-03` must remain not evaluated until its actual integration is verified.
- P2-30's experimental, unreviewed `L1-TECH-04` COPPA-disclosure draft and `L1-TECH-01` marking draft are available after int52ad3 integration. Availability supplies neither Education-specific legal applicability nor admitted evidence or production enforcement. Separate disclosure consent does not cover all collection/use consent or renewed consent after a material change; the COPPA draft has no production consent adapter.
- P3-14's experimental, unreviewed `L1-GOV-02` FRIA activation draft is available. These Education profiles do not select it: they assert no Governance public-service domain, eligible public-service entity or `public_service_ai` use case. Do not invent those facts. A later scoped reuse would still need lawful applicability, a human-assessed Art. 27 assessment and independent evidence; the local signed drill is not production activation wiring.
- The shared optional station guide hook is available. `guide-section.md` uses it; this item adds no duplicate generator implementation. The guide check must record actual inclusion after integration.
- The existing composition ID is `education-technology` in `catalog/profiles/cross-station.json`, primary Education plus Technology. This draft does not add a second composition. P2-11 owns dated EU jurisdiction profiles; P2-28 owns profile merging.

Vendor training-off and scheduled deletion configuration need independent configuration and execution evidence. Neither a consent fixture nor a profile assertion establishes those settings.

## Synthetic profile facts

Both synthetic profiles now declare `education.schools-skills` and `technology.platforms-data`, with Education and Technology station membership. The current native compiler checks inspect `L1-TECH-03`, `L1-TECH-04` and `L1-TECH-08` for the US profile, and `L1-TECH-02`, `L1-TECH-03`, `L1-TECH-06` and `L1-TECH-07` for the EU profile. The final receipt must bind the actual plans and their catalog/runtime-policy digests; this list is not a pass or complete legal-coverage claim. Missing production evidence leaves these requirements `not_evaluated` with enforcement `none`.

`L1-TECH-01` additionally needs `publishes_synthetic_content`, which neither profile asserts; `education_generated_lesson` is not silently substituted for it. `L1-TECH-05` needs California/consequential-decision scope not declared here. Existing Technology predicate breadth, including the IoT control, is preserved: selection does not prove device-write activity or change a device allowlist. The Technology-candidate `L1-GOV-06` is `not_applicable` for these profiles, and `L1-GOV-02` is absent from their plans. These facts do not establish complete Education × Technology coverage or a Governance FRIA selection.

The native profiles are `profile.grading-assistant.json` (US K-12 fixture) and `profile.grading-assistant-eu.json` (EU K-12 fixture). They share tenant `education-fixture-tenant`, workspace `education-fixture-workspace` and agent `education-fixture-agent`; their distinct deployments are `education-grading-assistant-us-fixture` and `education-grading-assistant-eu-fixture`. Every non-null fact is asserted, not observed or reviewed. Risk classification, EU role records, Art. 6(3) records and F1 operating-profile evidence remain unknown/null. No reviewer exception is supplied.

Native profile facts do not establish record-specific institutional direct control, a legitimate educational interest, an authorized export exception or an actual teacher's approval. Those remain manual scope and operational-evidence prerequisites. No native learner-age FactName exists. `children_personal_data` describes an asserted synthetic data class, not an observed age or jurisdiction-specific consent decision. Do not invent an age predicate. The core signatures are age-independent; age-sensitive COPPA applicability and any medical/safety exception need explicit authorized evidence and human assessment.

## Instruments and source limits

`instruments.json` is planning metadata ordered US, EU, rest of world and standards. Every row is `unverified` with `reverify:true`; no primary source was read or fetched for this draft. Where an inherited local S5 URL exists, its exact entry, file hash, source index and historical retrieval claim are recorded separately. New retrieval dates, legal review and content hashes are null. Missing S5 identities retain null URLs rather than receiving a substitute citation.

FERPA, IDEA, Section 504, Title IX, CRPD, W3C WCAG 2.1/2.2 and ETSI EN 301 549 spec IDs are absent from this base's S5 register. The existing unverified ISO/IEC 40500 record names WCAG 2.2; it does not establish WCAG 2.1. The generic spec `us-ccpa` label maps to actual S5 `us-ca-cppa-admt` and existing law-data `us-ca-ccpa-admt-notice`; no duplicate clause or backdated status is proposed. Art. 5(1)(f) is the emotion-inference candidate; Art. 50(3) is not its authority. Clause-level date and status interpretation remains open to primary and legal review. Legacy catalogue identities are a different inventory from S5: `src/domains/packs/catalogueIntl.ts` labels an entry `w3c-wcag-21` but points it to a WCAG 2.2 URL. That locator does not establish WCAG 2.1 primary-text evidence. The `w3c-wcag-21` metadata separately records the proposed control's discovery locator, `https://www.w3.org/WAI/test-evaluate/`, inherited from `scripts/write-accessibility-release-evidence.mjs:143` with that file's SHA-256. Its purpose is `discovery_only`, and `readThisTask` is false. The primary `source.url`, new retrieval dates and content hash stay null. This WAI evaluation overview is not the WCAG 2.1 normative text. The proposed four controls are operator-policy fixtures; no new US law-data row or EU register row is proposed by this item. The records-boundary proposal's FERPA FAQ URL is recorded separately as a `discovery_only` locator inherited from `education-deep-04`, with its source file hash and `readThisTask:false`; the missing S5 identity and null primary-source URL remain explicit. The emotion-gate metadata uses the exact inherited S5 Article 5 locator cited by that control. The teacher-grade policy introduces no statutory approval citation.

## Promotion and human work

`promotion.yaml` tracks all ten admission criteria and makes no native admission or promotion finding. Historical checks retain their original source pins; the integrated candidate needs its own recorded validation. Mechanical results belong in the source-bound qualification receipt and do not fill human criteria or promote this draft. Source/legal review, independent sign-offs and stewardship remain unmet. D-04's catalogue licence decision remains open; the catalogue says MIT pending that decision.

D-14, through D-10's owner, must name two people: a student-privacy counsel for FERPA/COPPA and an accessibility specialist. Both placeholders are null. Distinct domain/legal/risk sign-offs, an assigned manual WCAG assessor and P1-29's education partner are also absent. A funded maintenance owner, update plan and triage commitment need a real agreement. Sid alone approves promotion after all ten criteria stand. No third-party contact or review request has been sent; the spec's request-sent acceptance remains unmet.

## A4 scope change

An overlay catalog-lock change renders as `scope_changed`, never as a fault. Where a FRIA applies, capture it before P3-23's completion gate. This is a documentation requirement; this draft changes no A4 code and asserts no completed FRIA.
