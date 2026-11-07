---
"agent-maturity-compass": minor
---

`amc agent-loop run` for scripts and CI (SH-UI-01): the prompt can come from stdin (`-`, or a piped stdin with no positional prompt; 10 MiB bound, refused over it); `--output-format text|json|stream-json` (`--json` stays the alias of `json`); `stream-json` writes one JSON event per line on stdout (`system/init`, the loop's live notifications, provisional `text_delta`, each newly committed row as an authenticated `update` in ACP's shape with `seq`/`eventId`/`eventHash`, and a terminal `result` or `error`), through the same row authentication ACP applies. The exit code now follows the execution contract: 0 complete with settled side effects, 1 failed or refused, 3 cancelled or interrupted, 4 `max_steps`/`max_tokens`, 5 `blocked`, 6 completed with unsettled side effects (`docs/NATIVE_HEADLESS.md`). `agent-loop chat` reads 3 to 6 from its turn child as "completion not established". No new command: no freeze exception needed.
