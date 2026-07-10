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
Certification: pending
Risk Tier: high
Last Assessed: 2026-02-27T09:00:00.000Z

Dimensions:
  • Tool Use Safety: L3 — Defined (3/5)
  • Instruction Following: L4 — Managed (4/5)
  • Evidence & Auditability: L2 — Developing (2/5)
  • Context & Memory Management: L3 — Defined (3/5)

Top Priority: Improve Evidence & Auditability from L2 to L3
  → `amc guide --agent my-agent`
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
Input:  { packId: string, responses: Record<questionId, level 1-5> }
Output: { percentage, level, certified, complianceGaps }
```

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
- **All tools are read-only** — no tool modifies agent configs, runs diagnostics, or writes files
- **Workspace-scoped** — all data comes from the local `.amc/` directory in your project
- **No credentials required** — AMC MCP needs no API keys or authentication

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
