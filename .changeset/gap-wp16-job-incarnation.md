---
"agent-maturity-compass": patch
---

Expose governed, session-owned background jobs and interactive terminal tools through the native composition and existing ToolPipeline. Jobs run through the admitted confined bash binding, retain bounded head and tail output, carry the starting session step, and distinguish stop requests from observed process-tree cleanup. Job handles include a registry incarnation so stale handles cannot target new work. Sessions reap owned resources before sealing or handing off; unresolved cleanup remains explicitly unknown. PTYs still require a separate host interactive grant, network denial and revocation checks, with no unconfined fallback. Shutdown closes driver admission, records SIGTERM cancellation and bounds cancellation metadata. Cancellation preserves explicit unknown-effect facts after dispatch.
