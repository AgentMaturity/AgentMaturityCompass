---
"agent-maturity-compass": patch
---

Studio's shutdown is now signal-safe and bounded (LIVE-RUNTIME-02). `amc studio start`, the `amc up` daemon and `amc gateway start` share one signal handler: the first SIGINT or SIGTERM stops Studio once, a second signal while it stops is absorbed with one log line (a double Ctrl+C no longer kills the process mid-shutdown and leaves the gateway session unsealed), the process exits 0 when the stop finishes, and exits 1 if the stop has not finished 9 seconds after the first signal. Stop closes the API, gateway, dashboard and metrics servers at the same time, so the API's drain no longer delays the gateway's seal past a 10 second container grace period. A crash (an uncaught exception or unhandled rejection) still writes its diagnostic, then runs the same bounded stop once before exiting 1.
