---
"agent-maturity-compass": patch
---

The shared secret redaction pass (`redactSecrets`, used by fetched web pages, the file tools, SDK evidence, the bridge and secret blinding) now also redacts the value of a secret-named XML element or HTML input, any Basic token in an `Authorization` or `Proxy-Authorization` header, and a secret written with look-alike, fullwidth or invisible characters in its name, while ordinary markup, prose such as "Basic Settings" and non-ASCII text are left as they are.
