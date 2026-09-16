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
