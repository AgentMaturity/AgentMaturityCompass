# BENCH REGISTRY

Bench registries are deterministic, signed indexes of `.amcbench` artifacts that work with file paths, LAN HTTP, or static hosting.

## Registry Layout

```text
registry/
  index.json
  index.sig
  registry.pub
  benches/<benchId>/<version>/bench.amcbench
  benches/<benchId>/<version>/bench.amcbench.sha256
```

## Create + Publish

```bash
amc bench registry init --dir ./bench-registry --id official --name "Official Registry"
amc bench registry publish \
  --dir ./bench-registry \
  --file .amc/bench/exports/workspace/workspace/latest.amcbench \
  --registry-key ./bench-registry/registry.key
amc bench registry verify --dir ./bench-registry --pubkey <recorded-registry.pub>
```

`bench registry verify` admits the index signer only when `--pubkey` or a signed trust list pins it for `artifact-seal`; the `registry.pub` in the directory never vouches for itself. Pin the copy you recorded at `init`. Without a pin it exits 1; `--allow-unpinned` gives an integrity-only exit 2 with `UNTRUSTED:` on stderr.

Serve locally/LAN:

```bash
amc bench registry serve --dir ./bench-registry --host 127.0.0.1 --port 9988
```

## Workspace Trust Model

Workspace imports are constrained by signed registry allowlists in:

- `.amc/bench/imports/registries.yaml`
- `.amc/bench/imports/registries.yaml.sig`

Each allowlist entry pins:

- registry fingerprint
- allowed bench signer fingerprints
- trust-label policy
- proof requirements

Import fails closed when any signature, digest, fingerprint, or policy gate fails.

## Import + Browse

```bash
amc bench registries
amc bench search --registry ./bench-registry --query workspace
amc bench import --registry-id official --bench <benchId>@latest
amc bench list-imports
```
