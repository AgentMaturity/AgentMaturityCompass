# REV_DEVOPS_ENGINEER Handoff - Docker Quickstart GHCR Boundary P2 2026-06-16

Closed Liam's unverified quickstart container claim.

Operational change:
- README now uses local quickstart image build/run commands.
- Publishing docs require package visibility verification before public GHCR run commands are published.
- The docs no longer imply a public quickstart image exists solely because source Docker assets exist.

Verification:
- `tests/deploymentPack.test.ts`: PASS, 11 tests.
- Linear: AMC-1061.

Caveat:
- This is a docs/distribution boundary fix, not a registry publish. Verify package page visibility and anonymous pull before restoring any public GHCR install command.

---

# REV_DEVOPS_ENGINEER Handoff - Pulumi Helm Release P2 2026-06-16

Closed Liam's "No Pulumi module" gap with a provider-agnostic Pulumi Helm-release example.

Assets:
- `deploy/pulumi/helm-release/`: Pulumi Node.js project deploying `deploy/helm/amc` through `k8s.helm.v3.Release`.
- `docs/KUBERNETES_HELM_DEPLOYMENT.md`: Pulumi commands and secret-state boundary.
- `docs/CLOUD_REFERENCE_ARCHITECTURES.md`: points Kubernetes IaC users to Terraform or Pulumi Helm-release examples.

Verification:
- Official Pulumi Helm Release/config/provider docs checked on 2026-06-16.
- `npx vitest run tests/pulumiHelmRelease.test.ts tests/cloudReferenceArchitectures.test.ts tests/deploymentPack.test.ts tests/openapiWebhookSchemas.test.ts --reporter=dot`: PASS, 4 files / 18 tests.

Operational caveat:
- The Pulumi example manages the Helm release only. Bootstrap secret literals must stay in a provider secret manager, sealed-secrets, External Secrets Operator, or secure pipeline.

---

# REV_DEVOPS_ENGINEER Handoff - Cloud Reference Architectures P2 2026-06-16

Closed Liam's provider-specific self-hosted cloud architecture gap.

Assets:
- `docs/CLOUD_REFERENCE_ARCHITECTURES.md`: AWS ECS/Fargate or EKS, GCP Cloud Run or GKE, and Azure Container Apps or AKS patterns.
- `website/openapi.yaml`: self-hosted `https://{host}/api` server template.
- `docs/KUBERNETES_HELM_DEPLOYMENT.md`: now points to cloud references and no longer says AWS/GCP/Azure refs are future work.

Verification:
- External provider docs checked on 2026-06-16 for AWS, GCP, and Azure.
- `npx vitest run tests/cloudReferenceArchitectures.test.ts tests/deploymentPack.test.ts tests/openapiWebhookSchemas.test.ts --reporter=dot`: PASS, 3 files / 16 tests.

Operational caveat:
- Pulumi and an AMC-operated hosted SaaS endpoint remain open. The new guide is a self-hosted architecture reference, not a managed cloud service.

---

# REV_DEVOPS_ENGINEER Handoff - Kubernetes Helm Deployment P2 2026-06-16

Closed Liam's Kubernetes/Helm deployment-guide gap.

Assets:
- Helm chart: `deploy/helm/amc/`.
- Raw Kustomize manifests: `deploy/k8s/`.
- Terraform Helm-release example: `deploy/terraform/helm-release/`.
- Operator guide: `docs/KUBERNETES_HELM_DEPLOYMENT.md`.

Verification:
- `npx vitest run tests/deploymentPack.test.ts --reporter=dot`: PASS, 10 tests.

Operational caveat:
- Bootstrap secrets must be created through a secure secret workflow before Helm/Terraform install. The Terraform example deliberately avoids putting secret literals in state.


# REV_DEVOPS_ENGINEER — Remote GitHub handoff — 2026-09-16

Reviewed all 82 worktrees and 189 initial branches; preserved 193 development paths in 21 snapshot commits, recovered remaining compliance redirects and safe PII fixtures, and joined all historical branch tips without restoring superseded implementations. Artifact: `AMC_OS/RELEASES/2026-09-16-remote-handoff/README.md`. All 191 final branch tips are integrated. Fresh clone and 13 release checks passed; one load-sensitive throughput failure passed unchanged in isolation. Python platform 1,609 passed; SDK 311 passed with one optional skip. Coverage was stopped at the user's two-minute push deadline. Continue from GitHub main with Node 22 and pnpm 10.33.0; rerun coverage and review remote CI. Local generated runtime files and the historical stash remain preserved locally. Existing product reconciliation tasks remain open.


# REV_DEVOPS_ENGINEER — CI and installed composition — 2026-09-29

Fixed clean-source cache cleanup and installed composition's unpublished workspace import. Added bounded test/coverage steps with retained diagnostics; thresholds and assertions unchanged. Evidence: `AMC_OS/RELEASES/2026-09-29-ci-reliability/receipt.json`. Focused verification: 48 tests across 5 files passed, workflow YAML and script syntax valid, negative test pipeline preserved exit1. Historical six-hour job logs are unavailable; no specific hang cause is claimed. Parent owns shared build, packed-install acceptance and fresh hosted CI.


