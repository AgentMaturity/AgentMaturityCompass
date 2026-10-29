# Kubernetes and Helm Deployment

This guide is for operators running AMC Studio on an existing Kubernetes cluster. It covers the supported Helm chart, raw Kustomize manifests, and the Terraform and Pulumi Helm-release examples. For provider-specific AWS, GCP, and Azure architecture choices, see `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.

External references checked on 2026-06-16:

- Helm `install` docs: local chart paths, `--values`, `--set`, `--create-namespace`, `--wait`, and `--atomic` deployment behavior.
- Kubernetes probe docs: liveness and readiness probes for container health.
- Terraform Helm provider docs: `helm_release` models a chart release in a Kubernetes cluster and supports local chart paths.
- Pulumi Kubernetes Helm v3 Release docs: `Release` models a Helm release as if created by the Helm CLI and supports local chart paths.
- Pulumi configuration docs: stack config can set keys and Pulumi supports secret config values, but AMC bootstrap secret literals should still stay in a provider secret workflow.

## Prerequisites

- Kubernetes cluster with a working `kubectl` context.
- Helm 3 or 4 installed.
- Pulumi CLI and Node.js installed if using the Pulumi example.
- A built or published AMC image available to the cluster.
- Secret values for vault bootstrap and owner bootstrap.

## Validate the Assets Offline

No cluster access is needed:

```bash
node scripts/deploy/deploy-pack-check.mjs          # static checks, plus helm/kubeconform when installed
node scripts/deploy/deploy-pack-check.mjs --json   # {status, skipped:[{id, reason}], errors, ...}
node scripts/deploy/deploy-pack-check.mjs --require-tools   # CI: a missing helm or kubeconform fails
```

`deploy-pack-check.mjs` runs `validate-assets.mjs` and lists every tool it could not run under `skipped` with reason `binary absent`; it never reports an absent tool as passed. With `helm` installed it also runs `helm lint` and the render checks below. With `kubeconform` installed it validates the raw manifests and the default render with `-strict -summary`; set `AMC_KUBECONFORM_SCHEMA_LOCATION` to a local schema directory for a fully offline run.

`validate-assets.mjs` exits non-zero on drift. It checks that `Chart.yaml` `appVersion` equals the `package.json` version, that the quickstart image pins the published release the hosted installers use (`scripts/lib/published-installer-version.mjs`), that every values file and raw manifest parses without duplicate keys, that no Helm values, template, raw manifest or Docker asset carries a literal or default secret, that every probe path has a handler in the server source, and that the deployment stays single-writer. When `helm` is on `PATH` it also renders the chart with defaults and each example values file, confirms that `--set replicaCount=2`, `--set bootstrap.createSecret=true` without values, a `change-me` bootstrap value and `--set image.requireDigest=true` without a digest are each refused, and that `--set image.digest=sha256:...` renders `repository@digest`. When `helm` is absent it prints that rendering was not exercised.

The chart renders:

- `Deployment` with non-root containers, read-only root filesystem, one replica and `strategy: Recreate`.
- `Service` for Studio, Gateway, and proxy ports.
- `Ingress` when enabled.
- `PersistentVolumeClaim` for the AMC workspace.
- `PersistentVolumeClaim` `<release>-state` for `<AMC home>/state` (`amcHomeState`, mounted at `/home/amc/.config/amc/state`). It keeps this machine's anti-rollback marks, key-set recovery copies and applied trust-root rotations across restarts; on an `emptyDir` every restart forgets them ([KEY_LIFECYCLE.md](KEY_LIFECYCLE.md#anti-rollback)). It is never mounted into the workspace.
- `NetworkPolicy`, `PodDisruptionBudget`, `ServiceAccount` and `ConfigMap`.
- No `Secret` by default. The chart references the bootstrap secret you create. `bootstrap.createSecret=true` renders it from `bootstrap.values`, and then every value is required and any value starting with `change-me` is refused, by the template and by `values.schema.json`. No default passphrase can reach the cluster.
- A `helm test` pod (`templates/tests/governed-turn.yaml`), created only by `helm test`.

Resources are named `<release>-amc`; with release `amc` that is `amc-amc`.

### Probes

| Probe | Path | Handler | What it proves |
|---|---|---|---|
| startup | `GET /healthz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/healthz"`), payload from `buildHealthPayload` in `src/api/health.ts` | Studio answers after `amc bootstrap`. Allows up to 300 seconds before liveness applies. |
| readiness | `GET /readyz` on `studio` | `src/studio/studioServer.ts` (`pathname === "/readyz"`), `buildReadiness` | Signed policies verify, the ledger database answers, the workspace is writable, and the transparency seal and Merkle root are valid. Otherwise it returns 503 with `reasons`. |
| liveness | `GET /healthz` on `studio` | as startup | The process answers. It does not depend on policy trust, so an untrusted policy takes the pod out of service instead of restarting it in a loop. |

