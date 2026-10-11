# Layer 0 review packet: Least privilege and tools

Status: draft for the D-08 reviewers (P1-14). Every control here is `experimental`, agent-drafted and
not independently reviewed; this packet changes no record. A reviewer's decision is recorded through the P1-34 process, which sets the
control's `review` fields and, for AI-drafted content, `provenance.approvedBy`. Summary table: [LAYER0.md](../LAYER0.md).

## L0-TOOL-01 · Signed tool allowlist

- Statement: Only tools in the signed tools configuration are visible to the agent, and any other call is refused with a receipt.
- Risk rationale: An agent that can reach unlisted tools has whatever authority those tools carry, outside any signed policy.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. The tool-allowlist guard reads .amc/tools.yaml and its auditor signature in one read and refuses any tool the verified configuration does not list, and every tool when it does not verify.
- Evidence producers: `amc.toolPipeline.guard` (available), `amc.signedConfig.tools` (available). Levels: L2, L3.
- Tests: L0-TOOL-01-T1 runtime (1 attempt): A listed tool runs; an unlisted tool, an edited configuration, a missing signature and a foreign signature are refused by the tool-allowlist guard with a denied receipt and no tool body run.
- Executed test: yes (tools.test.ts). Partial. Unlisted tools and an edited, unsigned or foreign-signed tools.yaml are refused by the tool-allowlist guard with a denied receipt. A call to a tool name the registry does not know is refused at visibility and leaves no record (P1-75).
- Crosswalk: amc-audit-map-v1 SECURE_CONFIGURATION.TOOLS_POLICY (partial); amc-audit-map-v1 MODEL_TOOL_GOVERNANCE.TOOL_BOUNDARY (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-TOOL-02 · Mandate limits outside the model

- Statement: Consequential calls carry declared limits on amount, recipient, resource and rate that the enforcement point checks, and an over-limit call is refused.
- Risk rationale: Limits that live only in a prompt can be talked away; only a check outside the model holds against injection or error.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline. The authorization stage compares the call's bound amount, recipient, resource and rate with the signed mandate and refuses any value beyond it.
- Evidence producers: `amc.mandate.limits` (planned, P1-20). Levels: L2.
- Tests: L0-TOOL-02-T1 runtime (1 attempt): Calls within the mandate are allowed; over-limit amount, unlisted recipient, unlisted resource and over-rate calls are refused. Today only a daily per-class count is enforced (budgets guard).
- Executed test: no. Waits for P1-20. The budgets guard counts calls per class per day; amount and recipient are bound to approvals but never compared with a limit.
- Crosswalk: amc-audit-map-v1 SECURE_CONFIGURATION.BUDGETS_POLICY (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-TOOL-03 · MCP server authorization

- Statement: Remote MCP servers are used only with authorization per the MCP 2026-07-28 specification, and an unauthenticated or unpinned server is refused.
- Risk rationale: An unpinned or unauthenticated MCP server can impersonate a tool provider and feed the agent instructions or exfiltrate its data.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, egress. The MCP client pins each remote server's exact origin and configuration digest and refuses a server without completed authorization before any tool is listed.
- Evidence producers: `amc.mcp.authorization` (planned, P1-39). Levels: L2.
- Tests: L0-TOOL-03-T1 runtime (1 attempt): A pinned, authorized server is used; an unpinned origin, a changed configuration digest and an unauthenticated server are refused. Today unpinned origins are refused at load, but an unauthenticated server is refused only after it answers 401.
- Executed test: no. Waits for P1-39's remainder. Unpinned origins are refused at load; an unauthenticated server is refused only after it answers 401.
- Crosswalk: none.

Citations:

- None. The strategy and the register name no instrument for this control yet.

## L0-TOOL-04 · Default-deny network egress

- Statement: Tool network access is denied unless the destination is on the deployment allowlist, and every blocked attempt is recorded.
- Risk rationale: Open egress lets an injected instruction send data to any host and fetch further instructions from it.
- Applicability: `{always: true}`. Layer 0 applies to every agent deployment in every station.
- Binding: enforcement point tool_pipeline, egress. The network-egress guard refuses a NETWORK_EXTERNAL call whose host is not on its tool's signed host allowlist; the gateway proxy writes NETWORK_EGRESS_BLOCKED for refused proxy traffic.
- Evidence producers: `amc.toolPipeline.guard` (available), `amc.gateway.egress` (available). Levels: L2, L3.
- Tests: L0-TOOL-04-T1 runtime (1 attempt): An allowlisted host is reached; an unlisted host, an unparseable url and a call naming no url are refused by the network-egress guard with a denied receipt and no tool body run.
- Executed test: yes (tools.test.ts). Full at the tool pipeline: unlisted hosts, userinfo tricks, unparseable urls and calls naming no url are refused with a denied receipt. The gateway proxy's NETWORK_EGRESS_BLOCKED path is not driven here.
- Crosswalk: amc-audit-map-v1 MODEL_TOOL_GOVERNANCE.TOOL_BOUNDARY (partial).

Citations:

- None. The strategy and the register name no instrument for this control yet.

## Sign-off checklist

For each control above:

- [ ] The statement is one testable sentence and says exactly what the control requires.
- [ ] The applicability predicate and exclusions put the right deployments in scope.
- [ ] Each citation's instrument, clause, edition and dates are right, and its source was fetched and hashed.
- [ ] Each crosswalk relation is right.
- [ ] The tests and fixtures would catch a deployment that fails the control, and the coverage note is accurate.
- [ ] Decision: keep, change (say what) or drop. Ids stay stable; a dropped control is retired, never reused.
- [ ] Reviewer name, credential and date, recorded through P1-34.
