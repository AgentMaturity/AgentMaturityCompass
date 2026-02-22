# AMC Product Readiness Audit (Wave 4 / Agent 14)

## Scope

Audit objective: assess AMC for enterprise readiness and product-market fit from a CTO/CISO buyer perspective, based on implementation and docs in this repository.

## Executive Summary

AMC shows strong technical depth for governance-by-evidence (RBAC, SSO/SCIM, signed audit artifacts, deterministic controls).  
The biggest adoption blockers are commercial clarity and procurement readiness, not core engineering capability.

Current readiness call:
- Product capability readiness: **High**
- Enterprise procurement readiness: **Medium-Low**
- Product-market fit clarity for enterprise buyers: **Medium**

## 1) Buyer Perspective: What a CTO/CISO Will Ask

### Architecture and trust boundary
- What is the trust boundary, and can an agent forge its own evidence?
- Is runtime evidence tamper-evident and externally verifiable?
- How is signing isolated (vault/notary) and what fails closed?

Evidence:
- `README.md:35`
- `README.md:40`
- `SECURITY.md:23`
- `docs/ENTERPRISE.md:38`

### Identity and access governance
- Can we integrate with existing IdP (OIDC/SAML)?
- Is user lifecycle automated (SCIM)?
- Are roles and permissions enforceable per endpoint?

Evidence:
- `docs/ENTERPRISE.md:65`
- `docs/ENTERPRISE.md:93`
- `docs/ENTERPRISE.md:124`
- `docs/RBAC.md:3`
- `src/studio/studioServer.ts:1047`

### Audit/compliance operations
- Can logs export to SIEM in enterprise formats?
- Are compliance artifacts evidence-linked or self-attested?
- Is there audit-binder workflow for controlled disclosure?

Evidence:
- `src/cli.ts:10263`
- `src/audit/enterpriseAuditExport.ts:6`
- `docs/COMPLIANCE.md:3`
- `docs/ENTERPRISE.md:222`

### Operational readiness
- What is minimum deployment versus full production hardening?
- Can we run HA-style Kubernetes with security controls?
- What backup, retention, and DR drill paths exist?

Evidence:
- `docs/QUICKSTART.md:21`
- `docs/DEPLOYMENT.md:3`
- `deploy/helm/amc/values.yaml:83`
- `docs/DEPLOYMENT_CHECKLIST.md:25`
- `docs/OPERATIONS.md:24`

### Commercial/procurement
- What exactly are the paid tiers and entitlements?
- What SLA/support commitments exist contractually?
- Is the licensing model aligned with enterprise commercial packaging?

Evidence:
- `README.md:494`
- `README.md:515`
- `docs/COMPETITIVE_ANALYSIS.md:240`
- `src/product/outcomePricing.ts:8`
- `LICENSE:1`

## 2) Top 5 Deal-Killer Gaps

### 1. Pricing and packaging are inconsistent across repo surfaces

Why it kills deals:
- Procurement cannot budget or compare offers if pricing, tier names, and entitlement boundaries conflict.

Evidence:
- `README.md:515` shows `Free forever / $199/mo / Contact us`.
- `docs/COMPETITIVE_ANALYSIS.md:240` shows `Free / $5K–$20K / $50K+`.
- `src/product/outcomePricing.ts:10` shows `starter $49`, and `src/product/outcomePricing.ts:12` shows `enterprise $999`.
- `README.md:517` points to “Full Pricing Details” in `docs/SOLO_USER.md`, but `docs/SOLO_USER.md:1` has no pricing section.

### 2. No clear customer-facing enterprise SLA/support policy

Why it kills deals:
- CISO/legal/procurement usually require uptime targets, severity matrix, response times, escalation paths, and remedies.

Evidence:
- `README.md:514` only states “SLA / Support: Community / Email / Dedicated”.
- Repo search found no formal uptime/SLA policy doc with contractual targets.

### 3. Enterprise integration expectations are only partially met

Why it kills deals:
- Large enterprises expect native ITSM/workflow integrations, especially Jira and ServiceNow.

Evidence:
- `src/integrations/integrationSchema.ts:3` supports only `webhook` and `slack_webhook`.
- `src/integrations/integrationStore.ts:44` has default Slack webhook channel.
- `docs/INTEGRATIONS.md:1` focuses on model-provider integrations, not ITSM systems.
- Repo-wide search for `jira|servicenow` returned no matches.

### 4. Compliance and certification story is technically strong but procurement-weak

Why it kills deals:
- CISO teams need third-party assurance packages (for vendor risk), not only self-generated evidence mappings.

Evidence:
- `docs/COMPLIANCE.md:3` says compliance outputs are not legal certifications.
- `docs/COMPLIANCE.md:19` says AMC does not infer unseen controls.
- `docs/CERTIFICATION.md:55` states what certs do not prove.

### 5. Core positioning is diluted by inconsistent product narrative

Why it kills deals:
- Buyer confidence drops when core scope appears inconsistent or over-expanded.

