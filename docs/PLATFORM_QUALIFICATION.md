# Platform qualification

AMC targets Node 22 and 24 LTS for production qualification. The package's Node 20 engine floor describes compatibility, not supported production acceptance. Each operating system and architecture needs an actual receipt; a passing macOS build cannot certify Windows or Linux.

The portable asset copier uses Node filesystem operations. `qualify:platform` packs the already-built source, installs that tarball into a fresh local consumer with an isolated home/cache, and invokes its exact installed Node entry point. It checks private-kernel absence, help, the read-only guide, initialization, a keyless signed native tool turn, two cold verifiers, missing-launcher refusal and restoration without losing evidence. The workspace path contains spaces. Nothing is installed globally.

```sh
npm run build
npm run qualify:platform -- --out tmp/platform-qualification/report.json
```

Run through npm so its actual JavaScript entry point is available on all supported platforms. This avoids relying on POSIX shell scripts or invoking a Windows `.cmd` shim as a native executable.

The report records actual OS/architecture/Node, source commit and dirty state, packed artifact digest, executed steps, raw local command artifacts and their hashes. A failure or missing prerequisite does not become a pass. A successful run on an unsupported Node major is inconclusive. Successful scratch installations are removed; unsuccessful ones are retained with the path in the receipt. The nightly workflow is configured for Ubuntu, macOS and Windows on both LTS majors and uploads receipts even when a job fails.

This source implementation awaits the final combined validation pass. No workflow has been dispatched as part of implementation. Existing earlier Linux-container and Darwin Node 25 receipts retain their original scopes.

The runner does not qualify desktop installers, global npm command shims, real providers, OS shell sandbox enforcement, process-tree cleanup after a forced timeout or a published release. Launcher recovery here means restoring the exact privately installed Node entry point and re-verifying existing evidence. Desktop installation, uninstall/upgrade rollback and actual shell sandbox probes remain separately scoped acceptance work.

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
are authored only. No qualification, import, test or fixture execution is
authorized by this addendum.
