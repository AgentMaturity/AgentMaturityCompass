---
"agent-maturity-compass": minor
---

After a regulated A4 Adapt activates its compiled plan, every new session in the workspace is held until a signed destination registry matches that plan, and nobody was told why or given a way to write one. Studio's native task start (Run a task, and fork) now runs the same storage admission check before it writes a task descriptor, so a refused start uses no task slot, and answers `409 NATIVE_RESIDENCY_REFUSED` with the reason in words and the decision's fixed `reason` and `detail` codes. A4 Build refuses the same way before it writes anything, and the A4 panel names the reason instead of the resume loop; `amc agent-loop run` reports it instead of the lease refusal. New commands: `amc residency init --file <registry.yaml>` validates an operator-written registry with the existing schema and writes and signs it (owner mode), `amc residency status` says what is missing without evaluating a route, and `amc residency profile --out <file>` writes the deployment profile the active plan pins from the A4 project that compiled it. The Adapt card says, before activation, when the workspace has no registry that verifies. No residency decision, exemption, approval rule or quorum changed.

freeze-exception: LIVE-UX — a person held by an active plan had no command to write the destination registry it requires; three new `amc residency` commands.
