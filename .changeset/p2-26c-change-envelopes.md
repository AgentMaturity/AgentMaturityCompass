---
"agent-maturity-compass": minor
---

Change envelopes (P2-26 slice C, experimental): an agent's model, prompt, tool, policy and corpus versions can be pinned in a signed envelope approved as a P2-24 bound record (`change-envelope`), with pre-declared changes that each name the tests that must pass first. At native session open the live manifest is compared with the agent's newest envelope: identical or inside it with passing test results is allowed; anything else is refused in a regulated workspace and warned elsewhere, and both record `AGENT_REASSESSMENT_REQUIRED`, which opens an incident. A model with no provider-reported version is marked unpinned. AMC claims no FDA or other conformity for envelopes.
