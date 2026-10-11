# Layer 0 Agent Control Baseline v0.1

Status: draft (P1-14). Every control is `experimental`, agent-drafted and not independently reviewed. Expert sign-off waits
for decision D-08 and the P1-34 process. A result under these controls is evidence of conformity, never proof of
compliance. Records: `catalog/layers/l0-baseline/`. Format: [CONTROL_RECORD.md](CONTROL_RECORD.md). Review packets:
[review-packets/](review-packets/).

Layer 0 is what every agent deployment needs in every station. Each control lists all seven stations, is mandatory, and
narrows its scope only through its applicability predicate: the EU role record (L0-INV-04) applies where the profile names
the EU; the disclosure, representation and marking controls (L0-TRN-01 to L0-TRN-03) apply to the matching use cases; the
explanation and fairness controls (L0-EXP-*, L0-FAI-*) apply only where the use cases include consequential decisions about
people, and an explicit exclusion keeps a reconciliation agent out of scope. A profile that leaves one of those facts
unknown leaves the control unresolved, and a mandatory unresolved control blocks the compiled plan.

## Totals

| Count | Value |
| --- | --- |
| Controls | <!-- amc:count:layer0Controls -->47<!-- /amc:count --> |
| Controls with an executed test against a real enforcement point | <!-- amc:count:layer0ExecutedControls -->17<!-- /amc:count --> |
| Controls waiting for a producer | <!-- amc:count:layer0AwaitingProducer -->30<!-- /amc:count --> |

`node scripts/gen-counts.mjs` derives these from the catalog. A control counts as executed when one of its fixtures names a
harness that drives the real enforcement point; most of those cover only part of the statement, and the Coverage column says
which part. An executed test is not a pass for any deployment: it shows that the enforcement point behaves as the fixtures
state, in a temporary workspace.

## How the tests work

- `tests/catalog/l0/evidenceFixtures.test.ts` runs every evidence fixture of every control through P1-11's
  `evaluateControl`. Each control has a positive fixture and negative fixtures of the classes violation, stale, replayed,
  contradictory, cross_tenant and empty. No negative fixture passes. A control whose producers are planned gets
  `not_evaluated` (`producer_not_admitted`) even for its positive fixture: missing evidence is never a pass.
- The family files (`inventory`, `identity`, `tools`, `data`, `oversight`, `logging`, `monitoring`) drive each executed
  harness's fixtures against the real code in a temporary workspace: the tool pipeline with its guards and action journal,
  the lease verifier, the approval engine, the compiled-plan guard under a plan compiled from this catalog and activated,
  the ledger and its verifier, the deletion gate, the residency egress check, protected-data admission, the drift detector
  and the incident clock store. They assert denials, signed receipts, ledger rows and refusal codes, never agent text.
- `catalogLoads.test.ts` and `fixtureCoverage.test.ts` keep this page, the records and the fixtures in step.

## Controls

The executed column names the test file. Citations are counted per control; none was fetched in P1-14 (the task allowed no
network access), so every one is `unverified` with its reason, and each jurisdiction-specific citation carries `appliesWhen`.

