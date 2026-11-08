---
"agent-maturity-compass": patch
---

Studio's `/events/org` and the host router's `/host/events` now admit at most 64 open event streams each, and at most 4 per signed-in user, token or agent (LIVE-RUNTIME-13, SR-8). A fifth stream for the same user closes that user's oldest stream (the console reconnects it), so one viewer can neither open thousands of streams nor hold all 64 and lock everyone else out. When 64 streams are open, a new user's stream answers 503 `{"error":"too many event streams"}` until one closes; host admins and Studio's admin token are always admitted, within their own limit of 4.
