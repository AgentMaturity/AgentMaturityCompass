---
"agent-maturity-compass": patch
---

Route Claude Code and Gemini hook approval requests through AMC's signed approval engine. Pending calls return a denial with the approval request ID; retrying the same provider call requires an exact, current grant that is consumed before allowing execution. Refused, expired, replayed, unavailable or changed approvals fail closed. Preserve multi-user quorum rules and keep pending attempts separate from the final action lifecycle. Bridge uses the existing asynchronous signing publishers.
