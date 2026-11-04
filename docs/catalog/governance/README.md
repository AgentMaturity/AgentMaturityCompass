# Governance station overlay draft

This is experimental, unreviewed content for P3-14. Promotion is **none — experimental, unreviewed**. It is not legal advice. No agent supplies human review, a legal decision or a production result. Local fixture outcomes are synthetic examples; a deployment without the required evidence remains `not_evaluated`, with enforcement `none`.

## Scope and canonical layout

The pack is `overlay.governance`, under `catalog/layers/l1-governance-global/`. Its six signature controls are `L1-GOV-01` (caseworker decisions), `L1-GOV-02` (FRIA before activation), `L1-GOV-03` (vendor-training canaries), `L1-GOV-04` (filing citations), `L1-GOV-05` (human explanation routing) and `L1-GOV-06` (CUI egress boundary). Control records and fixture envelopes use the implemented P1-09 layer and per-control fixture layout. This document does not claim they have passed the item's pending checks.

| Canonical domain | Wave | Current packs | Reference example |
| --- | --- | --- | --- |
| `governance.public-services` | 2 | `citizen-services`, `public-private-collaboration` | Benefits caseworker assistant |
| `governance.law-rights-democracy` | 3 | `petition-to-law`, `digital-citizens-rights`, `dance-of-democracy` | Legal drafting example; a partner must determine the deployed use |
| `governance.defense` | 3 | None | Partner-led defense analyst example |

These IDs and domain names come from `src/domains/stations.ts`. The current Public and Private Collaboration pack label maps to P1-13's Public & Private Collaboration website label. No pack, question, operating profile, jurisdiction profile or source-domain module is renamed or edited by this document work. Legal filing and CUI controls do not create a legal or defense questionnaire pack.

## Inventory and dispositions

The inventory pin is `227d1da6fa0185f00049d2a82efe55cc10108848`. Registered Governance data contains 91 pack questions: Digital Citizens & Rights 18, Dance of Democracy 20, Petition to Law 18, Citizen Services 16 and Public and Private Collaboration 19. It also contains seven hand-written deep questions and 49 generated deep questions, for 56 deep questions and **147 unique actual IDs**. The spec's 75-pack count is older by 16. Its seven hand-written deep questions still exist; the 49 generated questions also remain active and must be covered until a real source change retires them.

`dispositions.json` assigns every actual ID exactly once, without inventing questions. Its seven source hashes cover the station pack, pack builder and registry, the deep file, deep builder and registry, and questionnaire labelling. The spec ID `GOV-CS-4` is absent: the current question is `GOV-CS-4-v2`. No disposition is invented for the retired key. All other named spec-target IDs are present.

Mapped tests remain narrow. The actual oversight question includes competent named humans and the ability to disregard, override, reverse or stop output; one caseworker decision does not prove all of that. `GOV-CS-15` asks for notice of high-risk AI use. `gov-deep-51` also asks for deployer-controlled six-month log retention; a case decision and notice does not prove retention. The FRIA fixture can check declared elements, referenced reviewer evidence, notification and dates, but a human must assess its substance and lawful scope.

The canary fixture does not establish the full vendor contract or the portability, knowledge-transfer, licensing, pricing and exit-plan aspects of `GOV-PPC-16`. A route to a human does not establish the explanation's content or legal sufficiency. `GOV-PPC-14` stays document review. Other questions, including the active templates and the additional political-content and biometric questions, stay self-reported questionnaires capped at L1 unless explicitly mapped. No questionnaire level becomes an evidence-backed deployment result.

## Sources and market order

`instruments.json` orders candidate metadata US, EU, rest of world, then standards. Every entry is `unverified` with `reverify: true`. Inherited S5 locators name existing repository metadata; they do not establish that a source was read here. Retrieval dates, hashes, effective dates, due dates and legal-review fields remain null. No primary text was fetched or hashed in this item.

The OMB candidates use the actual S5 IDs for M-25-21, M-25-22 and M-26-04. The latter's inherited title concerns public trust and unbiased AI principles; the spec's procurement-document assertions still require comparison with the text. FedRAMP 20x, California AB 302, the New York LOADinG Act, ABA Opinion 512, the California court rule, CMMC, SP 800-171 and DFARS lack matching S5 entries on this base. These gaps are recorded, not replaced with different law. ABA's blocked-source caveat stays open. The CMMC Phase II suspension date is an unverified spec allegation; this draft treats no Phase II duty as binding. The CUI fixture establishes neither a phase schedule nor a contractual obligation.

