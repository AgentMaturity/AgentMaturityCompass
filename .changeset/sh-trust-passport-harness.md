---
"agent-maturity-compass": minor
---

An AGENT-scoped passport carries a signed harness companion, `harness/harness.json` + `harness/harness.sig` (SH-TRUST-05): the agent's provider route and declared models, tool names, action classes, MCP servers and tools-catalogue digest, every signed config file's digest and signature status, the newest sealed, provenance-gated assurance report and the newest signed red-team run (run id, report sha256, session id, score), and the workspace's sealed native session count; everything not recorded is null and named in `unknown`. Values come only from signature-verified files and gated readers. `passport.json` is unchanged (`v: 1`), so older verifiers still verify new passports; `amc passport verify` checks the companion's signature and its digest binding to `passport.json` (`HARNESS_SIGNATURE_INVALID`, `HARNESS_BINDING_MISMATCH`) and returns it as `harness`.

freeze-exception: SH-TRUST — Sid asked for passport export of model, tools, policies and scores; no new command.
