# Technology catalog overlay

Status: **experimental, unreviewed**, agent-drafted. Promotion: **none — experimental, unreviewed**.
This draft is not legal advice. A control result is evidence of conformity and does not establish legal applicability.
No review record or legal sign-off exists for this overlay.

The P1-13 domain is `technology.platforms-data`: AI platforms, IoT, content and cross-border data. The reference
workflow is a platform or content-safety agent. The draft follows P1-09's implemented tree, as directed by the
integrator on 2026-10-18:

- Pack and controls: `catalog/layers/l1-technology-global/` (`overlay.technology`, version `0.1.0`).
- Fixtures: `catalog/fixtures/<CONTROL-ID>/{positive,negative}/*.json`.
- Law-as-data entries: the appended Technology block of `catalog/registers/us.json` and Technology entries in
  `catalog/registers/eu.json`. No source is promoted by reusing its identifier.
- Instrument order and unresolved instrument records: [instruments.json](instruments.json), ordered US, EU, rest of
  world and voluntary standards. Metadata for unread sources remains unverified with `reverify: true` and no URL or dates.
  Law-as-data records retain candidate official URLs required by the existing grammar; their content hashes and
  retrieval dates remain null. A locator does not prove the text was read.
- Question mapping: [dispositions.json](dispositions.json), keyed to the actual questions on the recorded integration
  base. The embedded drift record names absent spec IDs and label mismatches. No absent question is invented.
- Compiler input: [profile.platform-agent.json](profile.platform-agent.json). It is a synthetic fixture with asserted
  scope, no human reviewer, and unknown entity type, risk class and data classes. It is not a live deployment profile.
- Executable checks: `tests/catalog/stations/technology/`.

The FTC Act Section 5 candidate, India IT Rules and DoT candidate rules, IEC 62443 and SOC 2 still need S5 integration
before they can become catalog clause references. They remain unverified metadata. The separately labelled draft FTC
AI-accuracy proposal does not substitute for FTC Act Section 5. The overlay does not extend official-source hosts.

## Controls and decisive fixtures

| ID | Purpose | Fixture boundary and limit |
| --- | --- | --- |
| L1-TECH-01 | Synthetic-media marking | Verify the signature over generated image and audio bytes against the pinned fixture issuer key; stripped or unknown-key marking must not authorize publication. |
| L1-TECH-02 | CRA early-warning packet drill | Check the AIBOM component, awareness timestamp, candidate clock and packet fields; absent evidence is not evaluated. |
| L1-TECH-03 | IoT command allowlist | Record only allowed commands in a device simulator; injected telemetry must not execute `unlock` or `firmware_update`. |
| L1-TECH-04 | COPPA third-party consent | Draft egress duty; a fixture cannot establish parental authority or satisfy a notice duty. |
| L1-TECH-05 | CCPA automated-decision opt-out | Draft safeguard duty; legal applicability and human appeals need separate evidence. |
| L1-TECH-06 | GPAI integrator documentation | Document-review duty tied to the pinned model; no automated legal assessment. |
| L1-TECH-07 | NIS2 early-warning drill | Uses the existing candidate clocks; national scope and notification authority need confirmation. |
| L1-TECH-08 | AI claims trace to evidence | Document-review duty; the FTC Act clause remains unsourced. |

Signature fixtures include an allow-or-pass case, a deny-or-fail case, missing evidence and the stale, replayed,
contradictory, cross-tenant and empty evidence negatives. They are synthetic examples, not observations of a real
platform, device or reporting event. Fixture oracles do not install a publish verifier, operate a device, submit a
regulatory notice or create a human assessment. Where the compiled enforcement point is unavailable, the result is
`not_evaluated` with enforcement `none`. Missing evidence never becomes a pass.

The CRA clock `eu-cra-early-warning-24h` is an unverified candidate: awareness starts the candidate 24-hour period,
and its source reason is `article, authority and content not read`. The URL and retrieval timestamp are inherited
from the existing S5 `eu-cra` source record; this item claims no fresh retrieval or primary-text reading for the
clock. Its article, recipients, packet fields, scope and exclusions still require expert confirmation.

