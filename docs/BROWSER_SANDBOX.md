# Browser sandbox / try-now

AMC already ships a browser-based entry point at `website/playground.html`.

This doc turns that into an explicit product surface instead of a hidden side path.

## What the browser experience is
A **static, no-install try-now flow** that runs entirely in the browser and lets someone:
- answer assessment questions
- inspect score breakdowns
- explore adversarial scenarios
- browse assurance packs
- export/share the result

## What it is not
It is **not** the full AMC runtime in WebAssembly or a browser-hosted Node sandbox.
That would be a separate product effort with real engineering cost.

So the honest MVP is:
- first-class website entry point
- clearer copy on what works in browser vs CLI
- docs that route users from playground → CLI/CI when they want deeper execution evidence

## Recommended adoption flow
1. **Try now in browser** for a zero-friction first touch
2. **Install CLI** for execution-verified scoring and evidence capture
3. **Move to CI** for ongoing checks

## Canonical URL
- `https://agentmaturity.co/playground.html`

## Positioning copy
Use language like:
- “Try AMC in your browser — no install required”
- “Great for first-touch scoring and scenario exploration”
- “Use the CLI for execution evidence, traces, datasets, and CI gates”

## Why this approach
Because the repo already has a working static playground and GitHub Pages deployment. Shipping a clean, honest try-now path beats pretending a full browser runtime exists when it doesn’t.

Files created/updated: website homepage/docs nav copy, README/docs links, this doc
Acceptance checks: homepage/docs visibly surface the playground and explain its scope honestly
Next actions:
- add deeper walkthrough video/GIF for the playground
- optionally add saved presets / shareable scenarios
- consider WebContainer-style runtime only if there is strong usage demand
Risks/unknowns:
- browser playground is assessment-first, not runtime-parity with CLI
- counts/features shown in playground copy should stay aligned with real product scope
