# DEPLOYMENT_OPTIONS.md — Browser, CLI, CI, self-hosted, managed, enterprise

This page clarifies the deployment and usage paths for AMC.

## Deployment comparison

| Path | Best for | What you get |
|---|---|---|
| **Browser try-now** | first-touch exploration, demos | lightweight scoring exploration in the static playground |
| **Local CLI** | real scoring, evidence, traces, reports | execution evidence workflows and hands-on local usage |
| **CI / GitHub Action** | release gates, score thresholds, repeatable checks | automation, regression prevention, artifacts |
| **Self-hosted team deployment** | teams that need shared internal workflows | team-accessible deployment and internal control |
| **Hosted AMC** | not offered | Hosted AMC: not offered; D-03 names no hosted target. |
| **Enterprise / on-prem** | regulated orgs, large deployments | governance, support, enterprise controls, audit-ready deployment |

## Honest path guidance
- **Browser** is the fastest intro, not the deepest path.
- **CLI** is the serious execution-evidence path.
- **CI** is where trust standards become repeatable.
- **Self-hosted / enterprise** are where collaboration, governance, and regulated delivery become real.
- **Cloud self-hosting** is documented as customer-operated AWS, GCP, or Azure deployment architecture. This repo does not publish an AMC-operated hosted SaaS API endpoint.

## Self-hosted cloud starting points

The Helm chart on EKS, GKE or AKS is the documented cluster path; like every deployment path it is documented, not qualified (`docs/deploy/reference/TOPOLOGY.md`). The workspace ledger is SQLite in WAL mode (`src/ledger/ledgerConnection.ts`), so the workspace volume must be a block or local filesystem (EBS, Persistent Disk, Azure Disk); EFS, Azure Files and other network filesystems are not usable for it. Studio is a single writer, so autoscaled or multi-instance services (Cloud Run scale-out, multi-task ECS services) are not Studio targets, and neither is ECS at all: a task's EBS volume does not outlive the task.

- **AWS:** EKS with the Helm chart and an EBS-backed claim (EBS CSI driver), or the Compose TLS stack on one EC2 instance whose Docker data directory is on an EBS volume that outlives the instance. ECS on Fargate is not a Studio target: ECS attaches a new EBS volume to each task and deletes a service-managed task's volume when the task stops, so every redeploy would delete the workspace; use it only for the standalone API.
- **GCP:** Google Kubernetes Engine with the Helm chart and a Persistent Disk claim. Cloud Run is not a Studio target: it scales out and gives the workspace no block storage.
- **Azure:** AKS with the Helm chart and an Azure Disk claim. Azure Container Apps can mount only Azure Files or ephemeral storage, which the workspace cannot use.
- **OpenAPI clients:** use `https://{host}/api` for your own DNS name and keep `http://localhost:3000/api` for local development.

## Read next
- `docs/START_HERE.md`
- `docs/INSTALL.md`
- `docs/CI_TEMPLATES.md`
- `docs/CLOUD_REFERENCE_ARCHITECTURES.md`
- `docs/KUBERNETES_HELM_DEPLOYMENT.md`
- `docs/ENTERPRISE.md`
- `docs/PRICING.md`
