# pi-ai upgrade policy (P1-38)

`@earendil-works/pi-ai` is controlled by a competitor and releases often. AMC records the exact request bytes pi-ai
builds and re-derives them later (ADR-016), so a pi-ai version is part of AMC's evidence format. These rules apply to
every change of the pin.

## Rules

1. **Exact pins only.** `package.json` `peerDependencies` names one version with no range. `PI_AI_VERSION` in
   `src/llm/providers/piAi/piAiLoader.ts` must equal it, and the loader refuses any other installed version.
2. **One reviewed bump per PR.** A bump changes the pin, nothing else in AMC's dependencies, and adds
   `docs/providers/pi-ai-review-<version>.md` with the same sections as `pi-ai-review-1.3.0.md`: integrity, licence,
   tree size, install scripts, audit, network at import and telemetry default.
3. **A new version is a new encoder.** Bump `PI_AI_ENCODER_VERSION` in `piAiEncoder.ts` in the same PR, even when the
   contract tests still pass. Requests recorded under the old encoder version re-derive only with the old pi-ai
   installed; without it they report `unreconstructable`, never `reconstructed`. Say so in the changeset.
4. **No automatic merges.** Dependency bots may open a PR for pi-ai, but a person merges it after the checks below.
   Do not add pi-ai to any auto-merge rule.
5. **Telemetry stays off.** If a new version sends telemetry or contacts the network by default, AMC must disable it
   in the loader or refuse the version.
6. **The engines floor is checked.** Update `PI_AI_NODE_FLOOR` to the new `engines.node`. AMC's own `engines.node`
   changes only through D-12.

## Checks each bump reruns

```
pnpm install --frozen-lockfile && pnpm run build
npx vitest run tests/piAi tests/nativeCapabilityContract.test.ts tests/capabilityMatrix.test.ts
npm run gen:capability-matrix && npm run check:capability-matrix
npm run audit:runtime && npm run check:third-party-notices && npm run check:packed-install
npm run typecheck && npm run typecheck:tests && npm run lint
```

The contract tests must still prove, for every allowlisted provider:

- the bytes the fixture server receives equal the bytes the signed header commits to;
- the encoder's bytes equal what pi-ai's own send path transmits through its `fetch` option;
- `onPayload` still runs before any request is sent (otherwise the encoder refuses);
- missing usage stays unreported, and unproven features are refused before a header exists.

A capability that a test newly proves may change from `unknown` to `supported` only in the same PR as that test.
