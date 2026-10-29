# Platform qualification

AMC targets Node 22 and 24 LTS for production qualification. The package's Node 20 engine floor describes compatibility, not supported production acceptance. Each operating system and architecture needs an actual receipt; a passing macOS build cannot certify Windows or Linux.

The portable asset copier uses Node filesystem operations. `qualify:platform` packs the already-built source, installs that tarball into a fresh local consumer with an isolated home/cache, and invokes its exact installed Node entry point. It checks private-kernel absence, help, the read-only guide, initialization, a keyless signed native tool turn, two cold verifiers, missing-launcher refusal and restoration without losing evidence. The workspace path contains spaces. Nothing is installed globally.

```sh
npm run build
npm run qualify:platform -- --out tmp/platform-qualification/report.json
```

Run through npm so its actual JavaScript entry point is available on all supported platforms. This avoids relying on POSIX shell scripts or invoking a Windows `.cmd` shim as a native executable.

The report records actual OS/architecture/Node, source commit and dirty state, packed artifact digest, executed steps, raw local command artifacts and their hashes. A failure or missing prerequisite does not become a pass. A successful run on an unsupported Node major is inconclusive. Successful scratch installations are removed; unsuccessful ones are retained with the path in the receipt. The nightly workflow is configured for Ubuntu (AMD64 and ARM64), macOS and Windows on both LTS majors, plus desktop installer lanes, and uploads receipts even when a job fails (see the P2-06 section below).

On September 29, 2026, the [hosted compatibility matrix](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/36542131466) passed all six Ubuntu/macOS/Windows and Node 22/24 combinations at source commit `5dd437c3e4af3b20952124dfd57d2c55e1863cb2`. Each receipt reports a clean source tree and 13 completed qualification steps. The [receipt summary](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/AMC_OS/RELEASES/2026-09-29-completion/platform-matrix-summary.json) records runtime versions and artifact digests. Later source revisions require their own qualification; earlier Linux-container and Darwin Node 25 receipts retain their original scopes.

The runner itself does not qualify desktop installers (the P2-06 desktop lanes do), global npm command shims, real providers, OS shell sandbox enforcement, process-tree cleanup after a forced timeout or a published release. Launcher recovery here means restoring the exact privately installed Node entry point and re-verifying existing evidence. Desktop installation, uninstall/upgrade rollback and actual shell sandbox probes remain separately scoped acceptance work.

## September 11, 2026 — exclusive output ownership

AMC-1530 / `phase-a-b01-t01-platform-output-2026-09-11`: the parent directory of
`--out` must now be new, even when it would otherwise be empty or the report name
is different. Its ancestors may exist or be created. The final directory is
claimed with nonrecursive creation before scratch setup or any Git/package/CLI
command. An existing directory, file or symlink at that leaf is not reused.
Choose a fresh parent for each attempt; do not delete old evidence to retry.

The report filename is reserved exclusively with mode 0600 and its owned file
descriptor is used for the final write. Step artifacts also use exclusive
creation. A filename collision cannot overwrite a prior artifact or the reserved
report. Failure before a complete write may leave an empty or partial reserved
file; preserve it, and do not interpret its presence as a completed report.

This is output-creation ownership, not a filesystem sandbox against concurrent
hostile ancestor replacement after admission. Existing status, measured-platform,
cleanup and unsupported-runtime distinctions remain unchanged. The corresponding
synthetic regressions in `tests/platformQualificationOutputOwnership.test.ts`
passed in the September 29 full suite (14,119 tests at `5dd437c3`). The hosted
matrix above separately exercises real fresh-output qualification runs.

## P2-06 — platform lanes, the generated matrix and the reference deployment

### Platform lanes

`.github/workflows/nightly-compatibility-matrix.yml` runs every night and on demand:

| Lane | Runner label | Node | What runs |
|---|---|---|---|
| Linux AMD64 | `ubuntu-latest` | 22, 24 | `npm run qualify:platform`, `amc doctor --json` |
| Linux ARM64 | `ubuntu-24.04-arm` (not verified: confirm the label in GitHub's runner documentation before relying on it) | 22, 24 | same |
| macOS ARM64 | `macos-latest` | 22, 24 | same |
| Windows x64 | `windows-latest` | 22, 24 | same |
| Desktop, macOS ARM64 and Windows x64 | `macos-latest`, `windows-latest` | 22 | `npm run package:desktop`, `npm run package:desktop:verify`, `amc doctor --json` |

Every lane writes `lane.json` (`amc.platform-lane/1`: kind, platform, arch, Node major, commit) next to its outputs and requires the doctor's `native-modules` check to PASS. Download the lane artifacts of one workflow run into one directory, then generate the matrix for that run's commit:

```
node scripts/gen-platform-matrix.mjs --receipts <dir> --commit <sha>
```

Statuses: `qualified` (a passing receipt for this commit), `not qualified`, `inconclusive (unsupported Node)`, `not run` (no receipt, or a receipt from another commit) and `refused by design` (the native shell on Windows until P2-14). Nothing in the matrix is typed by hand; `--check` fails when the committed file differs from what the receipts produce.

GUI launcher runs are manual: Sid follows [deploy/reference/GUI_CHECKLIST.md](deploy/reference/GUI_CHECKLIST.md) and records a `gui` lane receipt.

### Reference deployment

`scripts/qualify-reference-deployment.mjs` runs the 22 checks in `qualification/reference-deployment/matrix.json` against one Helm release (topology: [deploy/reference/TOPOLOGY.md](deploy/reference/TOPOLOGY.md)). It exits 0 only when every check passed; a check that did not run is a failure; it exits 2 on a usage error, a missing tool, or recovery targets that are not filled in.

- On kind: `.github/workflows/reference-deployment.yml` (manual and nightly) with ephemeral secrets.
- On the D-03 cluster: Sid runs the same command with his credentials and `--out qualification/<date>-P2-06/cluster`, then gives the release gate a staging URL through `AMC_RELEASE_GATE_LIVE_URL`.