---

# REV_DEVOPS_ENGINEER Handoff — 2026-09-29

Candidate `421859b0` passed both full suites (14,130 tests), existing coverage thresholds, all 14 executed release checks and installed Studio/crash/non-replay/npm-link acceptance. All worktree heads and local branch tips are integrated. Source and public distribution remain distinct: native 1.2.0 requires the source build; public installers now correctly fetch the available 1.1.1 release. The exact receipts, remote setup commands, current CI scope and external blockers are in [the completion handoff](../RELEASES/2026-09-29-completion/README.md). Live deployment health remains skipped; real model access, publication/deployment inputs and Linear reconnection are still needed. Private runtime files are preserved locally.


---

# REV_DEVOPS_ENGINEER — deployment/platform coordination — 2026-10-03

Read-only review of clean combined `4a5b48e5fa8a32bb793fe9a448b06112f9143a28`; all four assigned existing owners received precise nonoverlapping follow-ups. No extra workers, model changes, production/config edits, application commands, tests or deployment.

Concrete blocker sent immediately to main/parent: `.github/workflows/npm-publish.yml:42,44` repeats the checkout `ref` key. Main owns correction and strict YAML acceptance. Docker found no new defect. Compose allowlist typo is already fixed by main `05486c31`; owner private alignment is redundant. Helm reported metrics-port collision, fractional/invalid port/replica and duplicate API route guard gaps; exact scope awaits main admission. CI helper/contract follow-up is still source-only and pending.

Current deployment source remains unqualified. Last completed compiler pass inspected belongs to `f595a639`, with separate public/core functional control failures retained. Main is composing pending product/API/dependency repairs before a fresh exact-pin build/typecheck and inspected benign static contracts. Real image, Compose, Helm/Kustomize and six-platform/package acceptance remain open. Restricted runtime remains prohibited; no policy or credential changes requested.

Detailed evidence and commits: `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/ten-worker-expansion/deployment-platform-coordination/20261003T040716Z/review.json`. Complete prior handoff bytes preserved alongside it.


Deployment/platform follow-up: CI source review completed. Clean private final HEAD `eb568171eeb6f6b61053c1f844e38e3e7814f17d`; ordered source corrections `6ed167f9e71117993c8bb30ed179580788c6feeb`, `52930895bcc509d6335526fe82d6d922e30236a9` are sent to main/parent. Complete dirty-source checks stay intact, unsafe receipt locations are refused before writing, and current declared publication assets are checked with package evidence retained. Tests/build/scanners/platform lanes remain unrun. Full diff inspected natively; source clone clean. Later main candidate `067ac23892cddc9639b671450fd11b54f248e17d` was also verified clean; no compiler pass on it is claimed. Chart guards and conditional historical quickstart expansion await main. Node20 quickstart defaults to1.1.1, so current1.2.0 manifest alone does not prove its default is broken.

Exact final source review/delivery: `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/ten-worker-expansion/deployment-platform-coordination/20261003T040716Z/followup-delivery.json`.


Admitted deployment follow-ups delivered — 2026-10-03: Docker source `890f9d11b3fea4d14f6d09b8e397515712078ca0`, final `24a0fde66a27b3432ab2e1df48ba446ca5ac3009`; Helm source `bbaa915c5395af4069f166419924066106080c61`, final `71b6757446ab656831899d620c9f564dbd74d3d4`. Both derive from main-admitted `eede912c`, preserve full originals, and were independently reviewed using native read-only Git/filesystem. Clean final clones and whole whitespace checks pass. Docker inverse/log first whitespace failures remain byte-complete in gzip containers; Helm four originals match admitted base exactly. Main received both full commit chains and clone paths.

Main validation dependencies: Docker four authored static cases; Helm eleven authored source contracts and the saved 15-positive/37-negative offline render matrix. All compiler/test/render/image/runtime work is still unrun here and belongs to main's serialized queue. No source/package/platform qualification is claimed. CI correction `eb568171` remains the earlier delivered acceptance dependency; Compose needs no duplicate patch. Detailed commits, original checks, scope and remaining limitations: `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/ten-worker-expansion/deployment-platform-coordination/20261003T040716Z/admitted-delivery-final.json`.


### 20261003T102947Z collector-json-metadata source review

Finite slice delivered and independently reviewed at `3c24d5c2a58d966cdacc83114d9ad297882ac2cf`; base `856711e8`. Exactly five admitted product/test paths, complete originals and guarded inverses preserved, clean final clone, complete diff check exit 0. All 49 cases authored/unrun; compiler/build/runtime/detectors unrun. Main alone owns the privacy binder historical guard composition and serialized qualification. Source changes stopped. Full receipt: `AMC_OS/RESEARCH/2026-10-01-pending-implementation/native-workers/ten-worker-expansion/deployment-platform-coordination/20261003T102947Z/collector-review.json`. Main and parent received exact commits/clone/blockers.
