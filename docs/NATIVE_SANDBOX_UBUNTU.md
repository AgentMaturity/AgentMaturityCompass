# Native shell confinement on Ubuntu 24.04

AMC's Linux shell backend uses the system Bubblewrap executable at `/usr/bin/bwrap`. It refuses execution when the launcher cannot establish its confinement. A successful binary prerequisite check alone does not prove that the kernel permits namespace setup.

On Ubuntu 24.04, the failure `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted` can be caused by AppArmor's restriction on unprivileged user namespaces. Kernel logs distinguish that host-policy refusal from an AMC command failure. Ubuntu's security team recommends a purpose-built Bubblewrap profile that permits launcher setup and restricts the resulting child; it warns that a generic unconfined profile allowing user namespaces can let arbitrary child programs bypass the restriction. See [Ubuntu's AppArmor guidance](https://discourse.ubuntu.com/t/understanding-apparmor-user-namespace-restriction/58007).

## Qualified configuration

The repository includes the exact, unmodified distro profile at `deploy/apparmor/bwrap-userns-restrict`, with its GPL-2.0-or-later notices and provenance in `deploy/apparmor/README.md`. The following combination was exercised on 2026-09-08:

| Component | Exercised value |
| --- | --- |
| OS / architecture | Ubuntu 24.04.4 LTS / ARM64 |
| Kernel | `6.8.0-117-generic` |
| Bubblewrap package | `0.9.0-1ubuntu0.1`, root-owned executable, mode `0755` |
| AppArmor package | `4.0.1really4.0.1-0ubuntu0.24.04.6` |
| Optional profile package | `apparmor-profiles` `4.0.1really4.0.1-0ubuntu0.24.04.7` |
| Profile ABI | `4.0` |
| Runtime user | Ordinary non-root user, UID `501` |

This is not acceptance for other Ubuntu, AppArmor, kernel or architecture combinations. The distro ships this profile among experimental extras, and enabling it affects other applications that use the same system Bubblewrap. A system administrator should review existing profiles and local overrides before installing it. AMC makes no global AppArmor or sysctl changes and does not install the entire extra-profiles package.

## Install the reviewed profile

Use a trusted AMC checkout or the root of an installed AMC package containing the pinned `deploy/apparmor` directory. The profile, full notices and this guide are included in the package; installation is an explicit administrator action. Run these checks on the intended **Linux sandbox host**, not inside an application container or on another workstation:

```sh
dpkg-query -W apparmor bubblewrap
stat -c '%U %G %a %n' /usr/bin/bwrap
sysctl kernel.unprivileged_userns_clone \
  kernel.apparmor_restrict_unprivileged_userns \
  kernel.apparmor_restrict_unprivileged_unconfined
sudo aa-status
sudo cat /sys/kernel/security/apparmor/profiles
sudo grep -R -n -E 'profile (bwrap|unpriv_bwrap)|/usr/bin/bwrap' /etc/apparmor.d
```

An existing `bwrap` or `unpriv_bwrap` profile, an attachment to the same executable under another name, or either `local/bwrap-userns-restrict` or `local/unpriv_bwrap` requires a review of the existing configuration. Stop the procedure in that case; preserve the existing files and loaded state. Do not replace them with this pinned profile automatically. Check that the binary and its system directories are root-owned and not writable by unprivileged users; AMC also checks this at admission.

For a host with no conflicting profile or local override, from the repository root:

```sh
set -eu
profile_source=deploy/apparmor/bwrap-userns-restrict
profile_target=/etc/apparmor.d/bwrap-userns-restrict
printf '%s  %s\n' \
  11d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9 \
  "$profile_source" | sha256sum -c -
test ! -e "$profile_target"
test ! -L "$profile_target"
test ! -e /etc/apparmor.d/local/bwrap-userns-restrict
test ! -L /etc/apparmor.d/local/bwrap-userns-restrict
test ! -e /etc/apparmor.d/local/unpriv_bwrap
test ! -L /etc/apparmor.d/local/unpriv_bwrap
sudo apparmor_parser -Q -K "$profile_source"
sudo install -o root -g root -m 0644 "$profile_source" "$profile_target"
sudo apparmor_parser -a -K "$profile_target"
```

`-Q` parses without loading policy, `-K` avoids profile cache changes, and `-a` adds rather than replaces loaded definitions. If loading fails, keep AMC's execution refusal in place and inspect the error. Remove only the newly installed, unchanged file after checking for partially loaded definitions; do not continue by disabling enforcement.

The profile does not grant an AMC tool permission. Existing signed AMC tool policy, approval requirements and the shell write-directory grant remain necessary. See the [native workflow guide](NATIVE_AGENT_WORKFLOW.md) for the application workflow. Keep namespace restrictions enabled; do not substitute an `unconfined` profile, setuid Bubblewrap, a privileged AMC process, or an unrestricted shell fallback.

## Sign the native shell grant

In the existing `.amc/tools.yaml` `bash` entry, review and add:

```yaml
nativeSandbox:
  kind: linux-bwrap
  writableDirectories:
    - workspace/output
```

Create the intended directory first, keep the `WRITE_HIGH` action class and existing argv restrictions, then explicitly run `amc tools sign` and `amc tools verify`. Directory names are exact relative workspace paths, not `/**` patterns. No grant is borrowed from `fs.write` or `fs.edit`. An empty list produces a read-only host workspace.

Do not configure shell mounts through `bash.allow.paths`: those rules require a path in each call, while the native shell's public arguments are `command` and `timeoutMs`. Old path rules are not silently migrated or bypassed. The new signed requirement refuses legacy ToolHub, non-Linux and replacement shell implementations. Native admission binds the selected immutable shell and policy digest; a policy change before launch requires a fresh call. [ToolHub's policy reference](TOOLHUB.md) explains the complete signed entry. These source changes require the final installed native CLI acceptance; the backend fixture result below is a separate historical receipt.

