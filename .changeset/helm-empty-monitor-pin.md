---
"agent-maturity-compass": patch
---

The Helm chart no longer sets `AMC_EXPECTED_MONITOR_FINGERPRINT` to an empty string when no pin is configured (the default): the ConfigMap renders the variable only when `env.AMC_EXPECTED_MONITOR_FINGERPRINT` is set. The chart runs Studio without the image entrypoint that unsets an empty value, so Studio's native-task history refused with `INVALID_INPUT`. The native-task history and retained-output readers now also treat an empty `AMC_EXPECTED_MONITOR_FINGERPRINT` in the environment as no pin; an empty pin passed explicitly is still refused, and `amc spill` and `amc session anchor` still refuse an empty value.
