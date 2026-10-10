# AMC MCP Server

**Give your AI coding assistant real-time AMC trust scoring and agent governance capabilities.**

The AMC MCP Server exposes AMC's scoring, guide, compliance, and transparency capabilities to any MCP-compatible AI coding assistant via the [Model Context Protocol](https://modelcontextprotocol.io).

Supported clients: Claude Code, Cursor, GitHub Copilot (VS Code), Windsurf, Kiro, Codex, IntelliJ with Junie, and any other MCP-compatible tool.

---

## Quick Start (3 steps)

```bash
# 1. Install AMC globally
curl -fsSL https://agentmaturity.co/install.sh | sh

# 2. Add to your IDE's MCP config (see configs below)

# 3. Ask your AI assistant: "What's the trust score for my agent?"
```

Or print ready-to-paste configs:

```bash
amc mcp config
```

---

## IDE Configurations

### Claude Code
File: `.claude/mcp.json`
```json
{
  "mcpServers": {
    "amc": {
      "command": "amc",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Cursor
File: `.cursor/mcp.json`
```json
{
  "mcpServers": {
    "amc": {
      "command": "amc",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Windsurf
File: `.windsurf/mcp.json`
```json
{
  "mcpServers": {
    "amc": {
      "command": "amc",
      "args": ["mcp", "serve"]
    }
  }
}
```

### VS Code (Copilot)
File: `.vscode/mcp.json`
```json
{
  "mcpServers": {
    "amc": {
      "command": "amc",
      "args": ["mcp", "serve"]
    }
  }
}
```

### Kiro
File: `.kiro/mcp.json`
```json
{
  "mcpServers": {
    "amc": {
      "command": "amc",
      "args": ["mcp", "serve"]
    }
  }
}
```

---

## Available Tools

### Claim labels

Every successful tool result carries a claim label from the shared service in `src/claims/eligibility` (see [CLAIM_KINDS.md](CLAIM_KINDS.md)). The result text comes first; a second text block holds the canonical claim line and a pointer to the legend, so JSON output stays parseable:

```
Claim: Self-reported · Result: not evaluated (this result is not yet bound to claim-eligible evidence) · Evidence: incomplete · Enforcement: none · Review: pending · Applicability: applicable
Claim kinds: see docs/CLAIM_KINDS.md
```

The same fields are in `structuredContent`: `{ claimKind, statusDimensions, claimLabel }`. Some clients ignore `structuredContent` without an output schema, so the text line is the guaranteed label. Errors (`isError`) carry no claim.

| Tool | Claim source |
| --- | --- |
| `amc_quickscore`, `amc_get_guide`, `amc_transparency_report`, `amc_score_agent`, `amc_get_recommendations` | The agent's latest diagnostic run when this workspace's auditor key sealed it (`envelopeForDiagnosticReport`); otherwise not evaluated |
| `amc_query_diagnostic` | The run it shows, on the same terms |
| `amc_check_compliance` | A regulated result that is not evaluated: the gaps come from dimension scores, not from evidence bound to a control |
| `amc_score_sector_pack` | The regulated self-assessment envelope: self-reported, never a pass, at most level 1 |
| `amc_list_agents`, `amc_list_evidence` | The listing itself is not evaluated; each agent shows its latest run's claim kind, and each evidence event shows the kind of its effective trust tier |
| `amc_incident_clocks` | A regulated listing that is not evaluated: deadlines run from operator-recorded trigger and notice times, and applicability is unresolved |
| `amc_a4_project`, `amc_a4_readiness` (A4 preview) | The server's own readiness envelope (`claim` of `amc.a4-readiness/v1`), never one composed by the tool |
| `amc_a4_conformance` (A4 preview) | A regulated result that is not evaluated (`NO_PRODUCER_REGISTERED`) until Adapt registers its producer, as the API answers |
| `amc_a4_list_projects`, `amc_a4_comment` (A4 preview) | The listing or the recorded comment itself is not evaluated (self-reported) |

AMC output is evidence of conformity. No tool prints "certified".

### `amc_list_agents`
List all AMC-registered agents in the workspace.

```
Input:  { workspace?: string }
Output: List of agent IDs with registration status
```

**Example prompt:** *"List all the AI agents registered in this project"*

---

### `amc_quickscore`
Get the current trust score and maturity level for an agent.

```
Input:  { agentId: string, workspace?: string }
Output: { maturityLabel, trustScore (0-100), dimensions, topPriority }
```

**Example prompt:** *"What's the AMC trust score for my-agent?"*

**Example output:**
```
## AMC Trust Score: my-agent

Overall: L3 — Defined · Trust Score: 62/100
Evidence standing: partial_evidence
Risk Tier: high
Last Assessed: 2026-02-27T09:00:00.000Z

Dimensions:
  • Tool Use Safety: L3 — Defined (3/5)
  • Instruction Following: L4 — Managed (4/5)
  • Evidence & Auditability: L2 — Developing (2/5)
  • Context & Memory Management: L3 — Defined (3/5)

Top Priority: Improve Evidence & Auditability from L2 to L3
  → `amc guide --agent my-agent`

Claim: Observed · Result: pass · Evidence: sufficient · Enforcement: none · Review: pending · Applicability: applicable
Claim kinds: see docs/CLAIM_KINDS.md
```

---

### `amc_get_guide`
Get a prioritized improvement guide with specific CLI commands.

```
Input:  { agentId: string, workspace?: string }
Output: Top 3 actions with impact estimates and commands
```

**Example prompt:** *"How can I improve the trust score for my-agent?"*

---

### `amc_check_compliance`
Check for compliance gaps against regulatory frameworks.

```
Input:  { agentId: string, frameworks?: string[], workspace?: string }
        frameworks: EU_AI_ACT | ISO_42001 | NIST_AI_RMF | SOC2 | ISO_27001
Output: { criticalGaps, highGaps, command to run for details }
```

**Example prompt:** *"Check my-agent for EU AI Act compliance gaps"*

---

### `amc_transparency_report`
Generate a full Agent Transparency Report.

```
Input:  { agentId: string, format?: "markdown" | "json", workspace?: string }
Output: Complete AgentTransparencyReport (capabilities, data access, trust evidence, risks)
```

**Example prompt:** *"Generate a transparency report for my-agent for our governance review"*

---

### `amc_score_sector_pack`
Score an agent against an industry-specific Sector Pack.

```
Input:  { packId: string, responses: Record<questionId, integer 1-5> }
Output: self-reported score and level, "Self-assessment: complete (self-reported; not a certification)", complianceGaps
```

Responses are self-declared Likert answers; a value that is not an integer 1-5 fails the call. A complete self-assessment is not a certification and caps at L1 (see [CLAIM_KINDS.md](CLAIM_KINDS.md)). Its claim line reads `Claim: Self-reported · Result: not evaluated (self-reported answers cannot pass a regulated control) · …`. Only a pack's own id is accepted: inherited names such as `__proto__` or `constructor` return "Unknown sector pack".

Available pack IDs (40 total across 7 stations):

| Station | Example Packs |
|---|---|
| Environment | `farm-to-fork`, `ubiquity-to-utility`, `sip-to-sanitation` |
| Health | `digital-health-record`, `clinical-trials`, `drug-discovery` |
| Wealth | `digital-payments`, `blockchain`, `no-poverty` |
| Education | `k12-pm3`, `higher-education`, `differently-abled` |
| Mobility | `sustainable-communities`, `privacy-security-mobility` |
| Technology | `cognition-to-intelligence`, `infotainment`, `os-sustainable-outcomes` |
| Governance | `digital-citizens-rights`, `dance-of-democracy`, `citizen-services` |

**Example prompt:** *"Score my healthcare agent against the clinical-trials sector pack"*

---

### `amc_incident_clocks`
List a stored incident's regulatory reporting clocks for a station (P1-17).

```
Input:  { incidentId: string, station: string, now?: string, workspace?: string }
        station: health | education | environment | mobility | governance | technology | wealth
        now: ISO 8601 with a zone (default: now)
Output: { incidentId, station, now, clocks[], events[], notes[] } — the same listing as
        `amc incident clocks <id> --station <station> --json`
```

Each clock shows its instrument, article, trigger, due date, status (`NOT_STARTED`, `PENDING`, `DUE_SOON`, `OVERDUE`, `SATISFIED`, `SATISFIED_LATE`), source and review status. Trigger and notice times come from the signed clock events recorded with `amc incident clocks --trigger|--notified` or `POST /api/v1/incidents/:id/clock-events`; a row whose signature fails is refused by its event id. The tool records nothing. Durations are agent-drafted and experimental until an expert signs off; they are not legal advice, and AMC does not file notices. See [REGULATORY_INCIDENT_CLOCKS.md](REGULATORY_INCIDENT_CLOCKS.md).

**Example prompt:** *"Which regulatory deadlines are open on incident_… for the wealth station?"*

---

### A4 Forge tools (preview)
With `AMC_A4_PREVIEW=1` in the server's environment, `amc mcp serve` adds five tools for A4 agent projects (`amc mcp list-tools` lists them only then):

```
amc_a4_list_projects  { workspace?: string }
amc_a4_project        { projectId: string, workspace?: string }
amc_a4_readiness      { projectId: string, stage?: aspire|assemble|adapt|activate, workspace?: string }
amc_a4_conformance    { projectId: string, stage?: aspire|assemble|adapt|activate, workspace?: string }
amc_a4_comment        { projectId: string, cardId: string, body: string, clientRequestId: string, inReplyTo?: string, workspace?: string }
```

They read the same records and run the same readiness evaluator as `/api/v1/a4`. No tool approves, denies, builds, completes or releases: decisions stay with people in Studio. Every A4 tool refuses while the workspace is read-only (its users or trust signature does not verify).

The server has no per-user session, so identity comes from the server's own configuration: set `AMC_A4_SESSION_TOKEN_FILE` in the MCP config's `env` to a private (0600) token file written by `amc approvals login`. Each call re-reads that user from the signed users.yaml; a missing, expired or revoked session or a revoked user is refused, and the file's path is never printed. Without the file the four reads answer as the admin token does: every project, reads only. With it they show the projects that user may read, and readiness's `allowed` is that user's.

**The token file is a live user credential.** It is that user's full Studio session, not a comment-only identity. The agent host runs as the same OS user, so its own tools can read the path from the MCP config, read the file, and call Studio, or `amc approvals … --session-token-file`, as that user until the session expires. The server therefore accepts the session only of a user whose sole role is `VIEWER`; any other role is refused (403 `A4_SESSION_TOO_PRIVILEGED`). A `VIEWER` cannot approve, deny or request changes on an A4 gate, which needs `APPROVER`, `AUDITOR` or `OWNER`, and cannot build, which needs `OPERATOR`. It can still read what a `VIEWER` reads in Studio, and it can decide an approval request only if a rule in the signed approval policy lists `VIEWER` in its `rolesAllowed`. Set it up like this:

```bash
amc user add --username a4-agent --role VIEWER       # a dedicated user for the agent host
# as a project owner, add LOCAL_USER:<its userId from `amc user list`> to each project it should read
amc approvals login --username a4-agent --token-file ~/.amc-a4-agent.token --ttl-minutes 5
```

Use the shortest lifetime that works (5 to 60 minutes). Revoke the user (`amc user revoke`) to cut access before the session expires.

`amc_a4_comment` refuses without that file. It records a self-reported comment through the same path as `POST /api/v1/a4/projects/:id/comments` (project membership, encrypted blob, request-id dedupe). The record is that user's own comment, the same as one typed in Studio: it stores the user's key and name and carries no MCP marker. The dedicated user is therefore how the project history tells MCP comments from a person's.

---

## Resources

### `amc://agent/{agentId}`
Access an agent's transparency report as a resource directly from your AI assistant.

**Example prompt:** *"Read the AMC transparency report for my-agent"*

---

## CLI Commands

```bash
# Start the MCP server (stdio — called by your IDE automatically)
amc mcp serve

# Print config snippets for all IDEs
amc mcp config

# Print config for a specific IDE
amc mcp config --ide cursor

# List all exposed tools
amc mcp list-tools

# List tools as JSON
amc mcp list-tools --json
```

---

## How It Works

The AMC MCP server runs as a subprocess of your IDE in **stdio mode** — it reads JSON-RPC messages from stdin and writes responses to stdout. Your IDE manages the lifecycle: starting it when needed, reusing the connection, and stopping it when the IDE closes.

No network ports are opened. No data leaves your machine. The server reads from your local AMC workspace (`.amc/` directory).

---

## Security Notes

- **Local only by default** — stdio transport, no network exposure
- **Read-mostly** — the MCP server reads AMC data; it does not run diagnostics or modify agent configs
- **Read-only tools** — no tool modifies agent configs or runs diagnostics; the only write is the A4 preview's `amc_a4_comment`, which records a self-reported comment as the configured signed-in user
- **Workspace-scoped** — all data comes from the local `.amc/` directory in your project
- **Credentials** — the eleven core tools need none. The A4 preview's `amc_a4_comment` needs the `amc approvals login` session file named by `AMC_A4_SESSION_TOKEN_FILE`, and when it is set the A4 reads verify it too. That file is a live Studio session that the agent host can read, so the server accepts only a `VIEWER`-only user's session (see A4 Forge tools)

---

## Troubleshooting

**"No agents registered"**
Run `amc init` in your project to register an agent first.

**"Could not load agent"**
Run `amc quickscore` or `amc score run` to generate the first assessment before using MCP tools.

**IDE not showing AMC tools**
1. Verify `amc` is in your PATH: `which amc`
2. Check your MCP config file path and syntax
3. Restart the IDE after config changes
4. Test manually: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | amc mcp serve`
