---
"agent-maturity-compass": minor
---

Source-driven work, slice 1: `amc integrations source init|sign|verify|observe|check|admit|status`. A GitHub `issue_comment` or `issues` event payload becomes a `SourceObservation` (deterministic id, redacted and capped body, mentions found outside code, quotes and comments). A signed source policy (`.amc/integrations/sources.yaml`, `admission: off` by default, senders by user id and login, bots refused) admits an explicit mention by an allowed human as one approval request for the source's existing signed work order, with a quorum floor of one human approval. `check` decides without storing or filing, for CI. No model call, no network, no sending; the polling adapter and the journaled reply are not in this slice (docs/SOURCE_INTAKE.md).

The Gemini CLI adapter now has a claim manifest (`docs/adapters/manifests/gemini-cli.json`): `AfterTool` observed, `BeforeTool` listed as not covered (advisory deny only, no session registration, no qualified version), so the generated support matrix names every provider the hook installer accepts.

freeze-exception: SH-INTEG — amc integrations source init|sign|verify|observe|check|admit|status (source observations, signed admission policy, proposals for human approval)
