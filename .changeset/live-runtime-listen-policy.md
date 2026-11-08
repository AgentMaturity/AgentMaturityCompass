---
"agent-maturity-compass": patch
---

Studio now applies the signed LAN config it was told to (LIVE-RUNTIME-03). `amc studio lan enable --bind … --port … --cidr …` takes effect when `AMC_BIND`, `AMC_STUDIO_PORT` and `AMC_ALLOWED_CIDRS` are unset; a set variable or a `studio start` flag still wins. Before, `studio start` and `amc up` always passed the schema defaults, so the signed bind, port and allow list were never used.

- Loopback (`127.0.0.1/32`, `::1/128`) is always in the effective allow list, so the local console, `amc studio healthcheck` and local agents on the loopback gateway keep working under a LAN-only list. An explicitly empty `AMC_ALLOWED_CIDRS` means loopback only.
- A public bind (`0.0.0.0` or `::`) whose allow list admits every address (`0.0.0.0/0` or `::/0`) is refused at start unless `AMC_ALLOW_PUBLIC_BIND=1` is set. `AMC_LAN_MODE=true`, the container default, does not count as that acknowledgement. The shipped Compose, Helm and Kubernetes lists are private ranges plus loopback, so they pass.
- An allow-list entry that is not a CIDR is refused at start, naming where it came from.
- The listen policy is decided, and refused, before the gateway opens its ledger session, and so are busy API, metrics, gateway and proxy ports; a start that fails after a server started closes what already started, so a refused start leaves no open gateway session or listening socket. One gap remains: a port another process takes in the moment between that check and the gateway's own listen still fails after the gateway opened its session, which stays open until the gateway closes its session on a failed listen.
- The gateway's empty allow list now means loopback only; it used to admit every address. The standalone `amc gateway start` reads `AMC_ALLOWED_CIDRS` (no LAN config) and refuses a public bind open to everyone the same way.
