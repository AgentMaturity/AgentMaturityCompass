# Traces → Evidence in 10 Minutes

You already have agent traces — chat transcripts, JSON logs, observability exports. This guide turns them into AMC evidence, honestly tiered.

**The one thing to understand first:** AMC weighs evidence by how it was captured. Logs you hand it are `SELF_REPORTED` (0.4x weight — anyone can edit a log file). Runs AMC observes itself are `OBSERVED` (1.0x). Start with what you have; move to observed capture for scores you want to defend.

## Path 1 — Ingest transcripts you already have (2 minutes, SELF_REPORTED)

Works for ChatGPT/Claude/Gemini exports and generic JSON or text logs:

```bash
amc ingest ./my-traces.json --type generic_json
amc ingest ./chatgpt-export/ --type chatgpt
amc                              # rescore with the new evidence
```

Verified example (any JSON array of messages works):

```json
[{"role":"user","content":"Refund order 1234"},
 {"role":"assistant","content":"I checked order 1234 and issued the refund."}]
```

```
$ amc ingest traces.json --type generic_json
Ingested 1 file(s)
```

Supported `--type` values: `chatgpt`, `claude_console`, `gemini_ui`, `generic_json`, `generic_text`.

## Path 2 — Wrap your agent command (5 minutes, OBSERVED)

Let AMC watch a real run. Everything the process does becomes observed evidence:

```bash
amc wrap <runtime> -- <your-agent-command>
# examples
amc wrap claude -- claude -p "triage the open issues"
amc wrap any -- python my_agent.py
```

Or run through a framework adapter with a leased gateway route (15 built-ins — LangChain, CrewAI, AutoGen, Claude Code, Gemini, OpenClaw, Hermes, and more):

```bash
amc adapters detect
amc adapters run --agent my-agent --adapter hermes-cli -- hermes -z "summarize this repo"
```

## Path 3 — Stream from your observability stack (continuous, OBSERVED)

If traces already flow to an observability pipeline (OTLP, Langfuse, Helicone, Datadog, webhooks), connect Watch and let evidence accrue continuously:

```bash
amc watch connect --help      # provider-specific connection options
amc watch alerts              # live checks: cost spikes, error rates, leakage patterns
```

## Then prove it

```bash
amc                           # rescore: watch evidence coverage climb
amc bundle export --run <runId> --out evidence.amcbundle
amc bundle verify evidence.amcbundle   # anyone can verify offline
```

Readiness gates stay honest: ingested-only evidence can raise coverage but external claims stay gated until readiness reports `READY` — which requires observed, high-trust evidence. That is by design.
