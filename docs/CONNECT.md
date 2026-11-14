# CONNECT

`amc connect` sets up an agent to send its work through AMC: it watches Claude Code or Codex with a hook, or writes the gateway and proxy environment for any other agent.

## Command

```bash
amc connect
amc connect --agent <agentId>
amc connect --agent <agentId> --mode supervise
amc connect --agent <agentId> --mode sandbox
amc connect --agent <agentId> --adapter claude-cli
amc connect --agent <agentId> --print-env
amc connect --agent <agentId> --print-cmd
```

## In a terminal: watch Claude Code or Codex first

Run with no `--mode`, `--adapter`, `--print-env` or `--print-cmd` in a terminal, `amc connect` first lists the coding agents you are signed in to:

```text
? What do you want AMC to watch?
❯ Watch Claude Code (signed in)
  Watch Codex (signed in)
  Another agent: write the gateway environment for it
```

Choosing Claude Code or Codex asks `Add an AMC observe hook to .claude/settings.local.json in this folder? It records Claude Code's tool calls and blocks nothing.` (`.codex/hooks.json` for Codex). On yes it installs the observe-mode hook, pointed at this folder's own running AMC; start it first with `amc up`. "Another agent" continues with the steps below. When nothing is signed in, the list is skipped.

## Output

The wizard prints:
- the gateway route, and one `source` line such as `source .amc/studio/connect/<agentId>.env`. The environment exports (`AMC_LEASE` with a 60-minute gateway lease, `OPENAI_BASE_URL`, `AMC_LLM_BASE_URL`, proxy variables) are written to that file, which only you can read (mode 0600), so the lease does not land in your terminal scrollback. Run the `source` line in the shell that starts your agent. `--print-env` prints the exports instead, and writes no file.
- recommended supervise/sandbox command
- adapter-aware one-liner when `--adapter` is provided:
  - `amc adapters run --agent <agentId> --adapter <adapterId> -- <cmd...>`
- Node snippet using `wrapFetch`
- Python snippet capturing receipt headers and trace line

The addresses use the ports this folder's AMC runs on. When the `amc` menu started this folder on its own ports, because another AMC folder holds the default ones, the route shows that folder's gateway port.

## Supervise Example

```bash
amc supervise --agent <agentId> --route http://127.0.0.1:3210/openai -- <cmd...>   # 3210 is the default gateway port
```

## Sandbox Example

```bash
amc sandbox run --agent <agentId> -- <cmd...>
```

If an agent bypasses gateway/proxy, observed evidence drops and high maturity levels are capped by gates.
