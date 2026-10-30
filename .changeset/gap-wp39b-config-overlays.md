---
"agent-maturity-compass": patch
---

Add boot-free, deterministic input JSON Schema dumps from the existing declarative configuration and agent Zod schemas with `amc config validate --schema [declarative|agent]`.

Resolve declarative configuration in the order schema defaults, discovered workspace file, opt-in user file, `--config` file, and invocation values. As before, `--config <file>` replaces the discovered workspace file rather than layering over it, and signature checks apply to the files actually used. Objects merge by key; arrays replace as a whole. The user layer is read only when asked for: `--user-config` reads `~/.amc/amcconfig.yaml` and `--user-config <path>` names a file; `--no-user-config` is kept as an alias for the default. An existing single workspace config resolves to exactly the values it did before, and `.amc/amc.config.yaml` is still read as declarative config when it is the first file found, now with a deprecation note naming `amcconfig.yaml`. `config validate --json` and `config run --json` expose per-leaf JSON Pointer provenance, including the exact source file SHA-256. Defaults and invocation values have no file and report null file paths and digests.

Verify every present layer sidecar against the workspace's current config-signature authority. Once a signed layer is admitted, reject unsigned higher layers, including invocation value overrides. Invalid lower layers cannot be hidden by later overrides. Sidecars use the existing raw configuration signature format and async publisher; no new key scheme or executable composition path is introduced.
