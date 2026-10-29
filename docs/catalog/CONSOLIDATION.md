# Catalog consolidation

Status: experimental (P1-53). Record format: [CONTROL_RECORD.md](CONTROL_RECORD.md). Removals: P2-29.

Before P1-53, eight systems each produced their own pack, mapping or score. Domain rubrics reported certification
readiness from self-scores, the cross-framework map called a control "covered" when a module was switched on, and two
crosswalk formats disagreed. One source now gives every regulated status: catalog controls, evaluated by the
compliance engine and the catalog evaluator (P1-11, `src/catalog/evidence/`). The other systems either moved their
content into the catalog, attach to it, or are deprecated with a named replacement. No command path or public export
is removed here; P2-29 removes deprecated exports after one minor release.

Every pairing in this document between a rubric question, a compliance mapping, a policy pack or a binder control and
a catalog control is AI-proposed and pending review (P1-34). A pairing is information: it changes no result, and
passing one framework's control never passes its crosswalk targets.

## The eight systems

| System | Path | Before P1-53 | After P1-53 | Content now lives in | Status | Removal owner |
| --- | --- | --- | --- | --- | --- | --- |
| Domain rubrics | `src/score/domainPacks.ts` | 7 station rubrics with hard-coded questions; certification readiness had already been removed on 2026-10-07 (e631d8991, c7b8c9add) | Questions read from the catalog, cached per process; `scoreDomainPack` returns `claimKind: "self_reported"` and never a readiness flag | `catalog/questionnaires/domain-rubrics.yaml` | `scoreDomainPack` deprecated; `getDomainPackQuestions` and `listDomainPacks` supported | P2-29 |
| Deep questions | `src/domains/deepIndustryPacks.ts` | Hand-written questions plus template-generated health, wealth and governance questions; no scorer | Template-generated exports carry `@deprecated`; only the hand-written questions (P1-42, `src/domains/deep/*.ts`) remain supported | `src/domains/deep/*.ts` | `DEEP_HEALTHCARE_QUESTIONS`, `DEEP_FINANCE_QUESTIONS`, `DEEP_GOVERNMENT_QUESTIONS` deprecated | P2-29 |
| Cross-framework map | `src/score/crossFrameworkMapping.ts` | A control counted as covered when a listed question passed or a listed module was active | Every control is `not_evaluated`, `coveragePercent` is 0, `targetMet` is false, and the report names its replacement; `listFrameworkCrosswalks` lists catalog crosswalks as information | Catalog `crosswalk[]` entries | `generateFrameworkReport` deprecated | P2-29 |
| Crosswalk receipts | `src/compliance/controlCrosswalk.ts` | Receipt rows came only from a caller-supplied mapping table | `crosswalkRowsFromCatalog(catalog, framework)` builds receipt input from catalog crosswalks | Catalog `crosswalk[]` entries | Supported | None |
| Compliance mappings | `src/compliance/builtInMappings.ts` | Evaluated by the compliance engine with no link to catalog controls | Each mapping has `catalogControls` (default `[]`); built-in pairings are listed below | `src/compliance/builtInMappings.ts` | Supported | None |
| Policy packs | `src/policyPacks/builtInPacks.ts` | Signed configs per archetype and risk tier with no link to catalog parameters | `catalog/bindings/policy-packs.yaml` maps pack settings to catalog binding parameters | `src/policyPacks/builtInPacks.ts` (unchanged) | Supported | None |
| Audit binder | `src/audit/auditMapBuiltin.ts` | Signed, deterministic control families | Unchanged; the generated index below lists the catalog controls that crosswalk to each binder control | `src/audit/auditMapBuiltin.ts` (unchanged) | Supported as an output format | None |
| Domain proof | `src/domainProof/toyGovernanceRules.ts` | One clause-hashed toy manifest | Unchanged; its pattern is generalized by the catalog record format (P1-09) | `src/domainProof/` (unchanged) | Toy only | None |

## Domain rubric questionnaire

`catalog/questionnaires/domain-rubrics.yaml` holds the 61 rubric questions, copied by script from the code they
replaced (`qualification/2026-10-29-P1-53/copy-domain-rubrics.mjs`) with ids, order, text, descriptors and weights
unchanged. Each item has `claimKind: self_reported`: an answer is evidence from producer `amc.questionnaire` and supports
L1 at most. `legacyRef` keeps the old citation text verbatim; it is never a catalog citation, and P0-24 corrects the
superseded instruments it contains. `mapsTo` is empty for every item: no rubric question maps obviously enough to one
Layer 0 control to propose a pairing, so there are no pending pairings to review.

