---
"agent-maturity-compass": patch
---

`amc domain pack run`: an interactive run now ends by saying the self-assessment is shown only and not stored in the workspace, with a command that keeps it (`amc domain pack run --pack <id> --json > <id>-self-assessment.json`). That command now works: with `--json`, the question lines and the prompts are drawn on stderr, so stdout carries only the JSON result. Scoring, persistence and the self-reported claim labels are unchanged.