Evidence:
- `README.md:40` and `README.md:140` describe **42 questions**.
- `docs/QUICKSTART.md:58` and `docs/SOLO_USER.md:41` describe **67 questions**.
- `README.md:101` presents AMC as a 25-module platform, which can obscure the primary purchase reason.

## 3) Is the Value Proposition Clear in 30 Seconds?

Assessment: **Partial**

What is strong:
- The core claim is crisp and differentiated: execution-proof evidence, not self-reported maturity.
- Best expression appears in the architecture sentence and trust model.

What is weak:
- Messaging diverges between “42 questions” and “67 questions.”
- The narrative quickly expands into many modules before anchoring buyer outcome.

Evidence:
- `README.md:35`
- `README.md:40`
- `docs/QUICKSTART.md:58`

## 4) Enterprise Feature Check (Requested)

### SSO
- Status: **Pass**
- Evidence: OIDC and SAML setup docs and CLI surfaces.
- References:
  - `docs/ENTERPRISE.md:93`
  - `docs/SSO_OIDC.md:1`
  - `docs/SSO_SAML.md:1`

### Audit export
- Status: **Pass**
- Evidence: export command + formats for Splunk/Datadog/CloudTrail/Azure.
- References:
  - `src/cli.ts:10263`
  - `src/audit/enterpriseAuditExport.ts:6`

### Role-based access
- Status: **Pass**
- Evidence: defined roles, signed user config, endpoint-level role checks.
- References:
  - `docs/RBAC.md:5`
  - `docs/RBAC.md:15`
  - `src/studio/studioServer.ts:1047`

### SLA guarantees
- Status: **Fail (commercial), Partial (technical SLO tooling exists)**
- Evidence:
  - Commercial guarantee not specified beyond high-level support labels (`README.md:514`).
  - Operational SLO tooling exists in runbooks/metrics (not a customer SLA contract).

## 5) Pricing/Licensing Model Clarity

Assessment: **Fail for commercial clarity, Pass for OSS license clarity**

- OSS licensing is clear (`MIT`).
- Commercial tiering and price points are not internally consistent.
- “Full pricing details” target doc does not provide pricing details.

Evidence:
- `LICENSE:1`
- `package.json:40`
- `README.md:515`
- `docs/COMPETITIVE_ANALYSIS.md:240`
- `src/product/outcomePricing.ts:8`
- `README.md:517`

## 6) Minimum Viable Deployment vs Full Deployment

### Minimum viable deployment (POC / first value)

Target outcome:
- Start collecting observed evidence and produce maturity scores for one team.

Shape:
- Single workspace
- Local or internal deploy
- Local auth/RBAC basics
- One or two agent adapters through gateway

Representative path:
- `docs/QUICKSTART.md:21`
- `docs/QUICKSTART.md:37`
- `docs/QUICKSTART.md:50`
- `docs/DEPLOYMENT.md:14`

### Full enterprise deployment

Target outcome:
- Multi-workspace governance control plane integrated into enterprise IAM, audit, and operations.

Shape:
- Host mode + workspace portfolio
- OIDC/SAML + SCIM provisioning + role mapping
- TLS ingress and network controls
- Notary-enabled fail-closed trust boundary
- SIEM export + audit binder workflows
- Backup/retention/metrics + routine verification/DR drills

Representative path:
- `docs/ENTERPRISE.md:43`
- `docs/ENTERPRISE.md:93`
- `docs/ENTERPRISE.md:124`
- `docs/ENTERPRISE.md:174`
- `docs/ENTERPRISE.md:192`
- `docs/ENTERPRISE.md:222`
- `docs/DEPLOYMENT_CHECKLIST.md:25`

## 7) Enterprise Integration Points Buyers Expect

### Slack
- Status: **Partial**
- Available as incoming webhook channel, not a full native app integration.
- References:
  - `src/integrations/integrationSchema.ts:11`
  - `tests/integrationSlackWebhook.test.ts:60`

### Jira
- Status: **Missing**
- No native connector references found in docs/source.

### ServiceNow
- Status: **Missing**
- No native connector references found in docs/source.

### Practical implication
- AMC can push to generic webhooks and Slack webhooks now.
- Enterprises that standardize on Jira/ServiceNow will need custom middleware until native connectors exist.

## 8) 30-Second Elevator Pitch (Based on Current Product)

AMC is a governance control plane for AI agents. It sits in the execution path, captures signed tamper-evident evidence of what agents actually do, and converts that into evidence-gated maturity scores, policy decisions, and audit artifacts. Instead of trusting self-reported checklists, CTO/CISO teams get verifiable proof to decide if an agent is safe to deploy and where to invest to reduce risk.

## 9) Priority Fix Order (Recommended)

1. Publish one canonical pricing/packaging matrix and remove contradictory numbers.
2. Publish enterprise SLA/support policy (availability targets, severity/response commitments, escalation).
3. Ship native Jira and ServiceNow integrations (or officially supported reference connectors).
4. Unify product narrative (pick one scoring model count and keep docs/UI aligned).
5. Publish a procurement trust pack (security overview, legal/compliance artifacts, standard questionnaires).
