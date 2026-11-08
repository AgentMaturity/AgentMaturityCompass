---
"agent-maturity-compass": minor
---

Source-driven work, slice 1: `amc integrations source init|sign|verify|observe|check|admit|status`. A GitHub `issue_comment` or `issues` event payload becomes a `SourceObservation` (deterministic id, the payload's `sender` as actor, refused unless sender and author agree on user id and login, so a non-author edit never counts; redacted and capped body, mentions found in the text GitHub renders: code, HTML, quotes and comments stripped). A signed source policy (`.amc/integrations/sources.yaml`, `admission: off` by default, senders by user id and login, bots refused, a canonical `agentId`) admits an explicit mention by an allowed human as one approval request for the source's existing signed work order, filed under the strictest class the work order allows, with every allowed class's approval count, distinct-user rule and roles in its quorum floor and at least one human approval. `check` decides without storing or filing, for CI, and verifies the bound work order as `admit` does. No model call and no reply is posted; the only network is the approval-request notification `admit` hands to the lifecycle delivery when a signed `integrations.yaml` routes it. The polling adapter and the journaled reply are not in this slice (docs/SOURCE_INTAKE.md).

The Gemini CLI adapter now has a claim manifest (`docs/adapters/manifests/gemini-cli.json`): `AfterTool` observed, `BeforeTool` listed as not covered (advisory deny only, no session registration, no qualified version), so the generated support matrix names every provider the hook installer accepts.

freeze-exception: SH-INTEG — amc integrations source init|sign|verify|observe|check|admit|status (source observations, signed admission policy, proposals for human approval)
