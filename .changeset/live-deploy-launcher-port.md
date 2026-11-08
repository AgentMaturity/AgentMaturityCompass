---
"agent-maturity-compass": patch
---

The desktop Studio launchers open the console on the port Studio actually bound. The macOS app (native and fallback) and the Windows launcher read `apiPort` from the workspace's `.amc/studio/state.json` after `amc up` and open `http://127.0.0.1:<port>/w/demo/console/`, instead of always assuming port 3212; they fall back to 3212 only when the state cannot be read. The native macOS app accepts only a loopback console URL.
