# Compass Canon

The Compass Canon is the signed, versioned core taxonomy for AMC.

It defines:
- 5 dimensions (Strategic Agent Operations, Agent Leadership, Agent Culture, Agent Resilience, Agent Skills)
- 67-question structure and stable IDs
- 4Cs (Concept, Culture, Capabilities, Configuration)
- 5 strategy-failure risks
- 5 value dimensions

Files:
- `.amc/canon/canon.yaml`
- `.amc/canon/canon.yaml.sig`

Commands:

```bash
amc canon init
amc canon verify
amc canon print
```

Security model:
- Canon files are signed via AMC signer abstraction (Vault signer or Notary signer when trust policy requires Notary).
- If signature verification fails, workspace readiness fails closed (`/readyz` returns 503).
- Only OWNER flows can update Canon through Studio API.
- Agents never get write access to Canon.

Plugin extension rules:
- Plugins may add Canon vocabulary (for example agent type aliases or domain pack labels).
- Plugins cannot override Canon question IDs by default.
- Overrides require explicit signed allowlist under the plugin override model.
