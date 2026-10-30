---
"agent-maturity-compass": patch
---

Add bounded native driver and in-process session shutdown results that name observed settled, cancelled and unknown tool outcomes, cancelled queue entries, incomplete cleanup and timeouts. Stop new admission before cancellation and retain unknown side effects without claiming rollback or verification.

Add the sdk-api `previewNativePrompt` helper for immutable, explicitly labelled ACP request previews without process creation, dispatch, evidence writes or provider spend. Preview performs local shape and size checks; runtime capability, ownership, threat and budget admission remain unevaluated until submission.
