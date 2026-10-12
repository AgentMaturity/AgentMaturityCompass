# Layer 0 review packet: Inventory and classification

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-INV-01 · Agent registry entry

- Statement: Every running agent has a signed registry entry naming its owner, purpose, stations, deployment and version, and an agent without a verifying entry cannot start a session.
- Risk rationale: An agent nobody registered has no accountable owner, scope or version, so its effects cannot be attributed, examined or recalled.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. The agent's agent.config.yaml carries an auditor signature; a session whose agent entry is missing or does not verify is refused before its first tool call.
- Evidence producers: `amc.signedConfig.agent` (available). Levels: L2, L3.
- Tests: L0-INV-01-T1 config (1 attempt): A signed entry verifies; an unsigned, edited or foreign-signed entry does not. Session refusal is not built yet (proposed follow-up P1-70).
- Executed test: yes (inventory.test.ts). Partial. The signature over agent.config.yaml is checked; nothing refuses a session for an unregistered or unsigned agent (P1-70), and the entry has no owner, stations or version fields.
- Crosswalk: amc-audit-map-v1 CHANGE_MANAGEMENT.POLICY_SIGNING (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-INV-02 · AI bill of materials

- Statement: Each deployment has a CycloneDX AI bill of materials with the digests of its models, prompts, tools, datasets and policies, including the CERT-In AIBOM fields.
- Risk rationale: Without a component list and digests, nobody can tell which model, prompt or tool produced an effect or whether a vulnerable component is in use.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Produce and sign the deployment's AIBOM at every release. Owner: senior_manager; cadence: every deployment release). Each deployment release signs an AIBOM that lists every model, prompt, tool, dataset and policy with its digest.
- Evidence producers: `amc.aibom.attestation` (planned, P1-27). Levels: L2.
- Tests: L0-INV-02-T1 config (1 attempt): The AIBOM verifies and lists a digest for every model, prompt, tool, dataset and policy in the deployment.
- Executed test: no. Waits for P1-27. Today AMC writes an SBOM of npm dependencies only.
- Crosswalk: amc-audit-map-v1 SUPPLY_CHAIN_INTEGRITY.RELEASES (partial).

Citations:

- `us-cisa-sbom-2026`: CISA SBOM Minimum Elements v2.1 (2026), Minimum elements (component name and version, supplier, component hash value and algorithm) (voluntary-standard; register entry `us-cisa-sbom-2026`). https://www.cisa.gov/sites/default/files/2026-07/2026_cisa_sbom_minimum_elements_508c.pdf. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry us-cisa-sbom-2026 records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: AI-specific fields are deferred to the G7 SBOM for AI minimum elements. The strategy's CERT-In AIBOM fields have no register entry or allowed host yet.

## L0-INV-03 · Risk tier record

- Statement: Every agent has a signed risk-tier record with its rationale, and an agent without one is compiled at the highest tier.
- Risk rationale: A missing or unsupported risk tier lets a high-impact agent run under controls meant for a low-impact one.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: manual duty (Sign a risk-tier record with its rationale for each agent and renew it when the use case changes. Owner: senior_manager; cadence: at onboarding and on every use-case change). The owner signs a risk-tier record per agent; the compiler reads it as a fact and treats a missing record as the highest tier.
- Evidence producers: `amc.profile.riskTier` (planned, P1-15). Levels: L2.
- Tests: L0-INV-03-T1 config (1 attempt): The record verifies and names a tier and rationale; without one the compiled plan uses the highest tier. Today a missing riskClass leaves dependent controls unresolved instead.
- Executed test: no. Waits for P1-15. riskClass is a profile fact; a missing one leaves dependent controls unresolved rather than compiling at the highest tier.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-6-2`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 6(2) and Annex III (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: Annex III lists the high-risk use areas; Chapter III Sections 1 to 3 apply to Annex III systems from 2027-12-02 (keyDate annexIIIHighRisk).

## L0-INV-04 · EU role and Art. 6(3) record

- Statement: Where an EU overlay applies, the provider or deployer role and any Art. 6(3) exemption exist as signed artifacts, and without them EU controls are not evaluated.
- Risk rationale: EU duties differ by role and by whether the Art. 6(3) exemption applies; a flag nobody signed lets an operator pick the lighter set.
- Applicability: `{fact: jurisdictions, includesAny: [EU]}`. Applies only where the profile's jurisdictions include the EU.
- Binding: manual duty (Sign the EU role record and any Art. 6(3) assessment, and reference them from the deployment profile. Owner: senior_manager; cadence: at onboarding and on every role change). The deployment profile references a signed role record and any signed Art. 6(3) record by digest; EU controls stay not evaluated until both verify.
- Evidence producers: `amc.profile.euRecords` (planned, P2-11). Levels: L2.
- Tests: L0-INV-04-T1 document (1 attempt): Both records exist, verify and state the role and the exemption basis. L0-INV-04-T2 config (1 attempt): Each referenced digest matches a verifying signed record.
- Executed test: no. Waits for P2-11. The profile carries euRoleRecord and art63Record digests that nothing verifies yet.
- Crosswalk: none.

Citations:

- `eu-ai-act-art-6-3`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 6(3) (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Strategy: the Art. 6(3) exemption is recorded as a signed artifact. The register lists Art. 6(2) and Annex III only; the legal reviewer confirms the Art. 6(3) paragraph.
- `eu-ai-act-art-6-2`: Artificial Intelligence Act, Regulation (EU) 2024/1689, Art. 6(2) and Annex III (binding-now; register entry `eu-ai-act`). https://publications.europa.eu/resource/celex/32024R1689. Retrieval: unverified (Not fetched in P1-14: the task allows no network access. Register entry eu-ai-act records the source as read in its review; fetch and hash this url before expert review (D-08).). Register: Annex III lists the high-risk use areas; Chapter III Sections 1 to 3 apply to Annex III systems from 2027-12-02 (keyDate annexIIIHighRisk).

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
