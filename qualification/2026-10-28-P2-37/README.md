# P2-37: A4 Assemble integration claims from adapter manifests, execution phases, effect resume rules

Recorded on 2026-10-28 on local macOS arm64 (not CI) at commit `b3102b613c3e748e78b44e46d52f67ca04c56eea`.

- `integration-claims.json` is the IntegrationClaim table the build loads from `dist/adapter-claims`. `claude-code` reads `enforced at hook:PreToolUse`, pinned to 2.1.296. `pi` reads `enforced at pi:tool_call`, pinned to 1.0.2 and 1.0.4. Both carry the SHA-256 of their P1-23 and P1-22 qualification records.
- Tests: 182/182 across 16 files. These include `tests/a4/p237IntegrationClaims.test.ts` (7) and `tests/a4/p237PhasesAndRetry.test.ts` (6). Both new files fail at base `8494d9644`, where the functions they test do not exist.
- Mutation checks (each killed, then restored):
    - the claim ignores manifest problems;
    - the adapter-name check is skipped;
    - the hook-role check is dropped;
    - the signed ACTION_STATE lookup is dropped;
    - an applied effect may retry;
    - any completed head may retry.
- Not done:
    - the Studio native-task loader for the signed prompt pack and the Adapt context plugin. It is a platform seam in `src/studio/nativeTask*.ts` and `src/prompt/agentPromptProfile.ts` that the spec requests from its owner;
    - the Mechanic write link beyond the v1 `TUNE` seed.
- Not covered by a test: the end-to-end retry route over a real A4 effect chain. That is P2-35 scenario work.
