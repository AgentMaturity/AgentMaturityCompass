---
"agent-maturity-compass": patch
---

The cloud docs stop recommending what the runtime cannot do (LIVE-DEPLOY-18). `docs/DEPLOYMENT_OPTIONS.md` no longer lists a "Managed / hosted AMC" path (hosted AMC is not offered; D-03 names no hosted target). It and `docs/CLOUD_REFERENCE_ARCHITECTURES.md` now say that the workspace volume must be a block or local filesystem (EBS, Persistent Disk, Azure Disk), because the ledger is SQLite in WAL mode; EFS, Azure Files and other network filesystems are not usable for it. Studio is a single writer, so Cloud Run scale-out and Azure Container Apps (Azure Files only) are not Studio targets, and neither is ECS on Fargate, which attaches a new EBS volume to each task and deletes a service-managed task's volume when the task stops (it remains a target for the standalone API); the Helm chart on EKS, GKE or AKS is the documented cluster path, documented and not qualified.
