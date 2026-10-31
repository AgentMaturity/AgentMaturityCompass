# P2-06 D5: chart KeyProvider selection and ledger encryption (2026-10-29)

Defect D5 (`qualification/2026-10-29-P2-06/README.md`): the Helm chart could not select a P2-08 KeyProvider or switch on P2-09 ledger field encryption, so INS-1 failed on its "KeyProvider and ledger encryption on" criterion.

## What changed

- **Chart values, mapped onto the existing surfaces.**
  - `keyProvider.*` hands a P2-08 provider its credential the way P2-08 reads it: from a file named by the provider's own variable, mounted from a Secret created out of band.
  - Purpose-key selection stays where P2-08 keeps it: the workspace's signed `keys` config and the owner's `amc keys rotate`. The chart does not bind keys.
  - `ledgerEncryption.enabled` runs the documented P2-09 owner steps before Studio (`files/ledger-encryption.sh`): verify the signed ops policy, set `ledgerEncryptionEnabled` and re-sign, then `amc evidence-stores encrypt --key-provider <p> --key-ref <ref>` while the workspace has no data key.
  - Defaults render byte-identically to the base chart (`helm-renders.txt`).
- **Product fix found on the way.** `amc evidence-stores encrypt` with the file provider failed in a fresh CLI process ("Vault locked") even with `AMC_VAULT_PASSPHRASE` set. `src/keys/providers/file.ts` now opens the vault from that variable before creating the wrap key, as signing does. Red/green: `mutations.json` R1.
- **Harness.**
  - INS-1 installs with `keyProvider.provider=file` and `ledgerEncryption.enabled=true`. After the governed turn it checks the running workspace: the signed policy is on, the active data key is wrapped by the file provider, and every inline payload is ciphertext.
  - `--only` reruns named checks; every other check is recorded as not run, so a partial run never passes.

## Results

| Item | Result |
|---|---|
| Kind rerun, image N at `2866b1ec6` (repository Dockerfile, no patch), `amc-studio@sha256:53d81cb1…` (containerd import) | `qualification/2026-10-29-P2-06/kind-d5/`: INS-1 **passed** (8/8 criteria; 10 encrypted inline rows, 0 in clear), INS-2 passed, BR-1 passed (encrypted ledger backed up during a turn and restored into a new namespace). The other 19 checks were not selected and count as failed. |
| Mutations | 15 of 15 killed, plus one red/green (`mutations.json`) |
| Tests | 39 files touching the changed modules, 468 tests passed (list in `receipt.json`) |
| Checks | build, typecheck, typecheck:tests, lint, check:gates, check:dead-code, check:duplicates, check:counts, check:api-ref and check:docs-drift all exit 0 |

Image N was built at `2866b1ec6`. The two later commits change only a test assertion and a JSDoc type in the harness script; nothing that reaches the image.

## Pending

- **SoftHSM (PKCS#11) variant of INS-1.** The repository image has no PKCS#11 wrapper and no pkcs11js. pkcs11js compiles natively, so adding it is a new dependency. The chart already renders the PKCS#11 wiring (`helm-renders.txt`).
- **CR-4 (KeyProvider outage).** No networked provider runs on kind, for the same reason.
- **Cloud KMS on the D-03 cluster.** Sid chooses the provider and supplies credentials; the image needs that provider's SDK.
- **Workload identity.** Not wired: the chart sets no ServiceAccount annotations, and injected token paths would sit under the read-only `/run/secrets` mount.
- **`check:qualification`.** It reports 210 problems across folders that predate this change. It was not part of this item's gate list.

## Environment

- macOS 26.6 (arm64) with Node v22.23.3.
- Image built inside the colima VM `amc-s7f` (Docker with buildx). The host Docker CLI has no buildx, and the Dockerfile needs BuildKit.
- kind v0.33.0 with Kubernetes v1.37.0, cluster `amc-p206`. The kind API was reached through an ssh tunnel, because colima's port forward failed. The cluster and image N were deleted afterwards.
- Secrets were random per run (`--ephemeral-secrets`). Recovery targets were an engineering-placeholder scratch file, as in the earlier runs.
