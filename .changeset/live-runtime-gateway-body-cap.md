---
"agent-maturity-compass": patch
---

The gateway now caps request bodies (LIVE-RUNTIME-01). A request whose body passes `AMC_GATEWAY_MAX_REQUEST_BYTES` (default 8 MiB, accepted range 1024 to 268435456) is answered 413 `{"error":"payload too large"}`, audited as `GATEWAY_PAYLOAD_TOO_LARGE`, and never forwarded; the forward proxy applies the same cap. A request that carries no lease is refused with 401 before any of its body is read. Before, the gateway buffered request bodies of any size before it checked the lease, so any client that could reach the port could exhaust its memory. Upstream responses are not capped. `amc config print` lists the new variable.

The signed ops policy's evidence limits still apply to what the gateway records: by default 64 KiB per evidence event (`retention.maxPayloadBytesPerEvent`) and 10 MiB per blob (`retention.maxBlobBytes`). A model call whose recorded request or response is larger than those limits fails with 502 until you raise them in `.amc/ops-policy.yaml` and sign it again.
