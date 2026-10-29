# Install the reference deployment

Topology: [TOPOLOGY.md](TOPOLOGY.md). Full chart reference: [docs/KUBERNETES_HELM_DEPLOYMENT.md](../../KUBERNETES_HELM_DEPLOYMENT.md). Each step names the check in `qualification/reference-deployment/matrix.json` that exercises it.

1. Create the namespace and the `amc-bootstrap` Secret out of band with five keys: `vaultPassphrase`, `ownerUsername`, `ownerPassword`, `notaryPassphrase`, `notaryAuthSecret`. Never pass them as Helm values. (check INS-1)
2. Install by digest only, with a KeyProvider and ledger encryption on: `helm install amc-rd deploy/helm/amc -n <ns> --set image.repository=<repo> --set image.digest=sha256:<digest> --set image.requireDigest=true --set keyProvider.provider=file --set ledgerEncryption.enabled=true --wait --timeout 300s`. Kind runs use the file provider; on the D-03 cluster use the provider Sid chooses ([docs/KUBERNETES_HELM_DEPLOYMENT.md](../../KUBERNETES_HELM_DEPLOYMENT.md#keyprovider-and-ledger-encryption)). Studio must be Ready within the 300 s startup budget (30 startup probes of 10 s). (check INS-1)
3. Confirm the release: `helm get manifest amc-rd -n <ns>` shows `@sha256:`, no `change-me` value and no `kind: Secret`. (check INS-1)
4. Pin the monitor key. On a real install, take its sha256 from the bootstrap host before exposing Studio, then `helm upgrade --reuse-values --set env.AMC_EXPECTED_MONITOR_FINGERPRINT=<sha256>`. Kind runs read it from the pod (trust on first use). (check INS-1)
5. Run `helm test amc-rd -n <ns> --logs` after minting a pairing code (`amc pair create` in the pod, stored as Secret `<fullname>-test-pairing`). The governed-turn probe must report `verified` or `verified-prefix`. (check INS-1)
6. Run `node scripts/deploy-verify.mjs` with the pinned monitor key; all five checks (health, readiness, governed-turn, receipt-signature, receipt-binding) must pass. (check INS-1)
7. Expect refusals: a `change-me` bootstrap value, `image.requireDigest=true` without a digest, and `replicaCount=2` each make `helm install` exit non-zero with the chart's message and create nothing. (check INS-2)

8. After the governed turn, confirm encryption in the workspace, not only in the values: `amc ops verify` passes, the signed ops policy has `ledgerEncryptionEnabled: true`, `.amc/keys/ledger-dek.json` names the chosen provider, and every inline payload in `.amc/evidence.sqlite` starts with `amcenc:v1:`. (check INS-1)

The PKCS#11 (SoftHSM) variant of INS-1 is pending: the repository image has no PKCS#11 wrapper or pkcs11js, and adding them is a new dependency.
