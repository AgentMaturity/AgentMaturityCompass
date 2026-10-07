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

## Console
Imported federation benchmarks appear in the benchmarks views and stats. A peer added with `amc federate peer add` admits the package seal only: each benchmark inside is ingested only when its own signer is pinned in your AMC home trust list (or is that peer's publisher key), otherwise `federate import` refuses the package and prints the key id to pin.
