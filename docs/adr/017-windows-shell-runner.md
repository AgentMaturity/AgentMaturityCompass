# ADR 017: Windows shell runner remains disabled pending primary and host proof

Status: **proposed; Sid review pending**. Item: P2-14, cut-first prototype only. Decision scope: no-go for native Windows enablement on the present evidence; proceed only with an unregistered synthetic protocol prototype. This is a provisional evidence decision, not a finding of technical impossibility.

## Context

AMC's current native gate refuses Windows, including unsafe opt-ins. Its private signed-policy binding and confinement implementation are Linux/macOS-specific. A backend prerequisite check is not proof that a boundary was applied. The existing outcome contract requires truthful command-exit and tree-cleanup evidence before a successful confined tool result can be returned. Relevant inspected sources are `src/sandbox/nativeShellGate.ts:40–57`, `src/sandbox/nativeSandboxBinding.ts:31–32,79–110`, `src/sandbox/sandboxTypes.ts:67–113` and `src/tools/builtin/bashTool.ts:68–80`.

The P2-14 specification calls for Microsoft-backed research and Sid review before choosing a mechanism, then a real launcher, backend and Windows escape suite only on go. The handover narrows the current lane to a cut-first prototype with typed non-Windows refusal, fake-API tests on macOS and explicit unmeasured live parts. No outbound research is authorized here. No Microsoft primary text or Windows-host result was obtained. Restricted tokens, job objects and AppContainer therefore remain unanswered candidates in the accompanying research note.

The spec requested ADR-011, but `docs/adr/011-control-catalog-format.md` already exists. Use the next free ADR number017; preserve the catalog ADR and explain the number drift rather than reusing or replacing it. ADR-008 remains the inherited containment decision; this ADR neither approves its proposed Linux relay nor changes existing platform behavior.

## Decision

Keep native Windows refused. Do not add a Windows backend kind, relax the gate, route the native bash tool to a Windows shell, alter process-tree semantics or claim a Windows confinement receipt. The proposed standalone prototype and its tests are the complete executable scope of this slice; no native launcher or Windows escape workflow is included.

The prototype has two separate entries. `runWindowsTokenPrototype` reads the real host and accepts no fake API or platform override; every real launch remains refused. `exerciseWindowsTokenProtocol` accepts bounded inputs and an injected fake token/launcher API for synthetic protocol observations. The real `runWindowsTokenPrototype` entry must return its typed non-Windows refusal without a token/launcher API call or process launch. The separate `exerciseWindowsTokenProtocol` entry is intentionally host-independent so its injected fake API can be exercised on macOS; such fake calls do not run or qualify a Windows child. Simulated Windows execution is a test context, not a real host assertion. It must fail closed on missing prerequisites, API or fake cleanup failure, or missing, malformed or incorrectly bound status. Native cancellation and timed whole-tree cleanup remain unmeasured requirements for a later implementation. Ordinary unconfined execution is never a recovery path.

A valid fake path still has `confined:false`, no enforcement field, `treeExitProven:false` and a null real exit. Keep fake observations separate from production outcomes and record the live limit as **not measured: no Windows host**. Caller-supplied availability, a successful fake API call, status-shaped stdout or a synthetic zero exit cannot establish a real boundary.

## Verification and limits

Add meaningful tests for the typed non-Windows refusal/no-call invariant and synthetic protocol failure cases, including request snapshot preservation and status binding to the fresh invocation nonce, child identity and policy digest. This is not proof of real command, workspace or policy application. Mutate the status requirement: accepting a missing status must kill an intended assertion. Assert the non-enforcement fields even for a well-formed fake status. Record actual source, runtime, command, totals and restoration only after execution; this draft makes no test or mutation pass claim.

Local macOS unit evidence cannot qualify Windows filesystem, credential-store, network, token, capability, process-count or descendant behavior. It also cannot prove standard-user usability or enterprise compatibility. Existing Linux/macOS escape evidence and platform matrix jobs cannot be relabelled as Windows boundary proof.

## Reconsideration and human review

Sid reviews this ADR and the cut-first/capacity decision; no review comment or approval is invented. A later go requires read, captured Microsoft sources for every chosen property and residual limit, plus a real Windows qualification host. The native launcher must demonstrate trusted status origin, exact policy application, command outcome and whole-tree cleanup under the actual escape suite. Unknown or incomplete evidence keeps the shell refused.

Only a reviewed follow-up may expand production authority, signed policy/schema, native gate, backend selection, shell argument contract, launcher build and CI scope. Signing/distribution and platform qualification remain P2-15/P2-06. Effort for this limited prototype is a small bounded implementation/review slice; the spec's three-to-six-person-week complete-runner estimate is not a measured delivery commitment. Stop at the prototype if research, host access, capacity or mechanism proof is unavailable.
