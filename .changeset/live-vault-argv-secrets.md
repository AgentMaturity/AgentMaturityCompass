---
"agent-maturity-compass": patch
---

Secrets no longer have to be passed on the command line, where every process on the machine can read them with `ps`. `amc watch connect` and `amc monitor live` take `--api-key-file <path>` or the `AMC_WATCH_API_KEY` environment variable, and `amc lease revoke` takes `--token-file <path>`. The inline `--api-key` and `--token` still work and now print one warning on stderr naming the alternatives.
