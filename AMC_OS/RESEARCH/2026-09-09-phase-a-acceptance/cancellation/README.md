# AMC-1538 cancellation acceptance preparation — 2026-09-09

**Authored preparation only. Nothing here has been executed or qualified.** Runtime source is now an explicit full candidate SHA supplied by root after the implementation batch. No helper defaults to the former failed candidate. Source/artifact correspondence still requires the separate clean-clone build receipt; matching config declarations do not prove it.

The historical `2026-09-08-dsh-pi/native-validation-acceptance/installed-7bd1e8ce/` receipts and the failed `0fcce267ad52141dbec68af02a4af665211609bd` acceptance remain unchanged. These helpers are orchestration outside the runtime candidate: record their final staged byte hashes separately. Do not relabel old receipts as results for a newly configured source.

## Source and configuration admission

Let `S` be the exact lowercase 40-character candidate commit SHA. The private guest root is exactly:

```text
/var/tmp/amc-native-validation-<S>-cancel
```

The angle-bracket token above is explanatory, not a usable path. Include the entire SHA, not a short prefix. All linked configs must carry this exact `guestRoot`, `source: S`, and explicit `allowExecution: true`. Preparation supplies no configs or invented measured hashes.

There are four separate JSON config files: host, install, qualification and consumer. Stage them and the helpers at absolute paths readable under the **same spelling on host and guest shared storage**. Guest-only Node/npm paths can differ from their host availability; the installer verifies their bytes inside Linux. Config files, helpers, input artifacts and durable receipts must be outside the private guest root. The guest root itself is persistent `/var/tmp` storage, but is always newly created: existing roots, including a symlink, are refused.

All four configs repeat these common identity fields with identical values:

| Field | Required value |
| --- | --- |
| `allowExecution` | Boolean `true`, explicitly set by root when released |
| `source` | Full lowercase candidate SHA |
| `guestRoot` | Exact full-SHA guest root above |
| `platform`, `arch` | `linux`, `arm64` |
| `nodeVersion` | Exact measured version string, such as the actual `vN.N.N`; no historical default |
| `tarball`, `tarballSha256` | Absolute staged candidate artifact path and measured SHA-256 |
| `cliSha256` | Measured installed candidate `dist/cli.js` SHA-256 |
| `nodeSha256` | Actual Linux executable SHA-256 |
| `sdkFixtureSha256` | Measured unchanged `sdk-case.mjs` bytes |
| `runner`, `runnerSha256` | Absolute staged `run.mjs` path and its measured hash |

Hashes are lowercase 64-character hex. Paths use one absolute spelling, without `.`/`..` aliases. The same source label cannot silently select a different artifact, Node, CLI, SDK fixture or consumer runner in another phase. Every phase checks `allowExecution`, not just the host.

In addition to those common fields:

| Config | Additional fields |
| --- | --- |
| **Install** | `root` equals `guestRoot`; `qualifyConfig` names the staged qualification config; absolute existing Linux `node`, `npm`, `sdkFixture`; measured `npmSha256`; fresh external `receipt` and `closureReceipt` files with existing parent directories. `sdkFixture` is the staged unchanged `sdk-case.mjs`. |
| **Consumer** | `installConfig`, `qualifyConfig`; `consumer = <guestRoot>/consumer`; `node = <guestRoot>/bin/node`; `out = <guestRoot>/acceptance`. |
| **Qualification** | `installConfig`, `consumerConfig`; `node = <guestRoot>/bin/node`; `runnerHome = <guestRoot>/runner-home`; `consumerReceipt = <guestRoot>/acceptance/receipt.json`; fresh external `receiptDirectory`; absolute `apparmorProfile` and measured `apparmorProfileSha256`. |
| **Host** | `installConfig`, `qualifyConfig`; absolute staged `installScript`, `qualifyScript`, `setupEnvironment`; verified absolute `colima`; each of those four paths has a corresponding measured `<field>Sha256`; fresh host `receiptDirectory`. |

`setupEnvironment` remains the owned VM environment record with a string-to-string `commandEnvironment` and a string array `unsetForCommands`. Root must verify profile `amc-qual` ownership and stopped state before dispatch. The host helper independently observes `colima list --json` and requires exactly one existing `amc-qual` profile with status `Stopped` before admitting any start or stop. Failed observation, malformed or ambiguous state, a missing profile or an already-running profile produces a failed receipt without starting or stopping that VM. No shared Docker/SSH setting is changed by these helpers.

