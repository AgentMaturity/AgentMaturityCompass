# AMC Production Deployment Checklist

Complete these checks before going live. Every item is a real `amc` command.

## Infrastructure

- [ ] Node.js ≥ 20 installed — `node --version`
- [ ] AMC installed and built — `amc --version`
- [ ] Health check passes — `amc doctor`

## Workspace Initialization

- [ ] Workspace initialized — `amc init` or `amc setup --demo`
- [ ] Fleet configured — `amc fleet init`
- [ ] Agents registered — `amc agent add`

## Security & Vault

- [ ] Vault initialized — `amc vault init`
- [ ] Vault status healthy — `amc vault status`
- [ ] Provider keys stored in vault (zero-key agents)

## Governance & Policy

- [ ] Ops policy signed — `amc ops init && amc ops verify`
- [ ] Action policy created — `amc policy action init && amc policy action verify`
- [ ] Approval policy created — `amc policy approval init && amc policy approval verify`
- [ ] RBAC configured — `amc user init && amc user add --username <admin> --role OWNER`

## Trust & Anti-Cheat

- [ ] Notary initialized — `amc notary init`
- [ ] Notary running — `amc notary start`
- [ ] Trust status verified — `amc trust status`

## Assurance

- [ ] Assurance initialized — `amc assurance init`
- [ ] All packs pass — `amc assurance run --scope workspace --pack all`
- [ ] Assurance scheduler enabled — `amc assurance scheduler enable`

## Transparency & Compliance

- [ ] Transparency log initialized — `amc transparency init`
- [ ] Transparency verified — `amc transparency verify`
- [ ] Compliance framework loaded — `amc compliance init`
- [ ] Compliance verified — `amc compliance verify`

## Backup & Operations

- [ ] First backup taken — `amc backup create --out .amc/backups/first.amcbackup`
- [ ] Backup verified — `amc backup verify .amc/backups/first.amcbackup`
- [ ] Budgets configured — `amc budgets init && amc budgets verify`
- [ ] Alerts configured — `amc alerts init && amc alerts verify`

## Studio & Gateway

- [ ] Studio starts cleanly — `amc up`
- [ ] Studio health check — `amc studio ping`
- [ ] Gateway config valid — `amc gateway verify-config`

## Verification

- [ ] Full verification passes — `amc verify all --json`
- [ ] E2E smoke test — `amc e2e smoke --mode local --json`

## Optional: Enterprise

- [ ] SSO/OIDC configured — `amc identity init`
- [ ] SCIM provisioning — `amc scim token create`
- [ ] Audit binder — `amc audit init`
- [ ] Federation — `amc federate init`
- [ ] Agent Passport — `amc passport init`