The notary sidecar, when enabled, uses `/readyz` and `/healthz` from `src/notary/notaryServer.ts`.

These probes do not run a governed turn. `helm test` does: see [Verify Runtime](#verify-runtime).

### Single writer

The workspace is a SQLite ledger and files on a `ReadWriteOnce` volume, and Studio takes no cross-process workspace lock. The chart therefore refuses any `replicaCount` other than 1. Both the chart and the raw manifests use `strategy: Recreate`, so an update never runs two pods against one workspace. An update has a short outage while the old pod stops and the new one passes readiness. The `PodDisruptionBudget` defaults to `maxUnavailable: 1` (chart 0.4.0), so a node drain evicts the single pod and Studio is down until it is Ready again on a node that can attach its volume. Set `podDisruptionBudget.minAvailable=1` and `podDisruptionBudget.maxUnavailable=null` to block voluntary eviction instead; a drain then waits until you scale to 0 or delete the pod deliberately.

## Create Bootstrap Secret

Create the bootstrap secret outside Git and keep real values out of Helm values and Terraform state. The chart does not create it, and the pod stays in `ContainerCreating` until it exists. Write each value to a file only you can read, so it stays out of shell history:

```bash
kubectl create namespace amc-system

kubectl -n amc-system create secret generic amc-bootstrap \
  --from-file=vaultPassphrase=./vault-passphrase.txt \
  --from-file=ownerUsername=./owner-username.txt \
  --from-file=ownerPassword=./owner-password.txt
```

With `notary.enabled=true`, add `--from-file=notaryPassphrase=...` and `--from-file=notaryAuthSecret=...`, and set `env.AMC_ENABLE_NOTARY="true"` to match. The raw manifests in `deploy/k8s/` mount the same secret name and keys, including both notary keys.

Alternatively, let the chart create the Secret. Values passed this way are stored in the Helm release record, so prefer the out-of-band Secret above or an external secret manager:

```bash
helm upgrade --install amc deploy/helm/amc --namespace amc-system --create-namespace \
  --set bootstrap.createSecret=true \
  --set-file bootstrap.values.vaultPassphrase=./vault-passphrase.txt \
  --set-file bootstrap.values.ownerUsername=./owner-username.txt \
  --set-file bootstrap.values.ownerPassword=./owner-password.txt \
  --set-file bootstrap.values.notaryPassphrase=./notary-passphrase.txt \
  --set-file bootstrap.values.notaryAuthSecret=./notary-auth-secret.txt
```

All five values are required even with the notary disabled, so enabling it later needs no new Secret. The Secret carries `helm.sh/resource-policy: keep`, so `helm uninstall`, upgrade and rollback do not delete the vault passphrase of a live workspace.

## Install With Helm

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  --set image.repository=ghcr.io/agentmaturity/amc-studio \
  --set image.tag=latest
```

Deploy by digest so the cluster runs exactly the image you tested. `image.digest` wins over `image.tag`; `image.requireDigest=true` refuses to render without one:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --atomic \
  --wait \
  --set image.repository=ghcr.io/agentmaturity/amc-studio \
  --set image.digest=sha256:<64 hex> \
  --set image.requireDigest=true
```

Record the digest you deployed (`docker image inspect --format '{{.Id}} {{.RepoDigests}}' <image>`) so a rollback can name it. Terraform (`image_digest`) and Pulumi (`imageDigest`) pass the same value through.

Internal-only profile:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  -f deploy/helm/amc/examples/values-internal-only.yaml
```

Ingress and TLS profile:

```bash
helm upgrade --install amc deploy/helm/amc \
  --namespace amc-system \
  --create-namespace \
  --atomic \
  --wait \
  -f deploy/helm/amc/examples/values-ingress-tls.yaml \
  --set image.repository=ghcr.io/agentmaturity/amc-studio \
  --set image.tag=latest
```

### KeyProvider and ledger encryption

Both are off by default, so an existing install renders exactly as before: the vault in the workspace volume (the `file` provider) holds every key, and the ledger stores inline payloads in clear.

`keyProvider.*` hands a P2-08 provider ([KEY_PROVIDERS.md](KEY_PROVIDERS.md)) its credentials the way P2-08 reads them, from Studio's environment. Which key signs a purpose is not a chart value: it stays in the workspace's signed `.amc/amc.config.yaml` `keys` section and its owner binding (`amc keys rotate --purpose ledger-row` in the pod), because binding commits a key-set generation that an unattended restart must not make.

| Value | Meaning |
|---|---|
| `keyProvider.provider` | `file` (default), `aws-kms`, `gcp-kms`, `azure-kv` or `pkcs11` |
| `keyProvider.credentialSecret.name`, `.key` | A Secret you create out of band, and the key holding the credential file. It is mounted at `/run/secrets/amc_key_provider_credential` and named by the provider's own variable: `GOOGLE_APPLICATION_CREDENTIALS`, `AWS_SHARED_CREDENTIALS_FILE`, `AZURE_CLIENT_CERTIFICATE_PATH` or `AMC_PKCS11_PIN_FILE`. Required for `pkcs11`; refused for `file`; both or neither. |
| `keyProvider.env` | Non-secret settings only. The schema admits `AWS_REGION`, `AWS_PROFILE`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AMC_PKCS11_MODULE` and `AMC_PKCS11_PROTECTION`, so a PIN or key cannot be passed as a literal. |
| `ledgerEncryption.enabled` | P2-09 field encryption ([EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md)). `true` runs `files/ledger-encryption.sh` before Studio starts. |
| `ledgerEncryption.keyRef` | The wrapping key at `keyProvider.provider`: a vault wrap-key name (`ledger-dek`, the default, for `file`), a KMS key ARN or name, a Key Vault key URL or a PKCS#11 URI. |

With `ledgerEncryption.enabled=true` the start step refuses unless the signed ops policy verifies, sets `opsPolicy.encryption.ledgerEncryptionEnabled: true` and re-signs it when it is not on yet, and, while the workspace has no `.amc/keys/ledger-dek.json`, runs `amc evidence-stores encrypt --key-provider <provider> --key-ref <keyRef>`. Any failure stops the container before Studio, so Studio never runs with encryption on and no data key. Setting `enabled` back to `false` does not switch encryption off; that is an owner change to the ops policy.

```bash
# File provider on kind or a single node (INS-1 uses this):
helm upgrade --install amc deploy/helm/amc ... \
  --set keyProvider.provider=file --set ledgerEncryption.enabled=true

# PKCS#11: PIN from a Secret, module path as a setting (needs an image with the wrapper and pkcs11js):
kubectl -n amc-system create secret generic amc-hsm-pin --from-file=pin=./pin.txt
helm upgrade --install amc deploy/helm/amc ... \
  --set keyProvider.provider=pkcs11 \
  --set keyProvider.credentialSecret.name=amc-hsm-pin --set keyProvider.credentialSecret.key=pin \
  --set keyProvider.env.AMC_PKCS11_MODULE=/usr/lib/softhsm/libsofthsm2.so \
  --set ledgerEncryption.enabled=true --set-string ledgerEncryption.keyRef='pkcs11:token=amc;object=ledger-wrap'
```

Limits:

- The repository image ships no provider SDK, PKCS#11 wrapper or pkcs11js. Any provider other than `file` needs an image built with it, or it refuses with `KEY_PROVIDER_NOT_INSTALLED`.
- Workload identity (IRSA, GKE or Azure workload identity) is not wired: the chart sets no ServiceAccount annotations, and the injected token paths sit under the read-only `/run/secrets` mount. Use a credential Secret, or credentials from the node.
- A cloud KMS needs egress on 443 to its endpoint: add it to `networkPolicy.allowedEgressCidrs`.
- Nothing in the regulated profile requires a non-file provider or ledger encryption today; turn them on as your own controls require.

## Verify Runtime

```bash
kubectl -n amc-system rollout status deploy/amc-amc
kubectl -n amc-system get pods,svc,ingress,pvc
kubectl -n amc-system port-forward svc/amc-amc 3212:3212
curl -fsS http://127.0.0.1:3212/healthz   # "version" must equal Chart.yaml appVersion
curl -fsS http://127.0.0.1:3212/readyz    # "status":"READY"; otherwise read "reasons"
```

First pin the monitor key. Studio anchors a native verdict only to a monitor key the operator pinned (`AMC_EXPECTED_MONITOR_FINGERPRINT`, or a trust list in Studio's AMC home), and the key exists only after the first bootstrap. Read it through the cluster API, not from Studio's HTTP endpoints, and pin its sha256; the chart's `checksum/config` annotation restarts the single pod with the pin:

```bash
kubectl -n amc-system exec deploy/amc-amc -- cat /data/amc/.amc/keys/monitor_ed25519.pub > ./monitor_ed25519.pub
helm upgrade amc deploy/helm/amc --namespace amc-system --reuse-values --wait \
  --set env.AMC_EXPECTED_MONITOR_FINGERPRINT="$(openssl dgst -sha256 -r ./monitor_ed25519.pub | cut -d' ' -f1)"
```

Keep that revision as your rollback target: rolling back to the install revision removes the pin.

This pin is trust on first use: you read the key from the same deployment you are about to verify. It detects a later key swap (any later verdict signed with another key fails), but it does not detect a deployment whose first bootstrap was already compromised, because a compromised deployment can hand you its own key. For an independent pin, take the fingerprint from your own record made through a channel that does not depend on this deployment (for example the key you provisioned, or a fingerprint recorded at first bootstrap by someone else), set it at install time with `--set env.AMC_EXPECTED_MONITOR_FINGERPRINT=<sha256 from your own record>`, and give the matching public key to `scripts/deploy-verify.mjs` with `--monitor-pubkey`. The kind job in `.github/workflows/deploy-pack.yml` and the rollback drill create a fresh workspace each run, so they can only pin on first use, and their receipts say so (`monitorPinSource`).

Then run the governed-turn check. The chart runs Studio in LAN mode (`env.AMC_LAN_MODE: "true"`), which refuses login until the client claims a one-time pairing code, so mint one inside the Studio pod and hand it to the test as the Secret `<release>-amc-test-pairing` (key `code`). The vault passphrase is read inside the pod and the code goes to a file, not your terminal:

```bash
kubectl -n amc-system exec deploy/amc-amc -- sh -c \
  'cd /data/amc && AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc pair create --ttl 10m' \
  | sed -n 's/.*Pairing code: \([0-9][0-9]*\).*/\1/p' > ./pairing-code.txt
kubectl -n amc-system create secret generic amc-amc-test-pairing --from-file=code=./pairing-code.txt \
  --dry-run=client -o yaml | kubectl apply -f -
helm test amc --namespace amc-system --logs
```

A code is spent by one test run; mint a new one for each `helm test`. Without the Secret the probe fails at `login` (`pairing required before login`).

The test pod claims the pairing code, logs in as the bootstrap owner (credentials mounted read-only from the bootstrap Secret, never printed), submits one native task with provider `stub` and tools `none` through `/api/v1/native-tasks`, waits for the turn to finish and calls `/verify`. The probe is `scripts/deploy/governed-turn-probe.mjs`, shipped in the chart as `files/governed-turn-probe.mjs` and run from the ConfigMap mount. It exits 0 on two verdicts, and its JSON log says which:

- `externally-anchored` gives probe status `verified`: the complete workspace ledger verified and the monitor key is the pinned one.
- `anchored-prefix` gives probe status `verified-prefix`. The gateway that Studio runs keeps its own ledger session open while it serves, so a complete-ledger verdict is impossible in a running deployment. Studio then verifies a prefix: the task's own session must be closed and sealed, every recorded row and every sealed session must verify, and each unended, unsealed legacy session (the gateway's) is named in `verificationScope.unfinalizedSessions` instead of failing. Nothing is claimed about how those sessions end, and the state is never reported as `externally-anchored`.

Anything else, including an unpinned key (`UNTRUSTED`), fails. A server that answers `/healthz` and `/readyz` but cannot run a governed turn fails.

The docker compose example runs the same probe with `docker compose -f docker/docker-compose.yml --profile verify run --rm amc-verify`. Its `amc-verify` service passes no pairing code, so against the LAN-mode image it fails at `login`; that profile was not run on 2026-10-11.

Studio admits native requests (`/api/v1/native-tasks/*`) only when the request's `Host` matches an origin in `AMC_CORS_ALLOWED_ORIGINS` or the bind host (`src/studio/nativeAdmission.ts`). With `--bind 0.0.0.0` the bind host alone is `http://0.0.0.0:3212`, so the chart ConfigMap always sets `AMC_CORS_ALLOWED_ORIGINS` to the Service origin the test pod calls, `http://<release>-amc:<service.port>` (`http://amc-amc:3212` for release `amc`), and appends `env.AMC_CORS_ALLOWED_ORIGINS` from values. Add your Ingress host there, for example `--set env.AMC_CORS_ALLOWED_ORIGINS=https://amc.example.internal`, or browser sessions through the Ingress are refused with `NATIVE_HOST_DENIED`. `helm --set` splits values on commas, so escape them for more than one origin (`--set 'env.AMC_CORS_ALLOWED_ORIGINS=https://a.example\,https://b.example'`) or put the list in a values file. In `docker/docker-compose.yml` the `amc-studio` service sets `AMC_CORS_ALLOWED_ORIGINS=http://amc-studio:3212`, so Studio admits the `amc-verify` probe that calls that origin.

Two post-deploy checks exist, and they prove different things:

| Check | Drives | Proves |
|---|---|---|
| `helm test` (`governed-turn-probe.mjs`) | a pairing claim, then one native task, provider `stub`, tools `none`, as the bootstrap owner | Studio runs a governed native turn and anchors its evidence to the pinned monitor key: `verified` over the complete ledger, or `verified-prefix` while the gateway's session is open (see above) |
| `scripts/deploy-verify.mjs` | one leased gateway chat completion | the gateway returns an `llm_response` receipt that verifies against a monitor key you pinned and commits to the response bytes ([`DEPLOYMENT_CONFIRMATION_RUNBOOK.md`](./DEPLOYMENT_CONFIRMATION_RUNBOOK.md)) |

Neither proves a real-model result: the Helm test uses the stub provider and the verifier spends one completion on whatever upstream the gateway route names. Keep both receipts.

Then open `http://127.0.0.1:3212/console`.

Health endpoints:

- `GET /healthz` for liveness.
- `GET /readyz` for readiness.
- `amc studio healthcheck` inside the container image for CLI probing.

## Terraform Example

The example under `deploy/terraform/helm-release/` manages the local Helm chart with Terraform:

```bash
cd deploy/terraform/helm-release
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

The Terraform example intentionally does not manage secret literal values. Terraform state is not the right place for those values. Create `amc-bootstrap` through your secret manager, sealed-secrets controller, External Secrets Operator, or a separate secure pipeline before applying the release.

## Pulumi Example

The example under `deploy/pulumi/helm-release/` manages the same local Helm chart with Pulumi's Kubernetes Helm v3 Release resource:

```bash
cd deploy/pulumi/helm-release
npm install
pulumi stack init dev
pulumi config set imageRepository ghcr.io/agentmaturity/amc-studio
pulumi config set imageTag latest
pulumi preview
pulumi up
```

Pulumi state/config is not the right place for bootstrap secret literals. Create `amc-bootstrap` through your secret manager, sealed-secrets controller, External Secrets Operator, or a separate secure pipeline before applying the release. The Pulumi example configures the existing bootstrap secret name and chart values; it does not store vault passphrases or owner passwords.

## Raw Kustomize Manifests

For operators who do not use Helm:

```bash
kubectl -n amc-system apply -f deploy/k8s/secret.yaml   # your filled-in copy of secret.example.yaml
kubectl -n amc-system apply -k deploy/k8s
kubectl -n amc-system rollout status deploy/amc-studio
```

The kustomization applies no Secret. The raw Deployment always mounts all five `amc-bootstrap` keys, notary keys included. Use the raw manifests for review, platform policy mapping, or environments where Helm is not permitted.

## Upgrade and Rollback

Before an upgrade, check the change offline. `rollback-check.mjs` renders the deployment pack at two revisions and diffs them. It fails on changes a rollback cannot cross: a changed Deployment selector, a changed or shrunk workspace claim, or a removed claim. Helm deletes a claim it no longer renders, and the workspace data with it.

```bash
node scripts/deploy/rollback-check.mjs --from <deployed-revision> --to WORKTREE
```

Raw manifests are always rendered. The chart is rendered only when `helm` is on `PATH`; otherwise the script says so.

Upgrade, verify, and roll back with Helm (Helm 4 accepts `--atomic` as a deprecated alias of `--rollback-on-failure`):

```bash
helm upgrade amc deploy/helm/amc --namespace amc-system --atomic --wait --timeout 10m
kubectl -n amc-system rollout status deploy/amc-amc
curl -fsS http://127.0.0.1:3212/readyz   # through the port-forward above
helm history amc --namespace amc-system
helm rollback amc <revision> --namespace amc-system --wait --timeout 10m
helm test amc --namespace amc-system --logs
```

### Container rollback drill

`rollback-drill.mjs` is the container-level rollback; `.github/workflows/deploy-pack.yml` runs it next to the kind install, upgrade and rollback. It needs a Docker daemon. It runs image A on a fresh workspace volume, runs the governed-turn probe, replaces the container with image B on the same volume, probes again, rolls back to A by its `sha256` image id and probes a third time. The JSON receipt holds both image ids and the six step results. Any failed step fails the drill and skips the rest. Each container runs with `AMC_CORS_ALLOWED_ORIGINS=http://127.0.0.1:<port>` so Studio admits the probe's `127.0.0.1` host. The probe waits up to `--ready-timeout-ms` (default 180000 in the drill) for `/healthz` and `/readyz`, because a container that has just started refuses connections. `--secrets-dir` is required: it must hold `amc_vault_passphrase`, `amc_owner_username` and `amc_owner_password`, which bootstrap the drill workspace and log the probe in. Without it the drill exits 2 with `--secrets-dir is required`; with it and no daemon it exits 2 with `docker daemon unavailable`.

```bash
node scripts/deploy/rollback-drill.mjs --image-a amc-studio:s1-a --image-b amc-studio:s1-b \
  --secrets-dir ./drill-secrets --out ./rollback-receipt.json
```

### Upgrading to chart 0.4.0

Chart 0.4.0 (P2-06) changes the `PodDisruptionBudget` default from `minAvailable: 1` to `maxUnavailable: 1`, so node drains no longer block on the single pod. To keep the old behaviour, set `podDisruptionBudget.minAvailable=1` and `podDisruptionBudget.maxUnavailable=null`; setting both, or neither, fails the render. It also adds `metrics.*` values, off by default: `metrics.enabled=true` exposes Prometheus metrics on port 9464 inside the cluster, admitted by the NetworkPolicy from the monitoring namespace only, with optional ServiceMonitor and PrometheusRule objects ([deploy/reference/MONITORING.md](deploy/reference/MONITORING.md)). It adds `keyProvider.*` and `ledgerEncryption.*` values whose defaults render nothing new ([KeyProvider and ledger encryption](#keyprovider-and-ledger-encryption)). The reference deployment runbooks are in [deploy/reference/](deploy/reference/TOPOLOGY.md).

### Upgrading to chart 0.3.0

Chart 0.3.0 adds the `<release>-state` claim for `<AMC home>/state` (P1-08). A plain upgrade creates it empty, so this machine's anti-rollback marks start again from the workspace transparency log; nothing else changes. Set `amcHomeState.persistence.enabled=false` only for a disposable install.

### Upgrading from chart 0.1.0

Chart 0.1.0 rendered its own `amc-bootstrap` Secret with fixed `change-me-*` values. Chart 0.2.0 renders no Secret unless `bootstrap.createSecret=true`, so a plain upgrade makes Helm delete that Secret and the new pod cannot mount it. Before upgrading, keep the Secret and replace its values:

```bash
kubectl -n amc-system annotate secret amc-bootstrap helm.sh/resource-policy=keep
```

Facts for a workspace bootstrapped by chart 0.1.0 with its default Secret:

- Chart 0.1.0 always rendered `amc-bootstrap` with published values: `change-me-vault-passphrase`, `change-me-owner-username`, `change-me-owner-password`, `change-me-notary-passphrase` and `change-me-notary-auth-secret`. Anyone who has read this repository knows them.
- That workspace's vault was created with the published passphrase, so treat the vault and the signing keys it protects as exposed. Replacing the Secret's values does not change the passphrase the existing vault was encrypted with.
- No `amc vault` subcommand at this revision changes a vault passphrase. `rotate-keys` rotates the monitor signing key; it does not re-encrypt the vault under a new passphrase.
- Chart 0.2.0 does not repair such a workspace. It only stops new installs from receiving a published passphrase.

Remediation: TODO(Sid, P0-14 with P0-37). Sid writes this text. Until he does, this guide documents no remediation and claims no fix for a workspace bootstrapped by chart 0.1.0.

`--atomic` rolls back a failed upgrade automatically. A rollback restores manifests, not workspace data: the ledger on the claim keeps whatever the newer version wrote. Snapshot the volume before an upgrade if you need to restore data too.

Raw manifests:

```bash
kubectl -n amc-system rollout history deploy/amc-studio
kubectl -n amc-system rollout undo deploy/amc-studio --to-revision=<revision>
kubectl -n amc-system rollout status deploy/amc-studio
```

`revisionHistoryLimit: 2` keeps the previous ReplicaSet for `rollout undo`. A later `kubectl apply -k` reapplies whatever the checkout contains, so check out the matching revision before you reapply.

### What was exercised

On 2026-10-03, on macOS (Darwin 25.6.0, arm64) with Node v25.5.0, `node scripts/deploy/deploy-pack-check.mjs --json` (status `passed`, `helm` and `kubeconform` skipped as `binary absent`) and `node scripts/deploy/rollback-check.mjs --from 8f57ce63d8331f1bef1c2a18fde82a7e8f4511da --to WORKTREE` were run against the change that added them. `helm`, `kubectl`, `kustomize` and `kubeconform` were not installed and the Docker daemon was not running. Not exercised: Helm rendering, `helm lint`, `values.schema.json` validation by Helm (the schema was checked with Ajv), `helm test`, kubeconform, the container rollback drill (it exited 2, `docker daemon unavailable`), the compose `verify` profile, and any cluster install, upgrade or rollback. The governed-turn probe was exercised only against stub HTTP servers. On 2026-10-04 the rendered `AMC_CORS_ALLOWED_ORIGINS` value (`http://amc-amc:3212`, computed from the template expression because `helm` was absent) was passed to Studio's own `nativeAllowedBrowserOrigins` and `assertNativeBrowserAdmission` in a unit test (`tests/helmChartOrigins.test.ts`): the test pod's `GET` and `POST` were admitted, and without the value the `GET` was refused with `NATIVE_HOST_DENIED`. That admitted path was proven with a unit test against `src/studio/nativeAdmission.ts`, not in a cluster, a compose run or a drill run. On that date the commands in this section were the documented procedure, not a recorded cluster run.

On 2026-10-11 the slice C checks ran locally on macOS 26.6.2 (Darwin 25.6.0, arm64) with Node v25.5.0, helm v4.3.0, kubeconform v0.8.0, kind v0.33.0 (node image `kindest/node:v1.37.0`), kubectl v1.37.1 and Docker 29.5.2 (linux/arm64) in a colima VM, using the steps of `.github/workflows/deploy-pack.yml`, which pins the same tool versions and has not yet run in CI. Results, with receipts in [`qualification/2026-10-11-P0-14/`](../qualification/2026-10-11-P0-14/README.md):

- `deploy-pack-check.mjs --json --require-tools` passed (helm lint, renders, kubeconform). The four negative renders were refused, each naming its reason, and the default render held no `kind: Secret`; the same checks against chart 0.1.0 fail.
- Kind: `helm install --wait`, the monitor-key pin (`helm upgrade`, revision 2), `helm upgrade`, and `helm rollback amc 2 --wait` succeeded. Both `helm test` runs claimed a pairing code, logged in, ran the stub-provider turn and passed with status `verified-prefix` (Studio verdict `anchored-prefix`): the task's session sealed, the monitor key pinned, and the running gateway's session named as the only unfinalized session.
- `deploy-verify.mjs` passed all five checks against the kind release: a lease minted inside the pod, the monitor key read through the cluster API, and a loopback stub upstream on the `/local` route, so no real model was called.
- The container rollback drill with image A built from `origin/main` failed `probe-a` at `verify`: main's Studio still runs the complete-ledger check, which the live gateway session fails. With image A built from a commit that has the verify fix (the branch before its merge with `main`) and image B from the merged head, all six steps passed with two `sha256` image ids and `verified-prefix` on every probe. The drill waits for A's first bootstrap to finish before it pins the key and restarts A. Each replaced container leaves its gateway session unsealed (`docker rm -f` stops it without a graceful shutdown), and every later verdict names those sessions.

The first kind install failed until the pods stopped automounting the service-account token. An earlier `helm test` pass was void: the probe, started through the ConfigMap's symlink, ran nothing. Before the verify fix both `helm test` runs failed at `verify`. All are fixed. These are local runs on one architecture, not a production deployment.

Behaviour statements in this guide and where they were checked (retrieved 2026-10-03):

- Deployment selector immutable after creation; `kubectl rollout undo --to-revision`; `revisionHistoryLimit` keeps old ReplicaSets for rollback; `Recreate` kills existing pods before creating new ones: [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).
- Kubernetes does not support shrinking a claim below its current size: [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).
- Helm deletes a resource the chart no longer renders on upgrade or rollback unless it carries `helm.sh/resource-policy: keep`: [Helm chart tips and tricks](https://helm.sh/docs/howto/charts_tips_and_tricks/).
- `helm test` runs templates annotated `helm.sh/hook: test` and passes on container exit 0: [Helm chart tests](https://helm.sh/docs/topics/chart_tests/).
- `values.schema.json` is applied by `helm install`, `upgrade`, `lint` and `template`: [Helm charts, schema files](https://helm.sh/docs/topics/charts/).
- A digest pins the code a pod runs: [Kubernetes Images](https://kubernetes.io/docs/concepts/containers/images/).
- Not re-verified against official docs: that `accessModes`, `storageClassName` and `volumeName` are immutable on a bound claim (`rollback-check.mjs` flags those changes as hazards on that assumption).

## Remaining Cloud Boundaries

- AMC still does not publish a hosted SaaS endpoint in this repo.
- Provider-specific AWS, GCP, and Azure reference architectures are documented in `docs/CLOUD_REFERENCE_ARCHITECTURES.md`.
- Terraform and Pulumi Helm-release examples are present; provider-specific full-stack infrastructure modules remain future work.
- Validate image provenance and registry availability in your deployment environment before production rollout.
