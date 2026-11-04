# Windows contained-shell research: cut-first prototype

Status: proposed, experimental and unreviewed. Native Windows enablement is **no-go on the evidence currently available**. This is not a conclusion that a Windows boundary is technically impossible. Sid's ADR review and a real Windows qualification host remain pending. This document records local source inspection and a bounded prototype proposal; it contains no measured Windows containment result.

## Scope and current source evidence

The inspected clone is the P2-14 clone based on int `dc8c34d0403c7e4d7513ad546f202574e3e78af8`, as supplied by the coordinator. This note records static source inspection. Separate item receipts record cloning, builds and runtime tests; those actions do not establish a Windows boundary. Exact hashes of the inspected files are retained in the off-tree `local-source-evidence.json`.

Integration source review (2026-10-19): the current clone was supplied at int `c9e29ed52caa3ff2d0dd18b187a69176b2591ea9`. A separate static comparison found the native shell gate, signed-policy binding, outcome contract, bash tool, process-tree code, Bubblewrap backend, ADR-008, existing escape suite and compatibility workflow byte-identical to the earlier inspected snapshot. This does not reattribute the preserved prototype tests or receipts to the integration source, establish a Microsoft mechanism, or qualify Windows. New source-bound qualification results belong in the integration receipt. Live Windows containment remains **not measured: no Windows host**.

The current native gate admits Linux through Bubblewrap and macOS through Seatbelt. Its Windows branch refuses the shell even when an unsafe opt-in is supplied (`src/sandbox/nativeShellGate.ts:40–57`). `docs/SANDBOX.md:14–19` documents that refusal. The private signed-policy binding also admits only Linux/macOS (`src/sandbox/nativeSandboxBinding.ts:31–32`) and dispatches `/bin/sh` through their existing backend (`:101–102`). Adding a prototype file does not change either authority check.

`SandboxBackend.available()` describes prerequisites; it does not establish confinement. `SandboxOutcome` distinguishes a refusal, an untrustworthy exit, confinement and tree-exit evidence. Its enforcement union currently names Linux/macOS only (`src/sandbox/sandboxTypes.ts:67–113`). The Linux implementation accepts setup proof only through a separate launcher-status descriptor and requires its command-exit status to match the observed exit (`src/sandbox/bwrapBackend.ts:85–101,191–203`). These are local AMC contracts to preserve, not evidence that a Windows mechanism can implement them.

Some spec-era descriptions need qualification. The real escape-suite source now exists at `tests/containment/escapeSuite.test.ts`; ADR-008's last bullet still says it is unwritten. That suite selects macOS/Linux backends and supports `AMC_REQUIRE_REAL_SANDBOX=1`; its existence is not a Windows pass. No contained-shell Windows workflow was found. The compatibility workflow lists Windows and Node22/24 but runs platform qualification, not a Windows shell escape boundary (`.github/workflows/nightly-compatibility-matrix.yml:17–37`).

The comment in `src/exec/processTree.ts:27` mentions taskkill. Its current Windows branch instead uses the direct child for signalling and liveness (`:38–53,65–70`). This source/comment difference cannot establish whole-tree termination on Windows. No Windows process or descendant was started or inspected here.

## Primary research still required

The binding handover prohibits outbound research in this lane, so no Microsoft documentation was fetched or read. Scoped local searches of source, docs, tests and workflows, excluding generated qualification and archived source-review outputs, found no relevant Win32 mechanism documentation capture or Microsoft Win32 URL lead. Generic Microsoft product crosswalk links are not evidence about shell isolation. No invented URL is supplied as a citation.

The mechanism names below come from the task specification. They are candidate research topics, not verified capabilities:

| Candidate | Workspace writes / secret reads | Proxy-only network | Process cap / tree exit | Trusted launcher proof |
| --- | --- | --- | --- | --- |
| Restricted token | Not evaluated | Not evaluated | Not evaluated | Not evaluated |
| Job object | Not evaluated | Not evaluated | Not evaluated | Not evaluated |
| AppContainer | Not evaluated | Not evaluated | Not evaluated | Not evaluated |
| A combination | Not evaluated | Not evaluated | Not evaluated | Not evaluated |

Before a real go decision, obtain and read official Microsoft material for each proposed property and limitation. Capture the actual URL, retrieval time, document bytes/hash and relevant section; distinguish a readable authority from an unread lead. Resolve workspace/read-deny semantics, reparse and alias handling, loopback/proxy scope, inherited handles and environment, descendant containment, process limits, cancellation, launcher admission, standard-user prerequisites, enterprise restrictions and any required machine-wide changes. Choose neither `cmd.exe` nor PowerShell by assumption: shell parsing and argument transport remain design questions. Administrator rights or machine-wide security changes cannot silently become accepted prerequisites.

## Smallest useful prototype

The proposed code is a standalone `src/sandbox/windowsRunnerPrototype.ts` with `tests/containment/windowsRunnerPrototype.test.ts`. It is not registered with `SandboxRunner`, the native gate, tool composition or the signed-policy binding. It adds no backend kind, native binary, process-tree replacement or Windows escape CI job.

The real `runWindowsTokenPrototype` entry reads the actual host and accepts no API or platform override. It refuses every launch: non-Windows hosts receive a typed platform refusal, and Windows remains an unqualified prototype. The separate `exerciseWindowsTokenProtocol` entry uses an injected fake token/launcher API solely for synthetic protocol tests on macOS. Simulated Windows inputs must be labelled simulation, rather than changing the actual host claim. Test prerequisite refusal, API and cleanup failures, and missing/malformed/mismatched status; no failure may fall back to an ordinary shell. Native cancellation and bounded whole-tree cleanup remain unmeasured future requirements. Snapshot the synthetic request and bind its status to a fresh invocation nonce, child identity and policy digest. This checks protocol correspondence; it cannot prove which command or workspace a real launcher used or that any policy was applied.

Even a valid fake transcript must return `confined:false`, no enforcement object, `treeExitProven:false` and a null real exit. Synthetic observations may describe protocol sequencing, never OS isolation, real child success or receipt-backed enforcement. The live result remains exactly **not measured: no Windows host**. These tests measure AMC's refusal/protocol logic only.

## Evidence needed to revisit the decision

A future native implementation needs Sid-reviewed primary research, reviewed launcher/toolchain prerequisites and a Windows host. Run the actual P1-05-style escape cases with owned canaries, healthy direct-network negative controls, real deny/allow proxy observations, bounded descendants, cancellation and missing/malformed launcher proof. A fake acknowledgement, binary discovery or zero process exit cannot substitute for the boundary. Preserve every failed or skipped case and require the malformed-status bypass mutation to fail an intended assertion.

Only after that evidence and review can an ADR authorize any gate/backend change. P2-15 still owns signing/distribution; P2-06 owns the platform matrix. This cut-first slice does not close those dependencies or the whole P2-14 acceptance criteria.