The host reads all nested configs and validates their links/identities before creating its receipt directory or starting the VM. Installer and qualifier independently admit the same plan before their mutations. The installer records SHA-256 of the exact install, qualification and consumer JSON files as `configurationSha256`. Qualification and consumer compare those hashes to the private install receipt; the host also rechecks them before install and qualification. Editing a config after install therefore requires a newly staged plan/installation, not relabeling that install.

Keep the owned staging area and guest root free of concurrent writers. These local hashes establish byte consistency; they are not signatures, independent source/build attestations or confinement against a hostile filesystem mutator.

## Execution sequence after root releases the candidate

1. Root finishes the runtime batch, produces the tarball from its fresh pinned clone, retains source/build/install provenance and measures the artifact and CLI bytes.
2. Root stages these edited helpers plus the unchanged `sdk-case.mjs`, measures the actual Linux Node/npm/SDK/helper/profile bytes and populates the linked configs above. Durable paths must be new; never overwrite a previous acceptance.
3. Invoke only the newly staged host helper and config:

```text
python3 <new-host-vm.py> <new-host-config.json>
```

After successful initial stopped-state admission, the host starts its owned `amc-qual` profile, performs the fresh private install, runs qualification, stops the VM in `finally`, and records a fresh final-state observation requiring exactly one matching stopped profile. The receipt records the initial observation, admission result, whether start/stop was attempted, final observation and cleanup errors. Initial admission failure leaves start/stop unattempted and final state unobserved; `stopped=false` then means shutdown was not established by this run. Host command timeout/interruption handling terminates and reaps its process group before returning failure. Root must keep the released profile free of concurrent lifecycle operations; the read-only observation is not a VM ownership lock. No global installation or source build runs inside the installer.

`install.py` verifies artifact, Node, npm, SDK fixture and runner before creating the private guest root. It performs a normal private Linux install, verifies installed CLI bytes, observes the Node/ABI/SQLite runtime and inventories actual dependency files/symlink targets. It retains an internal `<guestRoot>/install-receipt.json` and external installation/closure receipts. The Node symlink deliberately points to the exact staged Linux binary. Installation failure leaves the new directory for owner inspection; qualification does not reuse or overwrite it.

`vm-qualify.py` checks the existing private root's source receipt, ownership, mode, plan hashes, installed CLI/SDK, tarball and executable/profile hashes before qualification mutation. It preserves the existing restrictive AppArmor procedure: require restricted namespaces, refuse an existing target/local profile, reject the unconfined profile flag, install/load only the pinned profile, then compare files, symlinks, loaded profiles and sysctls before/after. It never changes sysctls. It removes the profile only when its bytes still match its owned installation. An unexpected profile change is retained and reported as restoration failure.

`run.mjs` independently rechecks the plan, private install receipt, actual executing Node, CLI/SDK/runner bytes and platform before creating the consumer output or starting the endpoint. The SDK fixture remains read-only and uses the public installed `AMCNativeClient`: observe actual command-start marker bytes, request cancellation, close the client in `finally`, then cold-verify. Separate installed CLI processes additionally execute:

```text
<candidate-node> <installed-cli.js> agent-loop verify <session-id> --json
<candidate-node> <installed-cli.js> session verify --json
```

Require actual interrupted receipt semantics: cancellation and tree exit observed; no late marker; cancelled validation remains unavailable with a null exit code; no claim of completed confinement (`confined=false`, no enforcement claim). A locally copied pre-run monitor fingerprint checks consistency only, not independently authenticated external identity.

## Cleanup and result boundary

Keep SDK closure, each worker/process-group outcome, endpoint closure, separate cold verifier results, exact AppArmor restoration, copied sanitized receipts, private-root removal and the fresh stopped VM observation. Qualification derives its cleanup root from the same full SHA and installation receipt it admitted before mutation. It copies sanitized JSON receipts while excluding private SDK input/workspaces before deleting that exact private installation. Failed capture prevents deletion; preflight refusal before qualification leaves the installation for owner inspection. Timeout, interruption, setup failure, missing output, restoration failure or private cleanup failure cannot be accepted as a pass.

The Python helpers refuse optimized execution (`-O`): the retained qualification bodies contain mandatory assertions. Do not invoke historical helper/config paths. Review the output when an OS/process failure interrupts cleanup; this preparation has not established platform or interruption acceptance.

The eventual lane qualifies one installed **Linux ARM64 scripted cancellation path and cold verifiers**. The owned endpoint emits scripted text, never fabricated model tool calls; it is not model inference or a comparative result. It establishes neither general confinement nor Studio/browser support, other platforms, release publication or deployment. Root retains full merged-candidate suite/release-gate acceptance and the remaining AMC-1538 work.
