# Environment station overlay draft

This overlay is experimental and unreviewed: experimental, not reviewed, not legal advice. Promotion is none. It adds six draft signature controls under `overlay.environment`, not a utility, water-system, food-producer or manufacturer result. Missing evidence remains `not_evaluated`; empty production evidence has enforcement `none`. No primary legal/regulatory source was retrieved, legal assessment performed, human reviewer named or third party contacted in this task.

## Scope and inventory

The two P1-13 domains are `environment.energy-utilities-water` (wave 3: Ubiquity to Utility and Sip to Sanitation) and `environment.food-textiles-manufacturing` (wave 4: Farm to Fork, Weave to Wear, Material to Machines and Source to Sustenance). The parent coordinator's Node 22 runtime inventory confirms 104 pack questions plus 17 literal handwritten deep questions: 121 unique actual IDs. `dispositions.json` binds its result digest and eight actual source hashes; the docs author read those bytes and did not run the inventory probe. Runtime inventory records identities, not regulatory outcomes.

The spec's 97 pack questions are historical. Actual pack counts are 18/16/16/18/18/18 for Farm to Fork/Weave to Wear/Material to Machines/Source to Sustenance/Ubiquity to Utility/Sip to Sanitation. All named spec targets exist; labels match. Actual `ENV-MM-4-v2` and `ENV-UU-9-v2` are retained without invented unversioned rows. All 121 questions have exactly one disposition; 86 remain individual self-reported questionnaires capped at L1. The complete per-question text and mapping limits are in `dispositions.json`.

## Six signatures and their boundaries

| Control | Draft purpose | Limit |
| --- | --- | --- |
| L1-ENV-01 | Proposal-only plant setpoint boundary; direct or injected agent writes refused | Operator-policy simulator, not a universal NERC prohibition, observed plant authority or a complete human-oversight assessment |
| L1-ENV-02 | Synthetic model-outage safe-hold, alert and manual-fallback drill | Configured example, not a human hazard review or wired production safe-state/kill-switch |
| L1-ENV-03 | CEA packet wrapper for an asserted India generator scenario | Unknown capacity stays unresolved; integrated result is not evaluated until actual P3-09/F4 clocks, legal scope and separate orders are established |
| L1-ENV-04 | P2-27 recall wrapper | Dependency missing on the CCA base means not evaluated; no parallel recall conversion or completed closure claim |
| L1-ENV-05 | Freshness, completeness and configured-limit boundary before lot release | Local sensor configuration does not validate a HACCP plan, CCP selection or corrective-action sign-off |
| L1-ENV-06 | Same-lot due-diligence reference binding | No proof of commodity/legal scope, geolocation, deforestation/legality, primary/downstream role or five-year records |

Native admission/evaluation and local protocol observations must be reported separately. Intended synthetic local allow/pass outcomes are not results until executed and never establish runtime enforcement. An admitted questionnaire can have evaluator enforcement-state `observed` while its claimKind remains `self_reported`; this does not upgrade trust or establish interception. All production claims require actual bound evidence and available enforcement.

The spec's partial mappings keep their unmet remainder. Setpoint refusal does not establish lifetime logging, competent named oversight, automation-bias training or acceptance monitoring. Recall closure does not establish authority notification or the FDA-request sortable KDE/CTE spreadsheet within 24 hours: that is a records-production clock, not a recall deadline. A same-lot reference does not establish every role-specific EUDR duty. NIS2 and AI Act Article 73 reporting drills remain explicitly pending outside the six local signatures. Existing F4 clock IDs are arithmetic references, not evidence of notice delivery; NIS2 final reporting uses one calendar month from incident notification, not 30 days from awareness. CRA reuse is partial and pending integration.

## Asserted fixture profiles

All three native profiles use tenant `environment-fixture-tenant`, workspace `environment-fixture-workspace` and agent `environment-fixture-agent`. Supplied facts are asserted examples with no reviewer. Risk class, EU role record, Article 63 record and operating profile remain null; there are no reviewer exceptions.

- `profile.grid-operations.json`: deployment `environment-grid-operations-us-fixture`; US BES/water entity examples; setpoint and outage cases.
- `profile.grid-operations-in.json`: deployment `environment-grid-operations-in-fixture`; India power-generator example; setpoint, outage and reporting cases.
- `profile.food-lot-release.json`: deployment `environment-food-lot-release-fixture`; US/EU-facing food-facility example; recall, release and lot-reference cases.

