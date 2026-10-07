# Plugin Registry

AMC registries are deterministic, signed indexes for `.amcplug` packages.

## Registry Layout

```text
registry/
  index.json
  index.sig
  registry.pub
  registry.key
  packages/<pluginId>/<version>/plugin.amcplug
  packages/<pluginId>/<version>/plugin.amcplug.sha256
```

- `index.sig` is signed with `registry.key`.
- Consumers pin `registry.pub` fingerprint in signed workspace config.

## Create and Publish

```bash
amc plugin registry init --dir ./registry --registry-id official --registry-name "Official Registry"
amc plugin registry publish --dir ./registry --file ./dist/my.amcplug --registry-key ./registry/registry.key
amc plugin registry verify --dir ./registry --pubkey <recorded-registry.pub>
```

Serve locally (LAN/offline):

```bash
amc plugin registry serve --dir ./registry --host 127.0.0.1 --port 9876
```

## Workspace Trust Configuration

Configured in signed `.amc/plugins/registries.yaml`:

- pinned registry fingerprint
- allowed publisher fingerprints
- allowed risk categories

Apply config:

```bash
amc plugin registries-apply --file ./registries.yaml
```

## Search and Install

```bash
amc plugin search --registry http://127.0.0.1:9876 --query "policy"
amc plugin install --registry official amc.plugin.example@1.0.0
```

Install is not immediate; it creates an approval request that must pass quorum before `amc plugin execute`.
