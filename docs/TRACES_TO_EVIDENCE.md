# Traces → Evidence in 10 Minutes

You already have agent traces — chat transcripts, JSON logs, observability exports. This guide turns them into AMC evidence, honestly tiered.

**The one thing to understand first:** AMC labels evidence by how it was captured. Logs you hand it are `SELF_REPORTED` (anyone can edit a log file); they can support a question's level up to L1 at most. Runs AMC observes itself are `OBSERVED`, the only kind that can support L2 and above. Side scores such as confidence weigh evidence by the one table in `src/score/trustWeights.ts` (self-reported 0.4, observed 1.0); no weight is applied to a level. Start with what you have; move to observed capture for scores you want to defend.

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

## Import Claude Code, Codex and ATIF sessions

`amc import` also reads three session formats other tools write:

| Format | What it is | Status |
| --- | --- | --- |
| Claude Code transcript | The JSONL file Claude Code keeps for each session (a hook names it `transcript_path`) | Experimental: Anthropic has not published the line format, so AMC infers its fields |
| `codex exec --json` | The event stream Codex prints with `--json` | Documented events; `aggregated_output` and `exit_code` are read from the Codex source |
| ATIF | A trajectory file (`schema_version` "ATIF-v1.x") from the Harbor RFC | Documented; it has no error field, so tool outcomes stay unknown |

```sh
amc import ./session.jsonl --dry-run      # see what AMC would record
amc import ./session.jsonl                # record it
amc import ./session.jsonl --keep-text    # also keep the text (cut at 4,000 characters) and the file
```

What to expect:

- Every row is self-reported and imported. It carries the file's SHA-256 and the format name. AMC did not watch it happen.
- The agent is the one you name (`--agent`), never one the file names. Nothing in the file sets a trust level, a decision or a session label. A time later than the import becomes the import time, and the import says so.
- Prompt, reply and tool text is kept only as SHA-256 digests unless you pass `--keep-text`. Without it, the file itself is not kept either.
- Each line is read on its own. A line that is not JSON, is longer than 1 MiB, or comes after the first 50,000 records is counted and skipped.
- Importing the same file again for the same agent adds nothing.
- AMC never opens a path written inside the file. A link in the folder you name that points elsewhere is not read.
- Failed tool calls go into the Watch failure index with the step they happened at. Where an AMC rule matches, an entry carries a MAST failure-mode label (from "Why Do Multi-Agent LLM Systems Fail?", arXiv 2503.13657v3) with the rule's name. Two rules exist today: the same call three times in a row (FM-1.3, step repetition) and a session that ends on a failed step (FM-3.1, premature termination). A label is a label, not a finding.

## Path 2 — Run your agent command through an adapter (5 minutes, configured capture)

Let AMC watch a real run through configured process, proxy, and tool capture paths. `amc adapters run` mints a lease and routes model traffic through the gateway. Activity those paths actually capture can carry observed provenance; activity outside their coverage remains unknown:

```bash
amc adapters run --agent my-agent --adapter <adapter-id> -- <your-agent-command>
# examples
amc adapters run --agent my-agent --adapter claude-cli -- claude -p "triage the open issues"
amc adapters run --agent my-agent --adapter generic-cli -- python my_agent.py
```

The built-in adapters cover LangChain, CrewAI, AutoGen, Claude Code, Gemini, OpenClaw, Hermes and more; `amc adapters list` names them:

```bash
amc adapters detect
amc adapters run --agent my-agent --adapter hermes-cli -- hermes -z "summarize this repo"
```

`amc wrap` still runs but is deprecated; use `amc adapters run`.

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
amc bundle verify evidence.amcbundle --pubkey <recorded-auditor.pub> --expect-monitor <recorded-monitor-sha256>   # anyone can verify offline with the recorded keys
```

Readiness gates stay honest: ingested-only evidence can raise coverage but external claims stay gated until readiness reports `READY` — which requires observed, high-trust evidence. That is by design.
