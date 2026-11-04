# P2-37: A4 Assemble integration claims, execution phases, effect resume rules, native-task loader, mechanic link

Recorded on 2026-10-28 on local macOS arm64 (not CI) at commit `e1699efa394f57e312bc8debfb4cd30bf96fc850`.

- `integration-claims.json` is the IntegrationClaim table the build loads from `dist/adapter-claims`, with the release record's boundary status for each path. `claude-code` reads `enforced at hook:PreToolUse`, pinned to 2.1.296. `pi` reads `enforced at pi:tool_call`, pinned to 1.0.2 and 1.0.4.
- Studio native tasks load the agent's verified prompt pack and its signed A4 context plugin into the `amc acp` child's system prompt. A real stub session's signed `system/prompt` row carries the plugin text, and Adapt Review reads it (`context.native_delivery`). In a regulated workspace, an unsigned or changed plugin, or a pack that does not verify, refuses the start.
- The mechanic link checks the TUNE seed (signed pair, scoped to the agent). It attaches an executed seed plan's results as a signed, self-reported A4 record, with each phase kept as `mechanic:<phaseId>`.
- Tests: 598/598 across 40 files, including the four P2-37 files in `tests/a4/`. Each new P2-37 test file fails at its base, where the functions it tests do not exist.
- Mutation checks (each killed, then restored): 14, listed in `receipt.json` notes.
- Not covered by a test: the end-to-end retry route and the attach route over a real deployed, tuned project. That is P2-35 scenario work.
