# AMC Production Deployment Checklist

Complete these checks before going live. Every item is a real `amc` command.

## Infrastructure

- [ ] Node.js ≥ 20 installed — `node --version`
- [ ] AMC installed and built — `amc --version`
- [ ] Strict workspace health check passes — `amc doctor --strict`

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
- [ ] Runtime Firewall policy signed — `amc firewall enable` (add `--mode block` to enforce). Without a policy every native tool call is denied and `amc doctor --strict` fails.

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
- [ ] Backup verified — `amc backup verify .amc/backups/first.amcbackup --pubkey <recorded-auditor.pub>`
- [ ] Budgets configured — `amc budgets init && amc budgets verify`
- [ ] Alerts configured — `amc alerts init && amc alerts verify`

## Studio & Gateway

- [ ] Studio starts cleanly — `amc up`
- [ ] Studio health check — `amc studio ping`
- [ ] Gateway config valid — `amc gateway verify-config`

## Verification

- [ ] Full verification passes — `amc verify all --json --expect-monitor <monitor sha256>`, where `<monitor sha256>` is the output of `shasum -a 256 .amc/keys/monitor_ed25519.pub`, recorded outside the workspace when you created it. Without a pin (this flag, `AMC_EXPECTED_MONITOR_FINGERPRINT` or a trust list), the ledger check fails as unanchored.
- [ ] E2E smoke test (source checkout only) — at the root of a built checkout: `node dist/cli.js e2e smoke --mode local --json`. It starts the checkout's `dist/cli.js` and packs a release bundle from its lockfile, so it fails from an installed package. With an installed package, the operator checks are `amc doctor --strict` and the pinned `amc verify all` above.

## Optional: Enterprise

- [ ] SSO/OIDC configured — `amc sso configure oidc --host-dir <host-dir> ...`
- [ ] SCIM provisioning — `amc scim init --host-dir <host-dir> --token-name <name>`
- [ ] Audit binder — `amc audit init`
- [ ] Federation — `amc federate init`
- [ ] Agent Passport — `amc passport init`
