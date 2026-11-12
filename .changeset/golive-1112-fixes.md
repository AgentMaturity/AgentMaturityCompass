---
"agent-maturity-compass": patch
---

Go-live fixes found by running the product end to end.

Security: an approval decides an EXECUTE intent only when the reviewer was authenticated (`decideApprovalForIntent` now requires `reviewerAuthentication` and refuses anything else), and `listApprovalDecisions` returns only denials and authenticated approvals by default. The console's Validate Artifact (`/standard/validate`) reads only inside the workspace: absolute paths, `..`, symlink escapes, `.amc` and `.git` are refused and errors no longer echo file content.

Behaviour changes callers can see: `amc init` writes the `isolated` trust boundary; `amc verify --repair` exits with the same verdict as `amc verify`; `amc doctor` and `fix-signatures` exit 1 on an unsigned config and name `amc verify --sign-config`; a claim made across a violated trust boundary carries the reason code `TRUST_BOUNDARY_VIOLATED`; a run in SIMULATE says so and lists `simulatedToolCalls` in its summary; `AMC_VAULT_PASSPHRASE_FILE` is honoured everywhere a passphrase is read; a model call to a tool that was not offered is answered with a DENIED tool result and the turn continues. New request encoders `openai-chat@6`, `openai-chat@7` and `deepseek-chat@2` join text parts with a blank line; the earlier versions are byte-stable, so recorded requests replay unchanged.

Console: `/console` redirects to `/console/` so the pages load their styles; each Industry Pack has a questionnaire scored in the browser through the new read-only route `POST /industry-packs/:id/score` (the same scorer as the CLI and MCP tool, self-reported answers capped at L1); write controls are disabled by role; sign-in returns to the page first requested; the Native Tasks poller retries a transient 409. A4 (preview): "Yes, that's it" stays enabled after Understand, stale answers are confirmed in place at every stage, an A4 request approved from the Approvals inbox is bound to the project's digest and counts, and readiness waits on Assemble's effect gate.

Website and docs: the changelog page takes its labels from `website/publication-status.json`, the Python SDK guide installs from `sdk/python` and its snippets run against `amc_sdk`, the adapters page lists all 16 adapters, published counts come from `gen-counts`, and an internal analysis page is no longer part of the published site.