Profiles declare only the relevant Environment domain and station. The Technology taxonomy exists, but these profile facts do not declare a Technology domain, and CCA does not include the required Technology overlay. They do not claim complete Environment×Technology coverage. The existing `grid-utility-operations`, `sustainable-finance` and `ports-and-freight` composition IDs express intent; complete Technology, Wealth and Mobility facts/controls remain separate integration work. P2-28's native merger exists on CCA and is not reimplemented here.

Native FactNames have no numeric capacity, actual asset class, write access, hazard-reviewed safe state or regulatory separate-order date. These remain explicit manual scope gaps rather than invented facts or a surrogate risk class. A 120 MW generator, safe-hold value, temperature bound or freshness window in local fixtures is synthetic configuration, never a default legal threshold or a real plant authority. Missing safe-state configuration refuses deployment/returns not evaluated. The spec's six separately commenced CEA provisions remain unverified and unresolved until actual orders and applicable primary text are assessed.

## Source candidates and base-relative dependencies

`instruments.json` has 21 market-ordered candidates (US, EU, RoW, Standard), all `unverified` with `reverify:true`, null effective/compliance/retrieval dates, content hashes and legal reviews. Only five exact S5 IDs exist on this clone's integration base: `us-nerc-cip`, `us-sdwa-1433`, `eu-nis2`, `eu-eudr`, `eu-espr`; 16 are absent. Some absent IDs occur in the legacy questionnaire catalogue, which is not S5. Inherited official EPA and EUDR locators match the control citations; inherited FDA/NIST discovery locators are separately labelled with source-file hashes. Locators are discovery provenance, not fresh primary reads. No central law-as-data or S5 row is forked. CEA dates/thresholds, NERC/CISA/FSMA interpretations and standard editions require re-verification; licensed IEC/ISO text is not copied.

Availability statements here are relative to integration `ccaabe07fdddfad442bfd1a738026862c67f7985`, not assertions about the latest global integration line. Before final qualification, merge the coordinator's actual current int and recheck every dependency:

- P2-27 recall fixture/adapter, P3-09 registered CEA clocks and separate orders, and P2-26 production runtime/kill-switch remain pending on this base. The producer catalogue separately marks `amc.providerOutage.safeState` planned by P1-76 and `amc.killSwitch` planned by P2-26.
- P2-30 CRA/NIS2 controls, Technology marking, its EU register additions and optional guide-fragment hook are not integrated into CCA. Their later availability requires actual merge/compile evidence; partial reporting controls do not establish every notice stage.
- P2-11 dated EU profiles, P3-13's Wealth side, and P3-17/P2-27's freight/ship-sulphur parts remain composition dependencies. Governance/FRIA applicability and human substance are not established by a sibling overlay's availability.

`guide-section.md` is an input for the existing P2-30 hook after integration. The generated Environment guide and generator are untouched here; inclusion is pending, with no duplicate hook.

## Unsupported behaviour

No live plant write interception, operational outage response, regulatory report delivery, real recall, FDA export drill, genuine human hazard review or full cross-station deployment is established. Missing source authority, capacity, scope, genealogy, feed or statement registry cannot become a pass. Intended local positives and native self-reports are not real institutional results. No current validation, fixture total, mutation kill, full-suite result or admission status is claimed in this document; root records actual executions separately.

`promotion.yaml` retains all ten P1-33 criteria. Mechanical/native criteria are not evaluated here; unread citations and missing legal review, independent human sign-offs, partners and funded stewardship remain unmet. D-14/D-10 must name an OT/grid cybersecurity expert and a food-safety/due-diligence expert. P1-29 needs a utility/water partner and a separate food/manufacturing partner. Expert names, recruitment, legal/domain/risk signers, human safe-state assessor, funding/maintenance ownership, and Sid's promotion decision remain open; no contact was sent. The spec's CC BY 4.0 statement differs from inherited catalog MIT: D-04 must resolve the licence; this draft makes no new licence determination.

A4 catalog-lock changes render as `scope_changed`, never a fault. Where a FRIA applies, it is captured before P3-23's completion gate; this draft changes no A4 implementation.
