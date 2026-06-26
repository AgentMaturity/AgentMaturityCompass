# DEPLOYMENT_OPTIONS.md — Browser, CLI, CI, self-hosted, managed, enterprise

This page clarifies the deployment and usage paths for AMC.

## Deployment comparison

| Path | Best for | What you get |
|---|---|---|
| **Browser try-now** | first-touch exploration, demos | lightweight scoring exploration in the static playground |
| **Local CLI** | real scoring, evidence, traces, reports | execution evidence workflows and hands-on local usage |
| **CI / GitHub Action** | release gates, score thresholds, repeatable checks | automation, regression prevention, artifacts |
| **Self-hosted team deployment** | teams that need shared internal workflows | team-accessible deployment and internal control |
| **Managed / hosted AMC** | teams that want convenience and shared ops | hosted trust workflows with reduced operational overhead |
| **Enterprise / on-prem** | regulated orgs, large deployments | governance, support, enterprise controls, audit-ready deployment |

## Honest path guidance
- **Browser** is the fastest intro, not the deepest path.
- **CLI** is the serious execution-evidence path.
- **CI** is where trust standards become repeatable.
- **Self-hosted / managed / enterprise** are where collaboration, governance, and regulated delivery become real.
- **Cloud self-hosting** is documented as customer-operated AWS, GCP, or Azure deployment architecture. This repo does not publish an AMC-operated hosted SaaS API endpoint.

## Self-hosted cloud starting points

- **AWS:** ECS on Fargate with an Application Load Balancer, or EKS with the Helm chart.
- **GCP:** Cloud Run when persistence is externalized, or Google Kubernetes Engine with the Helm chart.
- **Azure:** Azure Container Apps with managed ingress, or AKS with the Helm chart.
- **OpenAPI clients:** use `https://{host}/api` for your own DNS name and keep `http://localhost:3000/api` for local development.

## Read next
- `docs/START_HERE.md`
- `docs/INSTALL.md`
- `docs/CI_TEMPLATES.md`
- `docs/CLOUD_REFERENCE_ARCHITECTURES.md`
- `docs/KUBERNETES_HELM_DEPLOYMENT.md`
- `docs/ENTERPRISE.md`
- `docs/PRICING.md`
