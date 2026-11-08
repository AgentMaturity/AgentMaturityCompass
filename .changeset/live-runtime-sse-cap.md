---
"agent-maturity-compass": patch
---

Studio's `/events/org` and the host router's `/host/events` now admit at most 64 open event streams each (LIVE-RUNTIME-13); the next one answers 503 `{"error":"too many event streams"}` until a stream closes. The cap is per server, not per user, so one signed-in viewer can no longer open thousands of streams.