`getDomainPackQuestions(station)` returns the same `DomainQuestion` shape and order as before (`regulatoryRef` is
`legacyRef.text`). It loads the catalog once per process and throws when the questionnaire is missing or invalid.

Questionnaires and the policy-pack binding map are read by the loader and checked by `validateCatalog`, but they are
outside every catalog digest: no compiled plan reads them, so they never change the catalog a plan pins. If P1-10
starts reading the binding map, it must enter the digest with a changelog entry (P1-34).

## Cross-framework map

The 108 legacy controls are not imported into the catalog; their labels are known to be wrong (gap G9).
`generateFrameworkReport` keeps its signature and output fields for compatibility and ignores its score input.
`listFrameworkCrosswalks(framework)` takes a catalog framework term (`atlas`, `owasp-asi-2026` or
`amc-audit-map-v1`) and returns each crosswalking control with `status: "not_evaluated"`.

## Compliance mapping pairings (AI-proposed, pending review)

`catalogControls` names the catalog controls a mapping corresponds to. It does not change how the engine evaluates a
mapping: mapping contracts keep their 30-day freshness and no invalidation triggers until a reviewer confirms these
pairings, because an unreviewed pairing must not change a verdict. `crosswalkRowsFromCatalog` reads them to give a
catalog crosswalk row the evidence requirements of its linked mappings; a row with no linked mapping fails closed.

| Mapping | Catalog controls |
| --- | --- |
| `atlas_prompt_injection` | L0-ADV-01, L0-ADV-02 |
| `atlas_llm_jailbreak` | L0-ADV-01 |
| `atlas_cost_harvesting` | L0-TOOL-02 |
| `euai_art12_record_keeping` | L0-LOG-01, L0-LOG-02 |
| `euai_art14_human_oversight` | L0-OVS-01, L0-OVS-02 |
| `euai_art86_right_to_explanation` | L0-EXP-01 |
| `gdpr_art5_data_minimisation` | L0-DAT-01 |
| `iso_access_control` | L0-IDN-01, L0-IDN-02 |
| `iso_logging_monitoring` | L0-LOG-01 |
| `iso_incident_management` | L0-MON-02 |
| `iso_supplier_security` | L0-DAT-03 |
| `sox_segregation_of_duties` | L0-OVS-03 |
| `sox_itgc_change_management` | L0-CHG-01 |
| `sox_audit_trail` | L0-LOG-01, L0-LOG-02 |
| `fedramp_identification_authentication` | L0-IDN-01 |
| `fedramp_audit_accountability` | L0-LOG-01, L0-LOG-02 |
| `fedramp_config_management` | L0-CHG-01 |
| `fedramp_incident_response` | L0-MON-02 |
| `dora_art8_identification` | L0-INV-01, L0-INV-02 |
| `dora_art11_response_recovery` | L0-MON-04 |
| `dora_art28_third_party_risk` | L0-DAT-03, L0-MON-05 |
| `nis2_art21_2d_supply_chain` | L0-INV-02 |
| `nis2_art23_reporting` | L0-MON-02 |
| `tx_traiga_consumer_disclosure` | L0-TRN-01 |
| `tx_traiga_unlawful_discrimination` | L0-FAI-01, L0-FAI-02 |
| `kr_ai_act_art31_transparency` | L0-TRN-03 |
| `nist600_information_integrity` | L0-TRN-03 |
| `co_admt_human_review` | L0-EXP-03 |
| `ca_ccpa_admt_human_appeal` | L0-EXP-03 |

Every other built-in mapping has `catalogControls: []`. Compliance maps signed before P1-53 parse unchanged, with
`catalogControls` defaulting to `[]`.

## Policy-pack binding map (AI-proposed, pending review)

`catalog/bindings/policy-packs.yaml` lists the 14 built-in packs and maps their approval classes and tool allowlist to
the compiler's parameters (`approvals.<ACTION_CLASS>.requiredApprovals`, `requireDistinctUsers`, `rolesAllowed`,
`ttlMinutes`, and `toolPipeline.visibleTools`). Budgets, `denyByDefault` and the action policy have no catalog
parameter yet, so they map to `null` with a reason. `validatePolicyPackBindings` checks that every setting path exists
in every pack and that every parameter is one the compiler enforces and accepts each pack's value. Nothing applies the
map yet; P1-10 owns using a pack as the base runtime policy for an archetype and risk tier before applying stricter
catalog parameters.

