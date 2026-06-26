# Cloud Reference Architectures

This guide maps AMC's self-hosted deployment assets to AWS, GCP, and Azure. It is for teams that want AMC Studio and the AMC API reachable through their own cloud network, DNS, TLS, identity, and secret-management controls.

External references checked on 2026-06-16:

- AWS Fargate for Amazon ECS: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html
- Amazon ECS service load balancing: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html
- Amazon ECS secrets from AWS Secrets Manager: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
- AWS Load Balancer Controller for EKS: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html
- Google Cloud Run overview: https://cloud.google.com/run/docs/overview/what-is-cloud-run
- Cloud Run secrets: https://cloud.google.com/run/docs/configuring/services/secrets
- Google Kubernetes Engine Ingress: https://cloud.google.com/kubernetes-engine/docs/concepts/ingress
- Azure Container Apps overview: https://learn.microsoft.com/en-us/azure/container-apps/overview
- Azure Container Apps ingress: https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview
- Azure Container Apps secrets and Azure Key Vault references: https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets

## Self-hosted cloud boundary

AMC does not publish an AMC-operated hosted SaaS API endpoint from this repository. Treat every production URL as a customer-operated endpoint that you deploy and own.

OpenAPI clients should use one of these server roots:

- Local development: `http://localhost:3000/api`
- Self-hosted production: `https://{host}/api`, where `{host}` is your DNS name, such as `amc.internal.example.com` or `amc.example.com`.

The public API base path is `/api`. Studio's browser console normally sits beside it behind the same ingress or load balancer.

## Common production contract

All provider designs should satisfy the same AMC runtime contract:

- Terminate TLS before user traffic reaches AMC, or use a service mesh that enforces TLS on the last hop.
- Expose `GET /healthz` for liveness and `GET /readyz` for readiness.
- Store vault, owner bootstrap, notary, and webhook secrets in a provider secret manager, then project them into the container through files or controlled environment variables.
- Persist the AMC workspace on a managed volume or external storage path; do not rely on ephemeral container filesystem state for evidence, score history, vault metadata, or reports.
- Restrict inbound access to approved CIDRs, identity-aware proxy users, private network clients, or an API gateway.
- Send logs to the provider logging stack and redact payloads that may contain prompts, transcripts, credentials, or customer data.
- Run one active writer for a single workspace unless you have tested the backing storage and AMC workflow for concurrent writers.

## Provider choice matrix

| Provider path | Best fit | AMC deployment asset |
|---|---|---|
| AWS ECS on AWS Fargate | Lower Kubernetes overhead, simple team service | Docker image plus ECS task and service definitions |
| AWS EKS | Existing Kubernetes platform teams | `deploy/helm/amc/` or `deploy/k8s/` |
| Google Cloud Run | Lower-ops HTTPS service when workspace persistence is externalized | Docker image with mounted or external storage design |
| Google Kubernetes Engine | Existing GKE platform teams | `deploy/helm/amc/` or `deploy/k8s/` |
| Azure Container Apps | Lower Kubernetes overhead, managed HTTPS ingress | Docker image plus Container App configuration |
| Azure Kubernetes Service | Existing AKS platform teams | `deploy/helm/amc/` or `deploy/k8s/` |

For IaC-driven Kubernetes installs, use the Terraform example at `deploy/terraform/helm-release/` or the Pulumi example at `deploy/pulumi/helm-release/`. Both manage the AMC Helm release and expect production bootstrap secrets to be created through a separate secret workflow.

## AWS reference architecture

Recommended starting point: AWS Fargate with Amazon ECS, an Application Load Balancer, AWS Secrets Manager, CloudWatch Logs, and EFS or another managed persistent storage option for the AMC workspace.

Traffic flow:

1. Route `https://amc.example.com` to an Application Load Balancer.
2. Forward `/` and `/api/*` to an ECS service running the AMC container.
3. Configure the target group health check against `/readyz`; keep `/healthz` for task liveness checks and container health probes.
4. Store `AMC_VAULT_PASSPHRASE`, bootstrap owner credentials, notary secrets, and webhook secrets in AWS Secrets Manager.
5. Inject secrets through ECS task definition `secrets` entries or mount them as files through your internal secret projection pattern.
6. Attach IAM roles with least privilege for logging, secret reads, image pulls, and storage access.
7. Persist `/data/amc` on managed storage; do not use task-local scratch storage for production evidence.

