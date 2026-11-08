# Declarative evaluation config (`amcconfig.yaml`): layers and provenance

`amcconfig.yaml` is the declarative EVALUATION config (agents, providers, thresholds, assurance packs, CI) read by `amc config validate`, `amc config run` and the pipeline. It is not the native harness's runtime policy: hooks, MCP scopes, skills and plugins have their own files, documented in [NATIVE_HOOKS.md](NATIVE_HOOKS.md), [NATIVE_MCP.md](NATIVE_MCP.md), [NATIVE_SKILLS.md](NATIVE_SKILLS.md) and [PLUGINS.md](PLUGINS.md).

## Layers

Values resolve, lowest first: built-in schema defaults, the discovered workspace file (`amcconfig.yaml` in the workspace or `.amc/`), the user layer (`~/.amc/amcconfig.yaml` or a named file, read only when `--user-config` opts in), an explicit `--config` file (which replaces the discovered workspace file), and invocation flags. Objects merge by key; arrays replace whole. A layer with a valid `<file>.sig` is signed; once a signed layer is in the stack, an unsigned later layer or flag is refused rather than letting it override a signed base. The user-over-workspace order is a deliberate opt-in contract. There is no managed (machine-wide) or project-local layer in this build.

## Provenance

Every resolved leaf is attributed to its layer, file and file sha256 by JSON Pointer. `amc config validate --json` and `amc config run --json` print that `provenance` map, plus `history`: every value each leaf was given, in layer order, with the winner last. `amc config provenance` is the human view:

```sh
amc config provenance                          # every leaf: layer, file, how many lower values it shadows
amc config provenance /thresholds/minOverallLevel --user-config ~/.amc/amcconfig.yaml
# /thresholds/minOverallLevel: 4 from user /Users/me/.amc/amcconfig.yaml (sha256 …)
#   shadowed: 1 from workspace /repo/amcconfig.yaml
amc config provenance /version --json
```

A leaf no layer set reports `default` and no history. A pointer that is not a resolved leaf is refused with the known pointers. `amc config explain` (runtime environment sources and signature checks) and `amc config print` are unchanged and cover the runtime config, not this file.
