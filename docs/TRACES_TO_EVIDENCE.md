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

## Import Pi v3 sessions

AMC reads Pi v3 session JSONL through the universal import command:

```sh
amc import ./session.jsonl --validate --json
amc import ./session.jsonl --json
```

The importer retains assistant errors and aborted steps, failed tool results, tool-call references, provider/model metadata, and failures on discarded branches. Structural entries remain metadata. Duplicate entry IDs and cyclic ancestry refuse the file without generic fallback. Malformed lines are counted; missing parents produce an incomplete-ancestry warning while preserving available failures. AMC does not read a fork's parent file to fill gaps.

Imports remain `SELF_REPORTED`, unsigned and unevaluated. Importing a file or signing a generated artifact does not establish that AMC observed its activity. Reports contain no maturity question/layer scores and are `UNVERIFIED`.

### Mapping contract 2

`sourceFormat.version: 3` identifies the Pi file format. `sourceFormat.mappingVersion: 2` identifies AMC's mapping contract:

- Ordinary entry, session and tool-call IDs retain their values. IDs changed by redaction become deterministic, namespace-separated SHA-256 identifiers under the reserved `pi-redacted-` prefix. Source IDs already using that prefix are remapped too, preventing collisions with generated identifiers. Parent, branch, compaction, label and tool-call references use the same mapping. These identifiers are correlation labels, not authenticity proofs or encryption.
- Summary, branch and trace metadata are derived from sanitized rows. Normalized rows and their references stay consistent; redaction never joins distinct entries under a shared `[REDACTED]` identity.
- `ProductionTrace.timestamp` is now `number | null`. Valid source ISO event times or finite, representable millisecond timestamps are retained, including an explicitly recorded zero. Missing or invalid times stay `null` and are counted in `unknownTraceTimestamps`; AMC does not replace them with the import time or epoch. A valid nested message timestamp is used when an entry timestamp is unavailable or invalid.
- `durationMs` remains `null` because Pi session entries do not record a measured execution duration.

New Watch indexes use `schemaVersion: "2026-09-08"`. Their entry `timestamp` and cluster `firstSeenAt`/`lastSeenAt` fields are ISO strings or `null`. Known event dates sort newest first, unknown dates follow in stable source order, and cluster bounds use only known dates. An all-unknown cluster has null bounds. `generatedAt` still records when AMC generated the index. Existing `2026-05-22` indexes remain readable and are not rewritten; re-import original files to regenerate previously fabricated timestamps.

`IngestionStats.avgLatencyMs` is now `number | null`: it averages finite, nonnegative measured durations over the pipeline lifetime. Unknown/invalid values are excluded; a real zero is included. Scoring skips and buffer eviction do not alter the sample history. `clear()` resets it to unknown. Consumers should display null event times and latency as “unknown”. Generic import mapping and its existing fallbacks are unchanged by this Pi correction.

## Path 2 — Wrap your agent command (5 minutes, configured capture)

Let AMC watch a real run through configured process, proxy, and tool capture paths. Activity those paths actually capture can carry observed provenance; activity outside their coverage remains unknown:

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

## Path 3 — Stream from your observability stack (continuous, source-qualified telemetry)

If traces already flow to an observability pipeline (OTLP, Langfuse, Helicone, Datadog, webhooks), connect Watch to correlate the available records. Their trust depends on capture source and custody. External imports and unattested callbacks remain self-reported; streaming a record does not establish that AMC observed the activity:

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