## Audit binder crosswalk index

Generated from the 36 binder controls and the catalog controls whose crosswalk names them (`amc-audit-map-v1`). Binder
code is unchanged. Regenerate with `node scripts/gen-consolidation-index.mjs` after a build.

<!-- binder-index:begin (node scripts/gen-consolidation-index.mjs) -->
| Binder control | Catalog controls that crosswalk to it |
| --- | --- |
| ACCESS_CONTROL.SSO_SCIM | none |
| ACCESS_CONTROL.WORKSPACE_MEMBERSHIP | none |
| ACCESS_CONTROL.LEASE_SCOPING | L0-IDN-01, L0-IDN-02, L0-IDN-03, L0-IDN-04 |
| ACCESS_CONTROL.APPROVALS | L0-OVS-01, L0-OVS-02, L0-OVS-03, L1-TECH-04 |
| CHANGE_MANAGEMENT.POLICY_SIGNING | L0-CHG-01, L0-INV-01 |
| CHANGE_MANAGEMENT.APPROVAL_GATES | none |
| CHANGE_MANAGEMENT.TRANSFORM_PLANS | none |
| CHANGE_MANAGEMENT.RELEASE_MANIFESTS | L0-CHG-01 |
| LOGGING_MONITORING.TRANSPARENCY_SEAL | L1-TECH-01 |
| LOGGING_MONITORING.MERKLE_ROOT | L0-LOG-02 |
| LOGGING_MONITORING.LEDGER_CHAIN | L0-LOG-01, L0-LOG-02 |
| LOGGING_MONITORING.SSE_ACTIVITY | none |
| SECURE_CONFIGURATION.OPS_POLICY | none |
| SECURE_CONFIGURATION.TRUST_CONFIG | none |
| SECURE_CONFIGURATION.TOOLS_POLICY | L0-TOOL-01, L1-TECH-03 |
| SECURE_CONFIGURATION.BUDGETS_POLICY | L0-TOOL-02 |
| SUPPLY_CHAIN_INTEGRITY.PLUGINS | none |
| SUPPLY_CHAIN_INTEGRITY.RELEASES | L0-INV-02 |
| SUPPLY_CHAIN_INTEGRITY.BACKUPS | none |
| SUPPLY_CHAIN_INTEGRITY.REGISTRY_ALLOWLIST | none |
| INCIDENT_RESPONSE_PREPAREDNESS.ASSURANCE_RUNS | L0-CHG-02 |
| INCIDENT_RESPONSE_PREPAREDNESS.ADVISORIES | L1-TECH-02, L1-TECH-07 |
| INCIDENT_RESPONSE_PREPAREDNESS.FREEZE_CONTROLS | L0-MON-01, L0-MON-03 |
| INCIDENT_RESPONSE_PREPAREDNESS.RETENTION | L0-LOG-03 |
| RISK_ASSURANCE_AND_TESTING.POLICY | L1-TECH-05, L1-TECH-06, L1-TECH-08 |
| RISK_ASSURANCE_AND_TESTING.CERTIFICATE | none |
| RISK_ASSURANCE_AND_TESTING.SCORE_THRESHOLD | none |
| RISK_ASSURANCE_AND_TESTING.BREACH_HANDLING | none |
| DATA_PROTECTION_AND_PRIVACY.REDACTION | L0-DAT-01, L0-DAT-02 |
| DATA_PROTECTION_AND_PRIVACY.TRUTHGUARD | none |
| DATA_PROTECTION_AND_PRIVACY.NO_SECRET_LEAKS | L0-DAT-02 |
| DATA_PROTECTION_AND_PRIVACY.ENCRYPTED_STORAGE | none |
| MODEL_TOOL_GOVERNANCE.BRIDGE_CONFIG | none |
| MODEL_TOOL_GOVERNANCE.ADAPTER_ALLOWLIST | none |
| MODEL_TOOL_GOVERNANCE.TOOL_BOUNDARY | L0-TOOL-01, L0-TOOL-04 |
| MODEL_TOOL_GOVERNANCE.HIGH_RISK_APPROVALS | L0-OVS-01 |
<!-- binder-index:end -->

## Left for P2-29

- Remove `scoreDomainPack`, `generateFrameworkReport` and the three template-generated deep question exports after
  one minor release. No CLI command calls `scoreDomainPack` or `generateFrameworkReport` today.
- Retire the path-presence control-surface scorers (`scripts/no-fabrication-allowlist.json`, owned by P0-15).
