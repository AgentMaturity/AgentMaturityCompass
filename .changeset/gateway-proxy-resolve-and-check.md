---
"agent-maturity-compass": major
---

Security: the gateway forward proxy (plain HTTP and `CONNECT`) now resolves the destination for every connection and refuses it when any address is non-public (loopback, private, link-local including 169.254.169.254, CGNAT, unique-local, multicast, reserved, and IPv6 forms carrying such an IPv4 address) unless that exact IP literal is in `proxy.allowlistHosts`. A listed name that does not resolve is refused. The connection goes only to an address it checked, so a DNS change between the check and the socket (DNS rebinding) cannot send an allowed name to an internal host. Before, the proxy checked names only and let the system resolve them again at connect time.

Breaking for operators who reach an internal host by name through the proxy: list that host's IP literal next to its name in `allowlistHosts`. With `denyByDefault: false` every name still passes by name, but its addresses now meet the same non-public rule.

`NETWORK_EGRESS_BLOCKED` audit rows now carry the refusal `reason` (naming the refused address) and `resolvedAddresses`; proxy request and tunnel rows record `resolvedAddresses`. New helper `resolveAndCheck(host, policy)` in `src/enforce/egressAllowlist.ts` returns `{ addresses, decision }`; an empty resolution is a refusal (`EGRESS_UNRESOLVED`).

For routes with `refuseRequestFields`, the gateway now resolves the guarded upstreams again for every request and every proxied connection instead of once at start, and pins each request's upstream connection to the addresses its field decision used. A pinned connection is always a new socket (keep-alive reuse would bypass the pin), so proxied plain-HTTP requests and requests on such routes no longer reuse upstream connections. Upstreams in the signed gateway configuration are not held to the non-public rule, so local model servers keep working.
