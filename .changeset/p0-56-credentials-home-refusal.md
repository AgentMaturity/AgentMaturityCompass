---
"agent-maturity-compass": patch
---

`amc agent-loop run` (and every caller of the composed native runtime, such as the SDK) now reports why it refused to start when the credentials home or file grants group or other access. It used to print only `composition did not provide amcCredentials; the fiber booted but registered no service`; it now prints the `CredentialsFilePermissionsError` message, which names the path, its mode and the fix (`chmod 700 <dir>` for the directory, `chmod 600 <file>` for the file). The run is still refused and exits 1, and the message names no credential values.
