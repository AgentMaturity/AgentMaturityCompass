> **Archived — historical, not current behaviour.** It may describe removed commands, simulated personas or unmeasured numbers. Do not cite it as evidence.

# CLI Wrappers

`amc wrap` can run any local agent CLI while capturing tamper-evident process evidence (stdout/stderr/start/exit) and forwarding telemetry to AMC Bridge.

## Generic

```bash
amc wrap --agent-token ./agent.token --provider generic --bridge-url http://127.0.0.1:3212 -- node my-agent.js
```

## Claude CLI

```bash
amc wrap --agent-token ./agent.token --provider claude --bridge-url http://127.0.0.1:3212 -- claude
```

## Gemini CLI

```bash
amc wrap --agent-token ./agent.token --provider gemini --bridge-url http://127.0.0.1:3212 -- gemini
```

## OpenClaw CLI

```bash
amc wrap --agent-token ./agent.token --provider openclaw --bridge-url http://127.0.0.1:3212 -- openclaw
```

## What Gets Captured

- `agent_process_started`
- `agent_stdout`
- `agent_stderr`
- `agent_process_exited`

Captured content is redacted, stored as evidence blobs, and referenced by hashes/receipts.

## Honesty Rule

If a wrapped CLI does not route model calls through AMC Bridge, AMC still records process evidence but model-call evidence remains partial and cannot inflate maturity claims.
