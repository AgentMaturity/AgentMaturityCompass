# AMC Enterprise Deployment Guide

Deploy AMC as your organization's AI agent governance platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   AMC Studio                         │
│              (Control Plane)                         │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Console  │  │ REST API │  │ SSE (Real-time)   │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Gateway  │  │  Vault   │  │   Notary          │  │
│  │ (Proxy)  │  │ (Secrets)│  │ (Anti-Cheat)      │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Assurance│  │Compliance│  │  Transparency     │  │
│  │  Lab     │  │  Maps    │  │  Log + Merkle     │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
         ↑              ↑              ↑
    AI Agents      Auditors       Org Graph
```

### Components

| Component | Purpose | Port |
|-----------|---------|------|
| **Studio** | Control plane — scoring, console, API | 3212 |
| **Gateway** | Universal LLM proxy — all model calls route through | 3210 |
| **Vault** | Encrypted key store — provider secrets, DLP, honeytokens | — |
| **Notary** | Isolated signing boundary — anti-cheat, fail-closed trust | 4343 |
| **Assurance Lab** | Red-team packs — injection, exfiltration, tool misuse | — |
| **Transparency Log** | Append-only, hash-chained, Merkle-provable audit trail | — |
| **Compliance** | Evidence-linked SOC2/framework mapping | — |

## Multi-Workspace (Host Mode)

For organizations managing multiple workspaces:

```bash
# Initialize host mode
amc host init --host-dir /var/amc-host

# Bootstrap admin + default workspace
amc host bootstrap \
  --host-dir /var/amc-host \
  --admin-password-file /secure/admin-pass.txt \
  --owner-password-file /secure/owner-pass.txt

# Create additional workspaces
amc host workspace create --host-dir /var/amc-host --name "team-platform"
amc host workspace create --host-dir /var/amc-host --name "team-ml"

# Migrate existing single-workspace
amc host migrate --host-dir /var/amc-host --from /path/to/existing/.amc
```

## RBAC Setup

AMC supports signed multi-user RBAC with these roles:

| Role | Permissions |
|------|-------------|
| **OWNER** | Full control — targets, policies, approvals, vault |
| **AUDITOR** | Read-only — scores, evidence, compliance reports |
| **APPROVER** | Approve/deny execution intents and dual-control requests |
| **OPERATOR** | Run diagnostics, manage agents, view dashboards |
| **VIEWER** | Read-only console access |
| **AGENT** | Lease-scoped API access only |

```bash
amc user init
amc user add --username alice --role OWNER
amc user add --username bob --role AUDITOR
amc user add --username charlie --role APPROVER
amc user add --username service-account --role OPERATOR
amc user list
```

Dual-control approvals require quorum from APPROVER-role users for high-impact operations:

```bash
amc policy approval init
```

## SSO / OIDC Integration

```bash
# Initialize identity config
amc identity init --host-dir /var/amc-host

# Add OIDC provider (e.g., Okta)
amc identity provider add oidc \
  --host-dir /var/amc-host \
  --id okta \
  --issuer https://your-org.okta.com \
  --client-id <client-id> \
  --client-secret-file /secure/client-secret.txt \
  --redirect-uri https://amc.example.com/host/api/auth/oidc/okta/callback

# Map groups to roles
amc identity mapping add \
  --host-dir /var/amc-host \
  --group amc-owners \
  --workspace default \
  --roles OWNER,AUDITOR

amc identity mapping add \
  --host-dir /var/amc-host \
  --group amc-operators \
  --workspace team-platform \
  --roles OPERATOR
```

SAML is also supported — see [docs/SSO_SAML.md](SSO_SAML.md).

## SCIM Provisioning

Automate user lifecycle from your identity provider:

```bash
amc scim token create \
  --host-dir /var/amc-host \
  --name okta-scim \
  --out /secure/scim-token.txt
