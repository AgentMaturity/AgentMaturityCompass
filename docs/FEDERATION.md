# Federation Sync

Federation enables offline cross-org sharing of privacy-safe trust artifacts.

## What Gets Shared
- Benchmarks (`.amcbench`)
- Certificates (`.amccert`)
- BOM files (`*.json` + `*.sig`)
- Transparency Merkle root/signature (+ available inclusion proofs)

## What Does NOT Get Shared
- Raw evidence DB
- Raw transcripts
- Tool outputs
- Secrets, keys, lease tokens

## Config
- `.amc/federation/federation.yaml` (+ `.sig`)
- Peer trust anchors in `.amc/federation/peers/*.json` (+ `.sig`)

## Commands
- `amc federate init --org "My Org"`
- `amc federate verify`
- `amc federate peer add --peerId partner --name "Partner" --pubkey publisher.pub`
- `amc federate peer list`
- `amc federate export --out .amc/federation/outbox/latest.amcfed`
- `amc federate import .amc/federation/outbox/latest.amcfed`
- `amc federate verify-bundle latest.amcfed --pubkey <peer-publisher.pub>` (`federate import` admits only peers added with `amc federate peer add`)

## Import layout and containment
A package is imported to `.amc/federation/inbox/<identity>/<manifestId>/`. `<identity>` names the key that was admitted, not the org the manifest claims: the `peerId` of the peer added with `amc federate peer add` whose publisher key signed the package, or `key-<first 16 hex of the key id>` when only a key pinned in your AMC home trust list admitted it. `amc federate import` still prints and returns the manifest's `sourceOrgId`, as claimed. Peer A therefore cannot file a package under peer B's directory.

The manifest is signed by the peer but is not trusted to name paths. `sourceOrgId` and `manifestId` must be one safe path segment (`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`), and each `files[].path` must be a relative POSIX path inside the package (no leading `/`, drive letter, backslash, empty, `.` or `..` segment). A package that breaks these is refused as an invalid manifest. `federate verify-bundle` and `federate import` additionally refuse any resolved path that leaves the extraction root or the inbox directory, and an import resolves every path before it writes the first file, so a package refused for its paths writes nothing.

The bundle is extracted once to verify it and again to copy from. `federate import` records the sha256 of every file verification admitted (the manifest's files plus `manifest.json`, `manifest.sig` and `public-keys/publisher.pub`) and refuses with "changed between verification and import" before writing anything unless the second extraction matches, so a bundle replaced in between is never imported.

A benchmark inside a package is checked the same way before it reaches your stats: its `benchId` must be one safe path segment and its import directory must stay inside `.amc/benchmarks/imported`, whoever signed it.

## Console
Imported federation benchmarks appear in the benchmarks views and stats. A peer added with `amc federate peer add` admits the package seal only: each benchmark inside is ingested only when its own signer is pinned in your AMC home trust list (or is that peer's publisher key), otherwise `federate import` refuses the package and prints the key id to pin.