EKS alternative:

- Install AMC with `helm upgrade --install amc deploy/helm/amc`.
- Use the AWS Load Balancer Controller to provision an Application Load Balancer from Kubernetes Ingress.
- Prefer External Secrets Operator, sealed secrets, or your platform secret pipeline rather than literal Helm values for production credentials.
- Keep Terraform state free of secret literals when using `deploy/terraform/helm-release/`.

## GCP reference architecture

Recommended starting point: Google Cloud Run when you can externalize persistence, or Google Kubernetes Engine when the AMC workspace must be mounted as a Kubernetes persistent volume.

Cloud Run path:

1. Deploy the AMC container as a Cloud Run service with HTTPS ingress and a custom domain.
2. Set the public API root for clients to `https://{host}/api`.
3. Configure startup/liveness behavior with the container health endpoints: `GET /healthz` and `GET /readyz`.
4. Store sensitive values in Secret Manager and expose them to the service as mounted files or pinned environment variables.
5. Use a persistent external storage design for `/data/amc`; Cloud Run instance filesystem state is not the right production evidence store.
6. Assign a dedicated service identity and grant only the secret, logging, registry, and storage permissions AMC needs.

GKE alternative:

- Install AMC with the Helm chart or Kustomize manifests.
- Use Google Kubernetes Engine Ingress or Gateway to create external or internal Application Load Balancers.
- Use Secret Manager integration, External Secrets Operator, or your platform secret pipeline for bootstrap and vault secrets.
- Back the workspace PVC with a storage class that meets your retention, backup, and restore requirements.

## Azure reference architecture

Recommended starting point: Azure Container Apps with managed ingress, Azure Key Vault references, Log Analytics, Azure Container Registry, and Azure Files or another managed persistent storage option for the AMC workspace.

Traffic flow:

1. Route `https://amc.example.com` to Azure Container Apps external ingress, or use internal ingress for private-only deployments.
2. Point OpenAPI clients at `https://{host}/api`.
3. Configure Container Apps health probes to `GET /healthz` and `GET /readyz`.
4. Store production credentials in Azure Key Vault and reference them from Container Apps secrets through managed identity.
5. Mount or otherwise provide durable workspace storage for `/data/amc`; avoid relying on ephemeral revision-local storage.
6. Send container logs to Log Analytics and restrict inbound traffic with ingress, private networking, or an upstream gateway.

AKS alternative:

- Install AMC with `deploy/helm/amc/` or `deploy/k8s/`.
- Use an ingress controller, Application Gateway Ingress Controller, or your platform gateway for TLS and routing.
- Use Azure Key Vault CSI Driver, External Secrets Operator, or your secure secret pipeline for bootstrap credentials.
- Use Azure Files, Azure Disk, or a platform-approved storage class for the AMC workspace PVC.

## Production readiness checklist

- DNS resolves to the provider ingress or load balancer.
- TLS certificate is valid and renews automatically.
- `curl https://{host}/healthz` returns success from the liveness endpoint.
- `curl https://{host}/readyz` returns success from the readiness endpoint after storage and config are available.
- `curl https://{host}/api/...` reaches the OpenAPI-documented API root after authentication.
- Secret rotation has a tested redeploy or restart path.
- Workspace backup and restore are tested with real evidence artifacts.
- Logs, metrics, and audit artifacts are retained according to the team's governance policy.
- Inbound access is private or constrained for internal governance deployments.
- The deployment does not depend on an AMC-operated hosted SaaS endpoint.

## Still not included

- A published AMC-operated SaaS endpoint.
- Provider-specific full-stack Terraform or Pulumi modules for VPC/VNet, clusters, load balancers, DNS, and registries.
- Provider-certified production hardening for every regulated workload.

Use `docs/KUBERNETES_HELM_DEPLOYMENT.md` for chart commands and `docs/DEPLOYMENT_OPTIONS.md` for choosing between browser, CLI, CI, self-hosted, managed, and enterprise paths.
