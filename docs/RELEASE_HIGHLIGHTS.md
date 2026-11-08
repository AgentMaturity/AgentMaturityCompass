# RELEASE_HIGHLIGHTS.md — What’s new in AMC

This page exists to show momentum without making users read the entire changelog.

## What this page should do
- surface recent improvements
- link to deeper release notes/changelog
- help visitors see that AMC is active

## Current highlights
- Industry Packs are free in the current source build (unreleased; the next release is 2.0.0): all 41 packs' questions and runs need no licence, account or payment ([ADR 019](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/adr/019-industry-packs-free.md)). The published 1.1.1 release still asks for a licence. Pack results stay self-reported questionnaires whose content is experimental, and access never changes a result
- A4 Forge preview, in the current source build only: one agent from a brief to a recorded, customer-controlled deployment in four gated stages (Aspire, Assemble, Adapt, Activate), off unless the operator sets `AMC_A4_PREVIEW=1` ([A4 Forge](A4_FORGE.md)). Its records are signed and self-reported, never a statement that the agent is safe, correct or lawful
- Explicit provider-native signed control for Claude Code and Gemini CLI: observe by default, opt into loopback-only Enforce decisions backed by existing signed policies and receipts
- Least-privilege Studio module API authorization: route-level viewer, operator, approver, auditor, and owner boundaries replace the former shared human-role gate
- Domain Proof API containment: inline schema-validated checks, realpath-confined deprecated fixtures, bounded errors, and no caller-selected server writes
- Evidence-readiness contract across CLI, Studio, lifecycle artifacts, report sharing, and executive briefs: `VALID` proves artifact integrity, while `READY` governs claim eligibility
- Unified AMC visual identity across the website, Studio, desktop launchers, Docs, CLI output, and GitHub README
- 244-question default diagnostic bank with a 264-question lifecycle-expanded option
- <!-- amc:count:cliCommandPaths -->1,272<!-- /amc:count --> generated CLI command paths in the public command inventory
- Domain Proof Lane with `amc proof check`, `amcproof` artifacts, and fail-closed correctness status
- Watch/Fleet evidence upgrades: session correlation, risk/cost/latency SLOs, incident-to-regression closure, fleet overview, and trust graph export
- <!-- amc:count:assurancePacksRegistered -->143<!-- /amc:count --> registered assurance packs, <!-- amc:count:adapters -->16<!-- /amc:count --> adapters, 41 Industry Packs, API/OpenAPI docs, and Studio/browser/docs paths refreshed around the same eight AMC surfaces

## Good future format
For each release/month:
- what changed
- why it matters
- who it helps
- where to learn more

## Related files
- `CHANGELOG.md`
- `docs/COMMUNITY_SHOWCASE.md`
- homepage release highlights block
