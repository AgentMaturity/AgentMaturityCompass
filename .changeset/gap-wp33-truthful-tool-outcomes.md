---
"agent-maturity-compass": patch
---

Native tool outcomes are now reported truthfully, and loop observers can no longer corrupt a turn (WP33).

- A tool body that does not state `ok` is recorded as a failed call, never as a success by default. Every built-in body now sets it: the unconfined `bash` path reports `ok: false` for a nonzero exit or a timeout (as the confined path already did), and both paths append `[amc: exit N]` to the model-visible output. Refused `delegate` and `workflow` calls, a workflow with a failed or cancelled node, and a ToolHub `http.fetch` with a non-2xx status are failures too.
- Tool arguments are validated against the tool's published JSON schema (with the same Ajv validator the MCP client uses) before entry, approval and guards. An invalid call is a recorded `ERROR` naming the schema path, and nobody is asked to approve it. The `fs.read` and `bash` schemas now state the bounds their bodies enforce (`maxBytes` ≤ 10,000,000; `timeoutMs` ≤ 600,000).
- A response that stops at `max_tokens` with a tool call in it no longer ends the turn silently: the model gets a signed inbox notice naming the calls that were cut off and not run, and the turn continues so it can reissue them. Dropped tool calls are no longer projected into later requests, which previously made every later request in the session unassemblable.
- A loop observer (`notify`) that throws is reported on stderr and cannot skip a `step/end`, a turn seal or a wake.
- A tool's `concludesTurn` now ends the turn only when every call in the step concludes.
- Unhandled rejections and uncaught exceptions in the CLI write a bounded diagnostic (stack, cause chain, AggregateError members) to `.amc/diagnostics/` (or a per-user `amc-diagnostics-<uid>` temp directory outside a workspace), print its path and exit 1. Secrets are redacted first; the directory must be a real 0700 directory owned by the user (a planted symlink or shared directory is refused), and the file is created exclusively without following links.