## Cross-station composition

The current descriptive composition IDs in `catalog/profiles/cross-station.json` that include Technology are:

| Composition ID | Workflow |
| --- | --- |
| `banking-and-payments` | Wealth × Technology |
| `self-driving-connected-vehicles` | Mobility × Technology |
| `digital-health-devices` | Health × Technology |
| `public-sector-ai` | Governance × Technology |
| `education-technology` | Education × Technology |
| `grid-utility-operations` | Environment × Technology |
| `insurer-connected-cars` | Wealth × Mobility × Technology |

These references describe composition only. P2-28 owns merging. No operating profile or jurisdiction profile is
changed here. Reviewed lighthouse mandatory results remain the responsibility of P2-10. NYDFS Part 500 and GLBA
remain P1-18, DORA remains P2-11, and HIPAA technical safeguards remain P2-04.

## Promotion admission record

Promotion is **none — experimental, unreviewed**. The following are the ten P1-33 admission criteria, recorded as
draft work and human dependencies. This table is not a signed admission report, and does not claim that P1-33 ran.

| Criterion | Status | Evidence pointer or unmet requirement |
| --- | --- | --- |
| 1. Manifest, compatibility, licence and reproducible digest | not_evaluated | Pack manifest and this item's qualification receipt are available for P1-33 to check against the catalog lock. |
| 2. Verified clause sources and independent legal review | not_met | Unverified sources remain; D-14 must name a credentialed Technology reviewer. No signed P1-34 legal record exists. |
| 3. Applicability predicates, reasons and exclusions | not_evaluated | Control applicability records need P1-33's checks and a human scope decision. |
| 4. Enforcement binding or manual performance duty | not_evaluated | Control bindings name their boundary or manual owner; actual performance evidence is absent. |
| 5. Test type and effect-observing oracle | not_evaluated | Signature harnesses exercise fixture effects only; document review still needs a human assessor. |
| 6. Negative evidence fixtures and no false mandatory passes | not_evaluated | The qualification receipt records fixture outcomes and mutations; P1-33 has not admitted the pack. |
| 7. Available producers, scope binding and invalidation | not_evaluated | Evidence contracts exist; planned producers and live effect observation remain dependencies. |
| 8. Unknown-fact and authority/hold/residency fail-closed cases | not_evaluated | Compiler and evidence tests record missing-evidence behavior; P1-33 must evaluate the complete admission corpus. |
| 9. Independent human sign-offs bound to the pack digest | not_met | No distinct domain, legal and risk-owner signatures exist. AI drafting creates no sign-off. |
| 10. Partner, funded update plan, triage target and coverage | not_met | P1-29 platform/content-safety partner, stewardship owner/funding and triage target are unset; this document lists unsupported behavior. |

Needs-Sid placeholders: `D-14 Technology reviewer: not supplied`; `P1-29 platform/content-safety partner: not supplied`.
No review request was sent. Recruitment and third-party contact require Sid or the designated owner. Promotion needs
the real partner, all ten criteria met with their evidence, independent human records and Sid's explicit decision.

## Unsupported behaviour

The overlay does not enforce content marking in a live publisher, operate a real IoT device, determine CRA or COPPA
scope, submit incident notices, verify parental authority, decide fair contract terms, or perform a human document
review. It does not convert assurance packs, merge lighthouse profiles or supply absent deep questions. Legacy
questionnaire responses remain self-reported and capped at L1 unless separately supported by admitted evidence.

The inventory receipt records the spec's expected pack/deep counts against the actual integration source, each
absent named spec ID and the CI-15/PP-15 meaning changes. The six P1-42 restoration IDs retain dispositions even
before an integration landing announcement. Their temporary test tolerance must be tightened when Claude announces
that landing; it is not permission to invent question text or edit `src/domains/**`.
