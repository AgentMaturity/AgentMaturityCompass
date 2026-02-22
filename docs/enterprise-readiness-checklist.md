# AMC Enterprise Readiness Checklist

Status key: `PASS` | `PARTIAL` | `FAIL`

## Summary

- `PASS`: 8
- `PARTIAL`: 6
- `FAIL`: 6

## Checklist

| Area | Status | Evidence | Why it matters | Gap to close |
|---|---|---|---|---|
| Core differentiation (execution-proof evidence) | `PASS` | `README.md:35`, `README.md:40`, `SECURITY.md:23` | Establishes technical moat and buyer reason-to-believe. | Keep this as top-line message. |
| 30-second value proposition clarity | `PARTIAL` | `README.md:35`, `README.md:101` | Buyers need immediate understanding of outcome and category fit. | Reduce module-first messaging; lead with one outcome statement. |
| Messaging consistency (scoring model) | `FAIL` | `README.md:40`, `README.md:140`, `docs/QUICKSTART.md:58`, `docs/SOLO_USER.md:41` | Inconsistent core numbers reduce trust in product narrative. | Unify on one question model count across docs/UI. |
| Enterprise buyer journey clarity (POC -> prod) | `PARTIAL` | `docs/QUICKSTART.md:21`, `docs/DEPLOYMENT_CHECKLIST.md:1`, `docs/ENTERPRISE.md:1` | Enterprises need a phased adoption path with clear decision gates. | Add a single “adoption ladder” document and architecture patterns per phase. |
| RBAC implementation | `PASS` | `docs/RBAC.md:5`, `docs/RBAC.md:15`, `src/studio/studioServer.ts:1047` | Least-privilege and separation-of-duties are mandatory. | Add role-to-endpoint matrix export for audits. |
| SSO (OIDC/SAML) | `PASS` | `docs/ENTERPRISE.md:93`, `docs/SSO_OIDC.md:1`, `docs/SSO_SAML.md:1` | IdP integration is table-stakes for enterprise onboarding. | Add tested IdP recipes (Okta/Azure AD/Ping) in one page. |
| SCIM lifecycle provisioning | `PASS` | `docs/ENTERPRISE.md:124`, `docs/SCIM.md:1` | Automates joiner/mover/leaver controls. | Add SCIM operational runbook for break-glass and rollback. |
| Audit export for SIEM | `PASS` | `src/cli.ts:10263`, `src/audit/enterpriseAuditExport.ts:6` | Centralized security/audit observability is required. | Add out-of-box forwarding templates per SIEM vendor. |
| Compliance mapping output | `PASS` | `docs/COMPLIANCE.md:3`, `docs/COMPLIANCE.md:11` | Helps teams produce evidence-linked control posture quickly. | Add control ownership mapping template for governance teams. |
| Legal/compliance assurance package (procurement-ready) | `FAIL` | `docs/COMPLIANCE.md:3`, `docs/CERTIFICATION.md:55` | CISO/procurement need third-party and legal artifacts. | Publish trust center package (attestations, security/legal docs, questionnaires). |
| Enterprise SLA/support policy | `FAIL` | `README.md:514` | Uptime and response guarantees drive risk acceptance and contracts. | Publish formal SLA with availability targets and response times. |
| Pricing model consistency | `FAIL` | `README.md:515`, `docs/COMPETITIVE_ANALYSIS.md:240`, `src/product/outcomePricing.ts:8` | Budgeting and procurement cannot proceed with conflicting pricing signals. | Define one authoritative pricing source and align all docs/code references. |
| Licensing clarity | `PARTIAL` | `LICENSE:1`, `package.json:40` | OSS legal clarity is good, but enterprise commercial boundaries must be explicit. | Add commercial licensing/entitlements policy for paid offerings. |
| Native Slack integration | `PARTIAL` | `src/integrations/integrationSchema.ts:11`, `tests/integrationSlackWebhook.test.ts:60` | Collaboration tooling integration accelerates adoption. | Expand from webhook-only to richer native integration path. |
| Native Jira integration | `FAIL` | repo search: no `jira` matches in docs/src/tests | Change-management and incident workflows often depend on Jira. | Build/ship first-party Jira connector (issues, workflow states, comments, webhooks). |
| Native ServiceNow integration | `FAIL` | repo search: no `servicenow` matches in docs/src/tests | Many enterprises require ServiceNow for ITSM/GRC workflows. | Build/ship first-party ServiceNow connector. |
| Deployment hardening controls (Helm/Compose security defaults) | `PASS` | `deploy/helm/amc/values.yaml:83`, `deploy/helm/amc/values.yaml:107`, `docs/SECURITY_DEPLOYMENT.md:12` | Security posture for production runtime is strong. | Add reference architecture for multi-region HA. |
| HA/scale reference architecture and sizing guidance | `PARTIAL` | `docs/ENTERPRISE.md:155`, `deploy/helm/amc/values.yaml:1` | CTO teams need capacity and reliability planning guidance. | Publish tested scale benchmarks and sizing calculator. |
| Backup/retention/DR operational maturity | `PASS` | `docs/ENTERPRISE.md:174`, `docs/OPERATIONS.md:24`, `docs/RELEASE_RUNBOOK.md:28` | Business continuity is required for production adoption. | Add explicit RPO/RTO targets and validated runbook timings. |
| Integration coverage for enterprise workflows overall | `PARTIAL` | `src/integrations/integrationSchema.ts:3`, `docs/INTEGRATIONS.md:1` | Buyers expect both model integrations and enterprise workflow integrations. | Add Jira/ServiceNow plus integration cookbook patterns. |

## Immediate Go/No-Go Reads for Enterprise Sales

Go signals:
- Strong IAM, RBAC, audit export, signed evidence architecture.

No-go risks today:
- No formal SLA policy.
- Conflicting pricing signals.
- Missing Jira/ServiceNow native connectors.
- Procurement trust package not yet explicit.
