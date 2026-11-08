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

### Scheduled verification

Run the pinned check on a schedule, **inside** the deployment: on the host that runs Studio, with `docker exec <container>`, or with `kubectl exec deploy/<amc deployment> -- …`. The container's working directory is the workspace.

```bash
amc verify all --json --expect-monitor <monitor sha256>
```

- Host or Docker: a cron line, every 30 minutes, that alerts on failure:
  ```cron
  */30 * * * * docker exec amc-studio amc verify all --json --expect-monitor <monitor sha256> > /var/log/amc-verify.json 2>&1 || <your alert command>
  ```
  On a plain host, replace `docker exec amc-studio` with `cd <workspace> &&`.
- Kubernetes: a `CronJob` that runs `kubectl exec` against the running pod, under a Role that may only read pods and deployments and exec into pods:
  ```yaml
  apiVersion: batch/v1
  kind: CronJob
  metadata: { name: amc-verify, namespace: amc-system }
  spec:
    schedule: "*/30 * * * *"
    concurrencyPolicy: Forbid
    jobTemplate:
      spec:
        backoffLimit: 0
        template:
          spec:
            serviceAccountName: amc-verify
            restartPolicy: Never
            containers:
              - name: verify
                image: bitnami/kubectl:<pinned tag>
                command: ["kubectl", "exec", "-n", "amc-system", "deploy/<amc deployment>", "--",
                          "amc", "verify", "all", "--json", "--expect-monitor", "<monitor sha256>"]
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata: { name: amc-verify, namespace: amc-system }
  rules:
    - { apiGroups: [""], resources: ["pods"], verbs: ["get", "list"] }
    - { apiGroups: [""], resources: ["pods/exec"], verbs: ["create"] }
    - { apiGroups: ["apps"], resources: ["deployments"], verbs: ["get"] }
  ```
  Bind the Role to the `amc-verify` service account with a RoleBinding. The job execs into the Studio pod instead of mounting the data itself: the workspace claim (`workspace.persistence`, ReadWriteOnce, one replica, `Recreate`) cannot be attached by a second pod, and the `amcHomeState` claim holds this machine's anti-rollback marks, not the ledger, so a separate pod without it would accept a rolled-back revocation list. Never switch the workspace claim to ReadWriteMany or NFS: the ledger is SQLite in WAL mode and needs one host.
- Exit codes of `amc verify all`; alert on any non-zero exit, and read the reason in the JSON's `checks[].details`:

  | Exit | Meaning |
  | --- | --- |
  | 0 | PASS: every check passed and the ledger is anchored to the pinned monitor key |
  | 1 | FAIL; INCOMPLETE (a critical check was skipped); or UNANCHORED without `--allow-unanchored` |
  | 2 | integrity verified but untrusted: UNANCHORED and accepted only by `--allow-unanchored` |

- While Studio runs, the ledger check passes and names open sessions (the gateway's own, requests in flight, running tools), for example `1 session open: <id> (gateway; last signed activity 3 min ago)`. That line is normal. A `missing seal` is not: a crashed gateway session is sealed by the running Studio within about 10 minutes; any other `missing seal` is in [the evidence-corruption runbook](runbooks/evidence-corruption.md).

#### Open sessions and what verification cannot see

- **The liveness rule.** A session is sealed when its writer finishes. An unended, unsealed session is open only while its last signed row is between 0 and 15 minutes old at the verification time; a row dated in the future does not count. Any other unended or unsealed session is a `missing seal`, and when any row fails verification no session counts as open. A copy is judged at its signed time when that is trusted: a bundle at its export time when its manifest and files verify under an admitted signer, a certificate at its issue time when its signer is admitted, a restored backup at its creation time when the backup verified as trusted; otherwise at the real time.
- **The heartbeat.** When the gateway's session has been idle for 5 minutes (checked every minute) the gateway signs one payload-less heartbeat row, so a running gateway's session never ages past about 6 minutes. Heartbeat rows and crash-recovery markers never count toward scores.
- **Rows of an open session** can be removed by anyone who can write the workspace until the session is sealed: an unsealed session has no seal to contradict its newest rows.
- **The remembered passphrase.** On a local install any process of the same OS user can unlock the vault from the remembered passphrase, so the heartbeat, like every signed row, is unforgeable only by a writer without the passphrase.
- **An erased seal.** A session whose end and seal were erased reads as open until its last signed row is older than 15 minutes, and is named in the verdict meanwhile. A gateway session that a later gateway start witnessed as sealed fails at once: `Session <id> was sealed (witnessed by gateway start <event>) but its seal is missing`.
- **An erased seal with deleted rows.** A sealed gateway session whose seal was erased and whose newest rows were deleted (with the database triggers dropped) before the next gateway start reads as a crash and is re-sealed as interrupted by the next sweep, with a visible `interrupted-sealed` marker. The start event that follows witnesses it, so the same tampering after that restart is caught. Bridge request sessions are not witnessed: an erased bridge seal is re-sealed with a marker.
- **A whole-workspace rollback** is detected only by the transparency log (`amc verify all`) and by external anchoring (`amc session anchor`, `amc transparency merkle …`), not by `amc verify` alone.
- **A stop without grace.** A container stopped without a graceful shutdown (`docker rm -f`, or a stop shorter than Studio's 10-second API drain) leaves an interrupted gateway session that the next start seals with a visible marker. The Compose file gives Studio `stop_grace_period: 40s`; the Helm chart's 30-second default and `deploy/k8s/deployment.yaml` (40 seconds) also outlast the drain.

## Optional: Enterprise

- [ ] SSO/OIDC configured — `amc sso configure oidc --host-dir <host-dir> ...`
- [ ] SCIM provisioning — `amc scim init --host-dir <host-dir> --token-name <name>`
- [ ] Audit binder — `amc audit init`
- [ ] Federation — `amc federate init`
- [ ] Agent Passport — `amc passport init`
