# GAP-0592 source review: Reflexion-agent live score and behavior drift alerts

Gap: `GAP-0592` / P0 / Agent evaluation and benchmarks  
Dimension: `obs-live-drift-alerts`  
Surfaces: Score, Shield, Watch  
Source: <https://github.com/faveos8758/reflexion-agent-ts>

## Live source verification

Verified against GitHub metadata on 2026-06-20:

- Repository: `faveos8758/reflexion-agent-ts`
- Default branch: `main`
- HEAD: `a6e80ddbbaf1459db5dbd8ac1ff2f3bf51237c2f`
- Recursive tree: 34 entries, not truncated
- License: MIT (`LICENSE@14fac913ccf80234b1848540089a3bbcb6e5283d`)
- Key metadata blobs:
  - `README.md@391609479c7191463a148dbc614a7d18e06e3ddb`
  - `package.json@1c13449b10dece28b65c7e93411b155535ca435c`
  - `src/reflexion/ReflexionAgent.ts@7dfbab093b20d2cfc02c7bbf7345fb1a3ad56e1a`
  - `src/reflexion/evaluator.ts@c4334e74eeb48f320a77ee44cce370ccb47e808f`
  - `src/reflexion/types.ts@4ef461c938a1471cd4c9617b2532f6e24d27c68d`
  - `src/reflexion/memory/in-memory.ts@ba487e3e61aa62d58c88fd1737d2af856661c629`

## Relevance decision

Relevant, but only as a metadata-grounded mapping into AMC's existing Watch live-drift primitive. The source implements an evaluator-centered Reflexion loop: execute, evaluate, reflect, store feedback, retry, and report success/attempts/feedback history. That maps to AMC's existing live score and behavior drift alerts without importing upstream code or creating a new subsystem:

- Score: per-trace evaluator score/pass state is normalized into AMC `score0to1` and `passed` fields.
- Watch: baseline/live windows use `runLiveScoreBehaviorDrift` and emit standard watch alerts.
- Shield: metadata-only proof gates require evaluator policy, memory/reflection policy, signed evidence refs, and no-source-copy proof before a drift receipt can be non-alerting.

Not implemented as a standalone Reflexion runner, benchmark harness, or source-code copy. The integration only adds a thin typed adapter around existing live drift receipts.

## Claim boundary

The AMC adapter requires repository metadata, blob SHAs, policy hashes, row evidence, signed evidence, and no-source-copy proof. Missing metadata fails closed with `reflexionAgentEvidenceCoverage0to1` even when generic score drift is stable.
