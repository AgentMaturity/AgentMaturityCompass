# P0-50 installed stdio recovery — 14 October 2026

INSTALLED_STDIO_RECOVERY_PASSED for pinned source `07125b76cb17ecf063f19b914085a5bfc968df35` and artifact `c3932ba3b2d693c018c874191c608fbb06709e9e83c77c95f7b9a4ff4d8d82aa`, on Node `v22.23.3`.

Actual exit: `0`; duration: `57.36` seconds. Receipt: `/private/tmp/p0-50-stdio-recovery-20261014T151342Z/receipt.json`; outer log: `/private/tmp/p0-50-installed-stdio-recovery-run-20261014T151342Z.log`.

Installed SDK: `{"version": "1.32.1", "packagePath": "/private/tmp/p0-50-stdio-recovery-20261014T151342Z/consumer/node_modules/@modelcontextprotocol/sdk/package.json", "packageSha256": "0216319ea53177f7ed419d660b2f52ccc7e3327e57f9ee2ef03225ff543aeae4"}`.

- `real-approved-effect-before-ack-and-authenticated-writer-kill`: True.
- `resume-preserves-original-prefix-uncertain-outcome-and-reservation`: True.
- `new-explicit-turn-without-side-effect-replay-and-cold-verification`: True.

The existing runner and all recovery/refusal/cold-inspection assertions were executed unchanged. Every command output and failed phase is retained in the new owned output directory. Source hashes unchanged: `True`; final source Git status: `''`.

Existing public installed AMC SDK/CLI, explicit deterministic current stub provider and operator-trusted local stdio MCP fixture on Node22POSIX. No live provider/credential, HTTP recovery, hosted CI, publication, full-suite or OS sandbox qualification.

The local stdio JSON-RPC helper echoes the requested initialize protocol version and withholds tool ACK only after its real effect is fsynced. The unchanged runner does not separately capture the negotiated-version packet. Provider scope is the current installed deterministic stub; the local monitor pin is not independent trust anchoring.
