# GAP-0596 source review: shipfastlabs/pest-plugin-evals

Date: 2026-06-20
Worktree: `/Users/sid/AgentMaturityCompass-worktrees/gap-0596`
Branch: `agent/gap-0596`

## Relevance decision

Relevant to AMC, narrowly, as a high-level eval-replay-corpus signal for the existing Score, Shield, and Watch surfaces. It is not an AMC dependency and does not justify a new Laravel/Pest importer, standalone subsystem, copied upstream fixtures, or source-specific replay engine.

Rationale: the live repository is a PestPHP/Laravel AI SDK evaluation plugin. Its public surface shows agent eval tests, deterministic expectations, LLM-as-judge scoring, semantic/factual/safety/relevance scorers, repeat sampling, faked responses, an eval report, and GitHub Actions CI. Those map directly to AMC's existing replay-benchmark/eval-pack primitives: replay manifest, fixture hash, deterministic seed, scorer/judge config, result manifest, score delta, signed evidence refs, CI/lifecycle receipt, and Watch fail-closed alerting. Repository metadata or README claims alone remain insufficient.

## AMC/8 surface check

| AMC surface | Relevance | Handling |
|---|---:|---|
| Score | Yes | Candidate vs baseline eval-pack scores may affect score only when backed by signed replay rows, fixture hashes, score deltas, and result manifests. |
| Shield | Yes | Safety/relevance/factuality/judge criteria claims require scorer/judge configs, deterministic policy hashes, trace evidence, and no-copy/no-config-only boundaries. |
| Enforce | No direct GAP scope | No enforcement policy changes were needed. |
| Vault | No direct GAP scope | No secrets or protected data were imported. |
| Watch | Yes | CI/lifecycle failures and replay regressions surface as fail-closed Watch alerts via the existing replay benchmark receipt path. |
| Comply | Indirect only | License/provenance is documented; no compliance module changes needed. |
| Fleet | No direct GAP scope | No fleet inventory behavior changed. |
| Passport | No direct GAP scope | No passport/export behavior changed. |

## Live source metadata verified

Source: `https://github.com/shipfastlabs/pest-plugin-evals`

Verified with GitHub API, `git ls-remote --symref`, and an isolated shallow clone to `/tmp/pest-plugin-evals-gap-0596`.

- Repository: `shipfastlabs/pest-plugin-evals`
- Description: PestPHP plugin for evaluating Laravel AI SDK agents with LLM-as-judge, semantic similarity, and deterministic scorers
- Visibility: public
- Archived/disabled: false/false
- Default branch: `main`
- HEAD: `dadb27cadb6e6447c60c0d7410a9ae10db24fd5b`
- Root tree: `0698885eaec66fbb664b1f01370d1925eae551fb`
- License: MIT (`LICENSE.md` blob `ba66af070720e5d5897d86f8665cbff0f54dd518`)
- Root `README.md` blob: `779fd0e35ba252770553aff6a28a50350d4e1387`
- Root `composer.json` blob: `3ab23299bb30102c41d17ccf30c053a56d48e242`
- `src` tree: `f6556aabf6df50540f8c3d7514c6027aa57a3924`
- `tests` tree: `0ba5bbf74213134e6accb4f484320c47ea90b8a6`
- `.github/workflows/tests.yml` blob: `271f99ea34090afe7dc331442eba77a187007945`
- `src/Eval` tree: `ee8f97260e3b7812a2986e4c5fd8fa05b6265ea8`
- `src/Scorers` tree: `ef0c643aefe9a8763fc17909e4690b53628c5dbe`
- `tests/Evals` tree: `9a311da4c6417d4198e25e84bc78159142391a1f`
- GitHub metadata at review time: 12 stars, 1 fork, pushed `2026-06-20T07:32:10Z`, updated `2026-06-15T08:06:00Z`

## AMC-native closure

- Reused the existing `runReplayBenchmarkCorpus` / `verifyReplayBenchmarkCorpusReceipt` primitives instead of adding a Pest-specific importer or copying upstream artifacts.
- Added regression coverage in `tests/pestPluginEvalsReplayCorpus.test.ts` showing a Pest-style eval pack is replayable only when it has:
  - AMC-owned eval fixture and deterministic seed
  - fixture and manifest hashes
  - baseline/candidate signed evidence refs
  - scorer/judge criteria/config hashes
  - agent trace and result/analysis hashes
  - score delta and replay pass-rate gates
  - CI/lifecycle receipt and Watch fail-closed behavior
- Added a metadata-only negative case proving source URL, repository snapshot, and a few local scores cannot satisfy Score/Shield/Watch proof without signed rows, replay command, dataset/eval-pack, trace, result, and CI receipt evidence.

## Copy/provenance boundary

No upstream code, commands, composer snippets, PHP examples, dataset rows, prompts, outputs, README prose, docs prose, screenshots, package metadata, or generated results were copied into AMC. The source was used only for live metadata verification and high-level proof-shape mapping.

## Integration instructions

For a real AMC user-owned Laravel/Pest eval pack to count as replay evidence, submit it through the existing replay benchmark corpus path with signed ledger evidence for both baseline and candidate rows, deterministic fixture hashes, judge/scorer config hashes, result manifests, replay command hashes, and a CI/lifecycle receipt. Metadata-only repository references must remain fail-closed.