The AI Act, GDPR and DSA references reuse existing S5 instrument identities as candidate locators. Dated EU profiles and Annex III finalisation remain outside this item. UK and India candidates remain documentation-only dependencies for P3-10 and P3-09. Active NIST-linked deep questions are recorded without claiming that the six signature fixtures exercise their complete authentication or control-family scope.

## Synthetic profiles and dependencies

The three native DeploymentProfile files are `profile.benefits-caseworker.json`, `profile.legal-drafting.json` and `profile.defense-analyst.json`. Every fact is asserted, with no reviewer. Unknown risk classification and unknown public/legal data classes stay null; no EU role record, Article 6(3) record or operating-profile artifact is invented. The profiles use a synthetic tenant, workspace, agent and deployment IDs. Their broad jurisdiction and entity scopes select example controls; they do not identify a real agency or determine a legal obligation.

Public-sector AI reuses the existing `public-sector-ai` composition in `catalog/profiles/cross-station.json`. The defense JSON is a synthetic scenario, not a new named composition. No operating-profile or profile-merging behavior is added.

P2-30's experimental `L1-TECH-01` marking draft, EU register and optional guide-section hook landed on int `9d739678f793100b5426c62e02a0a16b82afbf20` and are merged here. The current integration checks must measure guide inclusion and catalog loading; their presence supplies no evaluated reuse or production result. Governance-only domain facts in these example profiles do not establish complete Technology scope. The P3-15 WCAG output check is also pending. The synthetic-media questions include human-facing disclosure, editorial responsibility or first-interaction notices that machine-readable marking does not establish. The accessibility questions distinguish WCAG 2.1 AA from federal Section 508 WCAG 2.0 A/AA and other public-sector duties; a generic output check is not an equivalence finding. `GOV-DCR-5` points to existing Layer 0 `L0-TRN-01`, with its own scoped evidence still required.

`guide-section.md` is the owned fragment for the shared guide generator. No duplicate hook or generator edit is part of this draft. Capabilities elsewhere in the repository do not establish that these new overlay controls intercept live agency decisions, activation, filings or egress.

## A4 Adapt and FRIA

A catalog-lock change caused by this overlay is intended to render in A4 Adapt as `scope_changed`, never as a fault. Where a FRIA applies, it must be captured before the completion gate under P3-23. This is the required integration note, not an A4 implementation or execution claim. No A4 or P3-23 source is edited here.

## Promotion and human work

`promotion.yaml` is draft tracking outside the catalog loader, not a signed review record or an admission-check result. It lists all ten criteria. Mechanical criteria remain `not_evaluated` until the current item's checks supply evidence. Criteria 2, 9 and 10 remain unmet: primary-source/legal review, independent sign-offs, and partner/stewardship evidence are absent. A fixture pass cannot fill a human criterion or promote a control.

D-14 must name three experts through D-10's owner: public-sector AI governance, legal ethics and defense compliance. Their names remain null. P1-29 must supply a separate partner for public services, law/rights/democracy and defense. Domain lead, legal reviewer and risk owner sign-offs must come from distinct authorized people; no agent creates them. No review request or third-party contact is sent without supplied names and authorization.

The stewardship owner, funding and triage commitment also remain open. MIT is inherited catalog metadata pending D-04; this draft makes no new licence decision. Sid retains the promotion decision, and P1-33 must evaluate all ten admission criteria before any later promotion.

## Unsupported behaviour

This draft supplies no live agency, court, law-firm or defense-contractor evaluation. It does not finalize benefits, file a brief, notify an authority, answer a legal request, train a vendor model or send CUI to a real endpoint. Local case stores, citation fixtures, routing logs and egress captures are synthetic observations. Missing evidence never passes; a local refusal or not-evaluated result does not establish production enforcement.

The fixtures cannot assess FRIA quality, legal applicability, source currency, explanation quality, a complete procurement contract, retention over six months, accessibility across all channels, real incident reporting or every applicable CUI safeguard. A signed local fixture record is not external trust or a human assessment. The final receipt must preserve the actual controls/cases/expected/observed table, mutations, check exits and full-suite totals at the final source, including unresolved failures. No result is claimed from this document's presence.

The citation-corpus acceptance criterion remains **open**: the local registry contains ten synthetic fixture IDs and an unknown eleventh identifier, not the spec's ten real cases from authoritative sources. A human-curated corpus of real cases with official-source provenance is still required. Current fixture results cannot satisfy that requirement.
