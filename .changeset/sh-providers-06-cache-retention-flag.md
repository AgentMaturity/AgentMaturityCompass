---
"agent-maturity-compass": minor
---

SH-PROVIDERS-06: `--cache-retention short|long` on `agent-loop run` and `chat`, `acp` and the schedules runner (`cacheRetention` in the SDK) sets the route's prompt-cache retention, which the registry already committed into each signed `request/header` and encoded through the retention encoder versions (`anthropic-messages@5` 1h TTL, `openai-chat@5` and `openai-responses@4` `prompt_cache_retention`). It is admitted only for `anthropic`, `openai` and `openai-responses`; every other route refuses it before a row exists.

freeze-exception: SH-PROVIDERS — a new flag on existing native commands, asked for by the harness program.