## Verify the operating-system prerequisite

These diagnostics use read-only host mounts inside fresh namespaces and do not grant an AMC session authority:

```sh
/usr/bin/bwrap --unshare-user --unshare-net --ro-bind / / -- /usr/bin/true
/usr/bin/bwrap --unshare-user --unshare-net --ro-bind / / --proc /proc \
  -- /bin/cat /proc/self/attr/current
```

The qualified configuration returned `bwrap//&unpriv_bwrap (enforce)`. A separate negative probe that requested `CAP_SYS_ADMIN` for a benign child `unshare --mount /usr/bin/true` operation still failed with `Operation not permitted`; the kernel attributed the denial to `unpriv_bwrap`. Passing a basic launch alone is insufficient acceptance of child restriction.

The actual compiled AMC backend then passed **36/36 fixture checks**: exact workspace read, granted write, denial of outside/home/authority/symlink reads, empty procfs, denial of ungranted writes and INET/Unix sockets, invalid-grant refusal, cancellation and timeout with no marked child-process survivors. Cancellation and timeout correctly returned an incomplete command-exit receipt (`confined: false`, `exitCode: null`) with the relevant termination flag and confirmed process cleanup; they were not reported as successful commands.

This receipt exercises the compiled backend with explicit fixture grants. **Full signed native CLI sandbox acceptance remains open.** It does not establish model quality, all-system-call confinement, compatibility with other Bubblewrap consumers, or another host configuration. Exact backend/source hashes, raw outcomes and restoration evidence are in the checkout qualification receipt at `AMC_OS/RESEARCH/2026-09-08-dsh-pi/native-bwrap-apparmor-acceptance/README.md`.

## Roll back this installation

First finish or stop workloads launched under the profile. For the unchanged file installed by the procedure above:

```sh
set -eu
profile_target=/etc/apparmor.d/bwrap-userns-restrict
printf '%s  %s\n' \
  11d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9 \
  "$profile_target" | sudo sha256sum -c -
sudo apparmor_parser -R -K "$profile_target"
sudo rm -- "$profile_target"
```

If the checksum differs, preserve the file and reconcile the intervening administrator or package change. Restore any pre-existing configuration from its own recorded snapshot rather than deleting it. During qualification, no prior Bubblewrap profile existed: unloading and removing only the added file restored all 253 configuration-file hashes, all 111 loaded profiles, and all three observed sysctl values. The original namespace refusal then reappeared, and the owned VM was stopped.
