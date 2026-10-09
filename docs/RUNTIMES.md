# Runtime Integrations

AMC includes built-in runtime integrations for:

- Claude CLI (`claude`)
- Gemini CLI (`gemini`)
- OpenClaw CLI (`openclaw`)
- Generic process wrap (`amc wrap any`)
- Universal HTTP provider routing via AMC gateway (`amc gateway start`)

## Detection and Doctor

Run:

```bash
amc doctor
```

Doctor checks:

- executable resolution via config or `PATH`
- capability discovery via `--help`
- basic wrap readiness via `--version` probe
- gateway config signature validity
- gateway auth env completeness (names only, no secret output)
- supervise recommendations (`--route`) and proxy hints

## Config Template

File: `.amc/amc.config.yaml`

```yaml
runtimes:
  claude:
    command: "claude"
    argsTemplate: []
  gemini:
    command: "gemini"
    argsTemplate: []
  openclaw:
    command: "openclaw"
    argsTemplate: []
  any:
    command: ""
    argsTemplate: []
security:
  trustBoundaryMode: shared
supervise:
  extraEnv: {}
  includeProxyEnv: true
  customBaseUrlEnvKeys: []
```

Use `argsTemplate` for harness mode if discovery fails in your environment.

## Wrap Mode Examples

```bash
amc wrap claude -- chat
amc wrap gemini -- prompt "hello"
amc wrap openclaw -- run
amc wrap any -- python my_agent.py
```

## Gateway Mode Examples

```bash
amc gateway init --provider "OpenAI"
amc gateway start --config .amc/gateway.yaml
amc gateway status
amc gateway verify-config
```

Route through gateway:

```bash
amc supervise --route http://127.0.0.1:3210/openai -- node myAgent.js
amc supervise --route http://127.0.0.1:3210/anthropic -- python app.py
```

## Gateway Config Template

File: `.amc/gateway.yaml`

```yaml
listen:
  host: "127.0.0.1"
  port: 3210
redaction:
  headerKeysDenylist: ["authorization", "x-api-key", "api-key", "x-openai-key"]
  jsonPathsDenylist: ["$.api_key", "$.key"]
  textRegexDenylist:
    - "(?i)sk-[A-Za-z0-9]{10,}"
    - "(?i)bearer\\s+[A-Za-z0-9._-]{10,}"
upstreams:
  openai:
    baseUrl: "${OPENAI_BASE_URL:-https://api.openai.com}"
    auth:
      type: "bearer_env"
      env: "OPENAI_API_KEY"
routes:
  - prefix: "/openai"
    upstream: "openai"
    stripPrefix: true
    openaiCompatible: true
proxy:
  enabled: true
  port: 3211
  allowlistHosts:
    - "api.openai.com"
  denyByDefault: true
```

Every request to an upstream resolves the `baseUrl` host again and connects only to an address it checked. A host that resolves to a loopback, private, link-local or otherwise non-public address is refused (HTTP 403 and a `NETWORK_EGRESS_BLOCKED` audit event naming the address) unless the upstream opts in: write the IP literal as the `baseUrl` host, list the addresses under `allowNonPublicAddresses` (for example a private endpoint reached by name over TLS), or set `allowLocalhost: true` for 127.0.0.1 and ::1. A `baseUrl` expanded from an environment variable (`${OPENAI_BASE_URL}`) opts nothing in by its literal host, because the configuration signature does not cover the variable.

## Harness Mode Notes

`amc run --claim-mode harness --harness-runtime claude`

Harness expects strict JSON output and validates with `zod`. If invalid JSON repeats, AMC falls back to owner interactive input.
