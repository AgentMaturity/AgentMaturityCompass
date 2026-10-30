---
"agent-maturity-compass": patch
---

Add boot-free, deterministic input JSON Schema dumps from the existing declarative configuration and agent Zod schemas with `amc config validate --schema [declarative|agent]`.

Resolve declarative configuration in the order built-in defaults, workspace file, optional `~/.amc/amcconfig.yaml` user file, explicit `--config` file, and invocation values. Objects merge by key; arrays replace as a whole. `--user-config` selects a user file and `--no-user-config` disables it. `config validate --json` and `config run --json` expose per-leaf JSON Pointer provenance, including the exact source file SHA-256. Defaults and invocation values have no file and report null file paths and digests.

Verify every present layer sidecar against the workspace's current config-signature authority. Once a signed layer is admitted, reject unsigned higher layers, including invocation value overrides. Invalid lower layers cannot be hidden by later overrides. Sidecars use the existing raw configuration signature format and async publisher; no new key scheme or executable composition path is introduced.
