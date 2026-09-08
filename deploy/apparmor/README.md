# Ubuntu Bubblewrap namespace admission

`bwrap-userns-restrict` is an **unmodified, separately licensed AppArmor configuration file** from Ubuntu's `apparmor-profiles` package. It is optional operator configuration, not AMC application code, and AMC does not install or load it automatically.

| Field | Pinned value |
| --- | --- |
| Ubuntu package | `apparmor-profiles` |
| Package version | `4.0.1really4.0.1-0ubuntu0.24.04.7` |
| Archive member | `usr/share/apparmor/extra-profiles/bwrap-userns-restrict` |
| Package SHA-256 | `bdac5b74d884643653565c52ed7483c9582e646ff72cce8d95d0eb8467a3139c` |
| Profile SHA-256 | `11d39094f044f0cda0febb3ad517b830301da6b2ce929664af09ee9e4dd264f9` |
| Profile ABI | `4.0` |
| License | GPL-2.0-or-later |
| Retrieved | 2026-09-08 through the owned Ubuntu VM's APT repository metadata |

The exact [Ubuntu archive package](https://ports.ubuntu.com/ubuntu-ports/pool/main/a/apparmor/apparmor-profiles_4.0.1really4.0.1-0ubuntu0.24.04.7_all.deb) was downloaded and its SHA-256 checked against APT metadata. The package was **not installed**. Only the profile and package copyright file were extracted for this directory. The source package is [Ubuntu AppArmor](https://launchpad.net/ubuntu/+source/apparmor).

Upstream/package copyright: 1998–2010 Novell/SuSE/Immunix; 2008–2014 Canonical Ltd. See the complete, unmodified package notices in [COPYRIGHT.upstream](COPYRIGHT.upstream), and the license text in [GPL-2.0.txt](GPL-2.0.txt). These terms apply to the copied profile and notices; they do not replace AMC's application license. The profile is provided without warranty, as specified in its license.

The package describes its extra profiles as experimental. This copy is pinned for the particular qualification recorded in the [operator guide](../../docs/NATIVE_SANDBOX_UBUNTU.md). A future distro profile may differ; do not overwrite an existing system profile or assume this copy is the correct policy for another release.

This profile attaches to `/usr/bin/bwrap`. It allows the trusted launcher to set up namespaces and stacks launched children with `unpriv_bwrap`, which denies capabilities. Its broad file/network permissions support that transition; **the profile itself does not implement AMC's workspace or network boundary**. AMC's existing mount configuration, capability drop, nested-user-namespace restriction and socket filter still provide those controls.