```

Configure your IdP's SCIM connector to point at `https://amc.example.com/host/api/scim/v2` with the generated token.

## Docker Compose (Production)

```bash
cd deploy/compose
cp .env.example .env
# Edit .env: set AMC_VAULT_KEY, AMC_ADMIN_PASSWORD, TLS settings

# Standard deployment
docker compose up -d --build

# With TLS (Caddy reverse proxy)
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build
```

## Kubernetes (Helm)

```bash
# Install
helm install amc deploy/helm/amc \
  --namespace amc \
  --create-namespace \
  --set studio.replicas=2 \
  --set gateway.replicas=3 \
  --set persistence.size=50Gi \
  --set ingress.enabled=true \
  --set ingress.host=amc.example.com

# Validate
helm lint deploy/helm/amc
helm template amc deploy/helm/amc

# Upgrade
helm upgrade amc deploy/helm/amc --namespace amc
```

See `deploy/helm/amc/values.yaml` for all configuration options.

## Backup & Retention

```bash
# Create encrypted, signed backup
amc backup create --out /backups/amc-$(date +%Y%m%d).amcbackup

# Verify backup integrity
amc backup verify /backups/amc-20260219.amcbackup

# Restore
amc backup restore /backups/amc-20260219.amcbackup --to /var/amc-restore

# Configure retention (archive old evidence, prune payloads, preserve hash chains)
amc retention run --dry-run
amc retention run
amc retention verify
```

## SIEM Integration

AMC dispatches events to external systems:

```bash
amc integrations init
amc integrations verify
amc integrations status
amc integrations test
amc integrations dispatch
```

Configure SIEM targets in `.amc/integrations.yaml`. AMC generates structured events suitable for CEF/LEEF ingestion.

## Compliance Reporting

```bash
# Initialize compliance framework
amc compliance init
amc compliance verify

# Generate SOC2 report
amc compliance report --framework SOC2 --window 14d --out ./compliance-soc2.md

# Fleet-wide compliance
amc compliance fleet --framework SOC2 --window 30d --out ./compliance-fleet.json
```

Compliance output is deterministic: categories are `SATISFIED` only when verified evidence meets requirements. Otherwise `PARTIAL`, `MISSING`, or `UNKNOWN`. AMC does not infer legal attestations.

## Audit Binder

Generate offline-verifiable audit artifacts:

```bash
amc audit init
amc audit binder create --scope workspace --out ./workspace.amcaudit
amc audit binder verify ./workspace.amcaudit
```

For controlled auditor disclosure:

```bash
amc audit request create --scope workspace --items control:ACCESS_CONTROL.SSO_SCIM
amc audit request approve <requestId> --reason "approved for annual audit"
amc audit request fulfill <requestId> --out ./audit-export.amcaudit
```

## Org Graph (Comparative Scorecards)

Score teams, functions, and the enterprise:

```bash
amc org init
amc org add node --type TEAM --id team-platform --name "Platform" --parent enterprise
amc org assign --agent bot-1 --node team-platform
amc org score --window 14d
amc org report --node team-platform --out ./team-report.md
amc org compare --node-a team-platform --node-b enterprise --out ./comparison.md
```

## Anti-Cheat (Notary)

Isolate signing from the runtime:

```bash
amc notary init
amc notary start
amc trust enable-notary \
  --base-url http://127.0.0.1:4343 \
  --pin /path/to/notary.pub \
  --require HARDWARE
amc trust status
```

## Federation

Cross-organization trust sharing:

```bash
amc federate init --org "My Org"
amc federate peer add --peerId partner --name "Partner" --pubkey ./partner.pub
amc federate export --out ./outbound.amcfed
amc federate import ./inbound.amcfed
```

## Monitoring

```bash
amc status                  # Studio and vault status
amc studio ping             # API health check
amc studio healthcheck      # Deployment readiness probe
amc maintenance stats       # Operational statistics
amc metrics status          # Prometheus metrics endpoint
```
