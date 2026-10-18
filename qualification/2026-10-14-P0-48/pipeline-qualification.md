# P0-48 exact logging pipeline qualification — 14 October 2026

Both current workflow run blocks pass the local byte/exit proof. Four independent owned fixtures executed the exact YAML-selected CI full-suite and npm-publish Test blocks under Bash `-e -o pipefail`, using a controlled npm shim. No real npm test or publish command ran.

The producer writes 5 MiB of ASCII without a newline, then a stderr diagnostic ending in a newline. Full log artifacts exactly match all 5,242,913 expected bytes and SHA256 `c2ec3673e08dafae206033c2cf4ebe7af22b41b83c9984501d86b7e0bc7a3930`. Each console copy is 4,097 bytes: a 4,096-byte line plus newline. Producer exits 0 and 17 propagate unchanged in both workflows.

| Workflow | Producer exit | Shell exit | Full bytes | Console longest line | Result |
|---|---:|---:|---:|---:|---|
| ci | 0 | 0 | 5242913 | 4096 | pass |
| ci | 17 | 17 | 5242913 | 4096 | pass |
| publish | 0 | 0 | 5242913 | 4096 | pass |
| publish | 17 | 17 | 5242913 | 4096 | pass |

The YAML run blocks and explicit Bash shell remain byte-identical between the before/after source reads. This allows the logging evidence to carry across root’s separate one-line matrix policy edit if these exact blocks remain unchanged.

Parser: Node v24.21.0, installed YAML 2.9.0 read from the existing Node24 fixture. Runtime: local macOS `/bin/bash`, `/usr/bin/cut`; the measurement covers ASCII bytes. Hosted Node22/24 matrix completion remains separately unqualified. Recording/refusal caps and product runtime source were not changed.

Complete raw artifacts, console copies, expected files, shims and producer argv receipts remain outside the repository and qualification folder:
- `/private/tmp/p0-48-pipeline-ci-exit0-r0djzas4`
- `/private/tmp/p0-48-pipeline-ci-exit17-ya_dfztu`
- `/private/tmp/p0-48-pipeline-publish-exit0-aw9uc5sb`
- `/private/tmp/p0-48-pipeline-publish-exit17-ytn5wtfx`

The JSON companion records exact run blocks, source hashes before/after, commands, all raw paths, byte counts and every assertion. No root source, install, archive, freeze policy, test corpus or tracker was edited by this qualification.
