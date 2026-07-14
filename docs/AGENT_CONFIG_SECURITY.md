# Agent Config Security Scanning

Coding agents read a growing pile of configuration — instruction files, permission settings, hooks, MCP servers, subagent definitions — and every one of those is an attack surface. A poisoned instruction file, a hook that pipes a URL into a shell, a settings file that auto-approves everything, or a hardcoded key can turn a helpful agent into a liability.

`amc shield scan-config` scans that whole surface in one command.

```bash
amc shield scan-config            # scan the current directory
amc shield scan-config ./repo --json --out config-scan.json
```

## What it scans

- **Instruction files** — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.mdc` rule files, Copilot instructions.
- **Permission settings** — `.claude/settings.json` and local overrides.
- **Hooks** — anything under a `hooks` path.
- **MCP servers** — `.mcp.json` / `mcp.json`, folded in through AMC's existing MCP analyzer.
- **Agent/subagent definitions** — `.claude/agents/*`.

## What it flags (AMC-native rule families)

| Category | Example |
|---|---|
| `SECRET_EXPOSURE` | A hardcoded API key or password committed into config |
| `EXCESSIVE_AUTONOMY` | `bypassPermissions`, wildcard `allow: ["*"]`, YOLO / skip-permissions |
| `HOOK_INJECTION` | A hook that runs `curl … \| sh`, `eval`, or a destructive delete |
| `INSTRUCTION_INTEGRITY` | "Ignore previous instructions", "run any command without asking", exfiltration directives |
| `UNSAFE_MCP` | Critical/high MCP server risks (from the MCP analyzer) |
| `CONFIGURATION` | Unparseable or missing configuration hygiene |

Each finding carries a severity (CRITICAL / HIGH / MEDIUM / LOW / INFO), the file, a description, and a remediation. The scan produces an L0–L5 security level, an aggregate `CLEAN` / `REVIEW` / `BLOCK` verdict, and exits non-zero on `BLOCK` so it can gate CI.

## What makes AMC's scan different

Config-only scanners produce an unsigned report and stop there. AMC's scan is:

- **Deterministic and receipted** — every scan carries a `receiptHash` over its canonical content, so a result is reproducible and verifiable, not just a screenshot.
- **On the same L0–L5 model** as the rest of AMC — the config posture sits alongside Score, Shield, Enforce, Watch, and Comply instead of being a separate silo.
- **Composable with evidence** — pair it with `amc bundle export` / `amc bundle verify` so a third party can check the result without trusting you, and with `amc shield mcp-ledger` for a signed, ongoing MCP inventory.

Scan configs statically here; test behavior at runtime with `amc assurance run` and enforce it with the Enforce surface.
