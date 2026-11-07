# Tool output secret redaction

Every tool a native agent session runs (`bash`, `fs.read`, `grep`, `glob`,
`job_output`, `terminal_read`, `session.spill_read`, every MCP tool, every
reviewed extension tool) has its output filtered before the outcome exists.
Secrets that the shared `SECRET_PATTERNS` recognise (cloud and provider API
keys, GitHub, Slack and Stripe tokens, private-key blocks, Basic credentials,
secret-named markup values) are replaced by `[AMC_REDACTED:<type>]`. The filter
runs on the pipeline's output stage (`src/shield/redaction/toolOutputRedaction.ts`,
composed in `src/agent/agentToolset.ts`), so the model, the signed `tool/result`
row, any spill file, the receipts and evidence all see the placeholder and never
the value. A body that throws has its message filtered the same way, because a
confined shell's failure text quotes its stderr.

What is recorded: one `TOOL_OUTPUT_REDACTED` audit row per call that was
redacted, carrying the tool name, class and counts by secret type. Never the
text, and never the offsets.

Order with protected-data tokenisation (P2-02, `redactingSession`): that pass
runs when the session commits the row, after this filter, so it sees
placeholders where credentials were and tokenises only the declared protected
fields that remain. A placeholder inside a JSON string value keeps a declared
result exact JSON, so declared-field tokenisation still applies.

Write-back protection: a model that copies redacted text back into a file would
write the placeholder over the real value. `fs.write` and `fs.edit` refuse content
(or a replacement) that contains `[AMC_REDACTED:`, and the refusal names why.

## Limits

- Pattern-based. A secret that no pattern recognises (a random password, an
  unprefixed token) is not redacted. The same patterns govern `web_fetch`
  results, `fs.edit` diffs and the bridge rows, so the coverage is the one
  table in `src/shield/redaction/secretPatterns.ts`.
- Per result. `job_output` and `terminal_read` return byte ranges of a stream;
  a secret split across two reads is not recognised in either, and the raw job
  and terminal buffers themselves are not redacted. The confined shell's own
  `scrubValues` (the lease token, the egress proxy token) are removed at the
  process boundary regardless.
- Output only. Arguments the model sends are not redacted by this filter; the
  injection matcher and the argument guards cover that direction.
- The filter is composed in `agentToolset`, which every native surface (CLI,
  SDK, ACP, Studio native tasks, delegated children) uses. ToolHub and
  hook-control planes have their own output paths and are not covered here.
