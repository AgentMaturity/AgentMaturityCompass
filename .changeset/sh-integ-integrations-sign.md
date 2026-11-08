---
"agent-maturity-compass": minor
---

`amc integrations sign` signs an edited `.amc/integrations.yaml`, so a notification channel's url, its enabled flag and the routing can change after `amc integrations init` (which writes only the template); `amc integrations setup --type slack|webhook` now prints those steps instead of writing a file nothing read, and `--type discord|pagerduty` is refused because AMC has no such channel. The signer runs in owner mode and strict-parses the bytes it signs, so an invalid config is never signed. The setup command's notification files were never read by any code: the unreachable notifier behind them (raw HTTP outside the governed delivery queue) is removed, and an unknown `--type` is now an error instead of an empty success.

freeze-exception: SH-INTEG — amc integrations sign (re-sign an edited integrations.yaml; the governed notification config could otherwise never change after init)
