---
"agent-maturity-compass": patch
---

Bound every native model request with configurable per-route connect, first-byte, and stream-idle deadlines. Timeouts abort the upstream request and produce a typed, durable failure while retaining observed usage. Caller cancellation and unsupported capability refusals remain distinct from timeouts.

Harden native stream framing and preserve reported terminal usage on interrupted streams. Add offline protocol and replay fixtures for fragmented bytes, interleaved tool calls, terminal usage, and provider error events; these fixtures do not claim live model compatibility.
