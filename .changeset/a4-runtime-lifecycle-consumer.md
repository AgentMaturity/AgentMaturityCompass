---
"agent-maturity-compass": minor
---

A4 Forge now consumes P2-23's governed lifecycle and P2-26's regulatory runtime (P2-34, preview behind `AMC_A4_PREVIEW=1`).

- A deployed project at Activate consumes the runtime's change records once each, as `amc-runtime`, before the next write on it: a change P2-23 recorded as passed (inside a change envelope, or no mandatory control invalidated) is a `TUNE` from the deployed release without reopening Adapt; a change it left open (a mandatory invalidated control, or a change outside the envelope, which P2-23 suspends) is a `REOPEN` to Adapt followed by that `TUNE`.
- An active kill switch that covers the agent holds the project on the freeze path, naming the kill and its incident; `RESUME` is refused until the kill is released and then needs an owner. Break-glass never lifts an A4 hold.
- Adapt readiness gains `memory_policy_retention_floor`: BLOCKED when the memory policy's retention is below P2-26's regime floor for logs, NOT_EVALUATED when the plan cannot be read. The floors stay experimental until the D-08 experts review them.
- The agent package embeds P2-23's `AgentVersionManifest` under `versionManifest`, with the `manifestDigest` P2-23's signed row carries; a mismatch refuses the release.
- The deployment approval's effect records P2-23's activation of an approved agent naming the gate's `binding_digest` (one human decision, two records) and refuses an agent that is neither approved nor active; `RETIRE` of a deployed project retires the agent through P2-23 first.