| ID | Title | Test type | Producer status | Executed test | Coverage and gaps | Citations | Review status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L0-INV-01 | Agent registry entry | config | available | yes (inventory.test.ts) | Partial. The signature over agent.config.yaml is checked; nothing refuses a session for an unregistered or unsigned agent (P1-70), and the entry has no owner, stations or version fields. | 0 | pending (D-08) |
| L0-INV-02 | AI bill of materials | config | planned (P1-27) | no | Waits for P1-27. Today AMC writes an SBOM of npm dependencies only. | 1 | pending (D-08) |
| L0-INV-03 | Risk tier record | config | planned (P1-15) | no | Waits for P1-15. riskClass is a profile fact; a missing one leaves dependent controls unresolved rather than compiling at the highest tier. | 1 | pending (D-08) |
| L0-INV-04 | EU role and Art. 6(3) record | document, config | planned (P2-11) | no | Waits for P2-11. The profile carries euRoleRecord and art63Record digests that nothing verifies yet. | 2 | pending (D-08) |
| L0-IDN-01 | Unique agent identity bound to a human principal | runtime | available | yes (identity.test.ts) | Full at the tool pipeline under an active compiled plan whose identity-binding requires a lease and a principal. A call without a verified lease, or whose lease names a user who is not active in the signed users.yaml, is refused (IDENTITY_UNRESOLVED); a lease naming no principal is refused (PRINCIPAL_UNRESOLVED). The lease token's own identity never counts as the principal. Studio native task leases name the task's users.yaml user; host-router sessions and the admin token name none. A registered service (an AGENT-only user) also counts, which the statement's "human principal" leaves to D-08. | 2 | pending (D-08) |
| L0-IDN-02 | Short-lived scoped credentials | runtime | available | yes (identity.test.ts) | Full at the tool pipeline. Expired, revoked, out-of-scope, other-agent, foreign-signed and other-workspace leases, and a lease naming a user who is not active in the signed users.yaml, are refused at the authorization stage. | 0 | pending (D-08) |
| L0-IDN-03 | Delegation never widens authority | runtime | planned (P2-25) | no | Waits for P2-25. Today a wider child scope is intersected down instead of refused, and expiry is not clamped to the parent. | 0 | pending (D-08) |
| L0-IDN-04 | Revocation takes effect | drill | available | yes (identity.test.ts) | Full. The drill revokes a lease and the next call is refused (lease_revoked); a revocation during an approval wait is refused at the recheck; an unverifiable revocation list refuses every lease. | 0 | pending (D-08) |
| L0-TOOL-01 | Signed tool allowlist | runtime | available | yes (tools.test.ts) | Full at the tool pipeline. Unlisted tools and an edited, unsigned or foreign-signed tools.yaml are refused by the tool-allowlist guard with a denied receipt; a call to a tool name the registry does not hold is refused at visibility and leaves a TOOL_CALL_DENIED record (no class, no journal receipt). | 0 | pending (D-08) |
| L0-TOOL-02 | Mandate limits outside the model | runtime | planned (P1-20) | no | Waits for P1-20. The budgets guard counts calls per class per day; amount and recipient are bound to approvals but never compared with a limit. | 0 | pending (D-08) |
| L0-TOOL-03 | MCP server authorization | runtime | planned (P1-39) | no | Waits for P1-39's remainder. Unpinned origins are refused at load; an unauthenticated server is refused only after it answers 401. | 0 | pending (D-08) |
| L0-TOOL-04 | Default-deny network egress | runtime | available | yes (tools.test.ts) | Full at the tool pipeline: unlisted hosts, userinfo tricks, unparseable urls and calls naming no url are refused with a denied receipt. The gateway proxy's NETWORK_EGRESS_BLOCKED path is not driven here. | 0 | pending (D-08) |
| L0-DAT-01 | Minimum necessary context | runtime | available | yes (data.test.ts) | Partial. Native model requests in a workspace with a signed processor registry: an undeclared class is blocked (class_not_permitted), never redacted. Tool arguments and logs are not covered. | 0 | pending (D-08) |
| L0-DAT-02 | Redaction before models and logs | runtime | planned (P2-02) | no | Waits for P2-02's remainder. The gateway redacts its ledger copy, not the provider request, and no per-redaction receipt exists. | 0 | pending (D-08) |
| L0-DAT-03 | Processor allowlist | runtime | available | yes (data.test.ts) | Partial. Native model requests only: an unlisted route, a processor outside the purpose and PHI without a BAA are refused. | 1 | pending (D-08) |
| L0-DAT-04 | Residency routing | runtime | available | yes (data.test.ts) | Full for egress routes checked against the signed destination registry: unregistered destinations, disallowed and unknown regions and an edited registry are blocked, and a block reports not_evaluated. | 0 | pending (D-08) |
| L0-OVS-01 | Recommend versus finalize | runtime | available | yes (oversight.test.ts) | Full, read through approval-required classes: AMC has no separate recommend-only marker. Without a signed approval the call is refused (approval_missing); denied and short-quorum approvals are refused. | 1 | pending (D-08) |
| L0-OVS-02 | Approval bound to the exact action | runtime | available | yes (oversight.test.ts) | Full. A changed amount or recipient, an expired approval and a second use are refused before the tool body runs. | 0 | pending (D-08) |
| L0-OVS-03 | Separation of duties | runtime | available | yes (oversight.test.ts) | Partial. The engine refuses a second decision by the same user and an approval by a request's recorded initiator, and the quorum counts neither. Only a caller that names the initiator gets that separation; no AMC surface names one yet (A4 can pass its requester key), and the approval policy has no rule that requires it. | 0 | pending (D-08) |
| L0-OVS-04 | Override and rubber-stamp telemetry | runtime, document | planned (P1-71) | no | Waits for P1-71. analyzeRubberStamping exists but nothing feeds it. | 0 | pending (D-08) |
| L0-ADV-01 | Direct prompt injection | adversarial | planned (P1-48) | no | Waits for P1-48. Today scenarios are graded on the agent's reply, which is not evidence for this control. | 0 | pending (D-08) |
| L0-ADV-02 | Indirect injection | adversarial | planned (P1-48) | no | Waits for P1-48. | 0 | pending (D-08) |
| L0-ADV-03 | Tool misuse and goal hijack | adversarial | planned (P1-48) | no | Waits for P1-48. | 0 | pending (D-08) |
| L0-ADV-04 | Memory poisoning | adversarial | planned (P1-48) | no | Waits for P1-48. | 0 | pending (D-08) |
| L0-TRN-01 | AI disclosure at first interaction | runtime | planned (P1-72) | no | Waits for P1-72. No output check requires a disclosure. | 2 | pending (D-08) |
| L0-TRN-02 | Represented party stated | runtime | planned (P1-72) | no | Waits for P1-72. | 0 | pending (D-08) |
| L0-TRN-03 | Content marking | runtime | planned (P1-72) | no | Waits for P1-72. The current manifest is AMC-C2PA-INSPIRED/1, not C2PA, and no channel checks it. | 1 | pending (D-08) |
| L0-EXP-01 | Faithful reasons | adversarial | planned (P1-73) | no | Waits for P1-73. | 2 | pending (D-08) |
| L0-EXP-02 | Notice of consequential decisions | document, config | planned (P1-73) | no | Waits for P1-73; the notice elements come from the overlays. | 4 | pending (D-08) |
| L0-EXP-03 | Appeal reaches a human | drill | planned (P1-73) | no | Waits for P1-73. | 3 | pending (D-08) |
| L0-FAI-01 | Counterfactual pairs | adversarial | planned (P1-74) | no | Waits for P1-74. The predicate keeps a reconciliation agent out of scope. | 1 | pending (D-08) |
| L0-FAI-02 | Impact ratios | document | planned (P1-74) | no | Waits for P1-74. | 1 | pending (D-08) |
| L0-FAI-03 | Proxy screening | config, document | planned (P1-74) | no | Waits for P1-74. | 2 | pending (D-08) |
| L0-FAI-04 | Subgroup performance | document | planned (P1-74) | no | Waits for P1-74. | 0 | pending (D-08) |
| L0-LOG-01 | Step-level traces | runtime | available | yes (logging.test.ts) | Partial. Allowed and denied calls are hash-chained rows naming the session, agent and tool, and the chain verifies. Authorization records bind the active plan's tenant and deployment, or say deploymentId not_bound when no plan names one. A toolset never writes a row its session cannot verify: a call whose rows cannot be written is refused before its body, and a row lost after a body ran refuses every later call. Model calls and approvals are not driven here. | 2 | pending (D-08) |
| L0-LOG-02 | Tamper evidence | runtime | available | yes (logging.test.ts) | Partial. Rewritten, deleted and reordered events fail verification. The tail of an open session can be deleted undetected, and signed checkpoints are not verified (P1-25, P1-26). | 0 | pending (D-08) |
| L0-LOG-03 | Retention per regime | config | available | yes (logging.test.ts) | Partial. Deletion is refused under an unverifiable hold registry; a hold in a workspace with no tenant identity is refused as unknown (tenant_unmapped). Regime retention periods wait for P2-26. | 1 | pending (D-08) |
| L0-LOG-04 | WORM export | config, drill | planned (P2-09) | no | Waits for P2-09 (the spec named P2-26; P2-09's title carries WORM export). | 0 | pending (D-08) |
| L0-CHG-01 | Pinned versions | config, runtime | planned (P1-75) | no | Waits for P1-75. Only the compiled plan and the catalog lock are pinned today. | 0 | pending (D-08) |
| L0-CHG-02 | Regression on a sequestered test set | config | planned (P1-75) | no | Waits for P1-75. AMC's own release gate writes a signed receipt but has no sequestered set. | 0 | pending (D-08) |
| L0-CHG-03 | Evidence invalidated on change | runtime | planned (P1-75) | no | Waits for P1-75. P1-11's evaluator rejects items recorded before an invalidation trigger, but nothing records triggers from version changes. | 0 | pending (D-08) |
| L0-CHG-04 | Vendor change notice | document | planned (P1-76) | no | Manual duty; its signed record waits for P1-76. | 1 | pending (D-08) |
| L0-MON-01 | Drift alarms | runtime | available | yes (monitoring.test.ts) | Full. A breach writes DRIFT_REGRESSION_DETECTED and a signed freeze, and the pipeline then refuses the frozen class (action_class_frozen). | 0 | pending (D-08) |
| L0-MON-02 | Incidents start regulatory clocks | drill, runtime | partial (P2-26) | yes (monitoring.test.ts) | Partial. An incident starts the station's clocks with deadlines, and the clock store refuses backdated, future-dated, unknown and duplicate events. Notice drafts wait for P2-26. | 3 | pending (D-08) |
| L0-MON-03 | Kill switch with manual fallback | drill | planned (P2-26) | no | Waits for P2-26. Freezes exist only as drift responses; an operator cannot start one. | 0 | pending (D-08) |
| L0-MON-04 | Safe state on provider outage | drill | planned (P1-76) | no | Waits for P1-76. | 0 | pending (D-08) |
| L0-MON-05 | Provider exit plan | document, drill | planned (P1-76) | no | Manual duty; its signed record waits for P1-76. | 1 | pending (D-08) |

## Crosswalks

Each control maps to the built-in audit map (`amc-audit-map-v1`) where they overlap, always `relation: partial`. The
adversarial controls map to the OWASP Top 10 for Agentic Applications 2026 (`owasp-asi-2026`, ASI01 to ASI10) and to MITRE
ATLAS techniques checked against the hashed ATLAS release in `src/compliance/citations/reference/atlas.json` (prompt injection
is AML.T0051, never T0048). Every one of these mappings waits for expert confirmation.

## Proposed follow-up keys

P1-14 proposes these keys for producers and gaps nothing in the plan owns yet. They are proposed, not yet in the plan; the
integrator confirms them. P1-68 and P1-69 belong to P0-28, so the numbering starts at P1-70; P1-78 holds the enforcement gaps
the executed tests found, and closes them.

| Key | Producers (catalog/producers.yaml) | Scope | Status |
| --- | --- | --- | --- |
| P1-70 | none (an enforcement gap, not a producer) | Refuse a session for an unregistered or unsigned agent (L0-INV-01). | proposed, not yet in the plan |
| P1-71 | `amc.oversight.telemetry` | Per-reviewer oversight telemetry and alerts from signed approval records (L0-OVS-04). | proposed, not yet in the plan |
| P1-72 | `amc.transparency.outputCheck`, `amc.provenance.c2pa` | Transparency output checks: first-message AI disclosure, represented party and C2PA content credentials (L0-TRN-01 to L0-TRN-03). | proposed, not yet in the plan |
| P1-73 | `amc.explanation.lineage`, `amc.explanation.notice`, `amc.explanation.appeal` | Explanation lineage, decision notices and appeal routing (L0-EXP-01 to L0-EXP-03). | proposed, not yet in the plan |
| P1-74 | `amc.fairness.harness` | A fairness harness: paired cases, impact ratios, proxy screening and subgroup error rates (L0-FAI-01 to L0-FAI-04). | proposed, not yet in the plan |
| P1-75 | `amc.versionManifest`, `amc.regression.sequestered` | A signed version-pin manifest, invalidation triggers recorded from version changes and a sequestered regression set (L0-CHG-01 to L0-CHG-03). | proposed, not yet in the plan |
| P1-76 | `amc.manualDuty.record`, `amc.providerOutage.safeState` | Signed manual-duty and drill records, and a safe state on provider outage (L0-CHG-04, L0-MON-04, L0-MON-05). | proposed, not yet in the plan |
| P1-78 | none (an enforcement gap, not a producer) | Close the Layer 0 gaps the executed tests found: a human principal under identity-binding, the workspace check on the pipeline's lease path, a record for visibility denials, initiator-approver separation, deploymentId in ledger rows and session rows for writer-less toolsets. | implemented on its branch (qualification/2026-10-12-P1-78/); the integrator registers the key |

## Open questions for Sid and the D-08 reviewers

- Whether the fairness controls stay in Layer 0, scoped by predicate, or move to station overlays (P1-14, "Needs a human").
- The strategy's CERT-In rules (180-day logs, AIBOM fields) have no register entry, and `cert-in.org.in` is not on the shared
  official host list, so L0-LOG-03 and L0-INV-02 name them without a citation.
- Every citation needs a fetch, a hash and a legal reviewer before any control can leave `experimental`.
