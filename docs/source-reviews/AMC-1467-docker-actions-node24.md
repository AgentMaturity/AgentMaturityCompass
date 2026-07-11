# AMC-1467 - Docker Actions native Node 24 runtime

- Gap: `AMC-1467`
- Dimension: release reliability, CI runner compatibility, supply-chain hygiene
- AMC surfaces requested: release/CI gates only
- Sources reviewed: GitHub Actions annotation; official Docker Metadata Action and Setup Buildx Action repositories and releases
- Retrieval: live primary-source review on 2026-07-11
- Status: Implemented; local verification passed, remote publication verification pending

## Relevance decision

This warning is relevant to AMC's existing release and CI gates. GitHub Actions run `29145382714` passed but reported that `docker/metadata-action@v5` and `docker/setup-buildx-action@v3` target deprecated Node.js 20 and were being forced onto Node.js 24. Leaving those majors in place would make AMC depend on a temporary runner compatibility override.

The official `docker/metadata-action` v6.2.0 release and its v6 ref were reviewed at commit `dc802804100637a589fabce1cb79ff13a1411302`. The official `docker/setup-buildx-action` v4.2.0 release and its v4 ref were reviewed at commit `bb05f3f5519dd87d3ba754cc423b652a5edd6d2c`. Both action manifests declare `runs.using: node24`, and both major release notes require Actions Runner v2.327.1 or later. Setup Buildx v4 removes deprecated inputs and outputs; AMC does not use any of them.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring or methodology change. |
| Shield | Removes reliance on a deprecated action runtime override; no Shield feature changed. |
| Enforce | No runtime policy or enforcement behavior changed. |
| Vault | No secret, key, or storage behavior changed. Existing GitHub token handling is preserved. |
| Watch | No product monitoring behavior changed. Workflow annotations provide release evidence only. |
| Fleet | No agent orchestration or fleet behavior changed. |
| Passport | No receipt or trust-token format changed. |
| Comply | Improves release maintenance evidence; no compliance mapping or claim changed. |

## Product closure

Every AMC reference to `docker/setup-buildx-action@v3` now uses `docker/setup-buildx-action@v4`, and the one `docker/metadata-action@v5` reference now uses `docker/metadata-action@v6`. The Docker runner workflow retains the same registry, image name, tag rules, labels, Buildx cache, GHCR login, push condition, and smoke tests. The tagged release workflow retains the same release contract and uses no removed Setup Buildx fields.

A repository regression test parses all workflow YAML, inventories Docker action references, rejects the deprecated majors, and locks the existing Docker metadata/publication inputs.

## Fail-closed rule

The regression fails if either deprecated major returns, if an additional unreviewed Buildx or Metadata Action reference appears, if workflow YAML stops parsing, or if the Docker runner metadata and publication bindings drift. Remote closure requires the exact-head Docker Runner Image workflow to pass with no Node.js 20 action annotation.

## No-bloat boundary

No AMC runtime Node requirement changed. No package dependency, Docker image name, tag, label, build context, cache contract, release flow, product module, API, CLI, methodology, or product surface was added or changed. No upstream action code, configuration, examples, or prose was copied.

## Verification

- Expected-red TDD run failed on both Buildx v3 references, the Metadata v5 reference, and the missing evidence record.
- Focused regression passed: 1 file / 3 tests.
- Typecheck passed.
- Full Vitest passed: 1,064 files / 8,396 tests.
- The focused regression parsed every workflow YAML file and verified the preserved Docker metadata/publication contract.
- Docs drift, diff, and exact-head remote workflow results are pending.
