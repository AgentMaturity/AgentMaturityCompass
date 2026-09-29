# Installed candidate acceptance — 2026-09-29

The installed browser and crash-recovery lanes passed against source commit
`421859b0c9c3b961731f847870b35b9dfecca96d` and the same locally packed
`agent-maturity-compass-1.2.0.tgz`:

- Archive SHA-256: `ac77c45bd07e186dc42fcb4d9a5e27044e388b5faeec47b9b6a55c691a7580d2`.
- Installed CLI SHA-256: `8e3b67d600a3559b940888f8e58634e1358cd022cb28c7cdd502f12d4405946c`.
- All 3,985 packaged regular files matched the clean built clone; `package.json` was compared semantically.
- Browser: 13/13 scenarios, owner-cookie authentication, approval denial, cancellation, release/resume, lost-ACK handling, archive inspection, and eight successful cold verifiers across seven sessions and the ledger.
- Crash recovery: one actual approved MCP effect was observed before killing the authenticated writer while the tool withheld its acknowledgement. Resume preserved the original history prefix, reported one unknown tool outcome, retained the pending reservation, and made no automatic model call. A new explicit turn completed without replay: one effect and one tool call overall. Cold native and ledger verification passed.
- Isolated `npm link` passed; the exact temporary-prefix executable returned version `1.2.0` and the expected unconfigured `choose-provider` / `PROVIDER_REQUIRED` guide result.

The complete clean-source lane ran at
`3f4780f65688be3ac039444701ae315d6bdcc30d`. The independent clone then fetched
and checked out `421859b0c9c3b961731f847870b35b9dfecca96d`; the only changed
path was the crash acceptance runner's ESM-resolution fix. Its tracked tree
was clean, its Git metadata was independent, and it was rebuilt before
packing. The later installed lanes all used that rebuilt candidate. The
eventual evidence-commit hash is therefore different from the tested source
hash. These receipts do not imply a published 1.2.0 release or an additional
full clean-source run at the later hash.

## Receipt map

`RUN_ROOT` below is the original private local directory:
`/private/tmp/amc-candidate-acceptance-20260929-k6a8f925`.
Absolute paths in receipts describe the actual execution; they are historical
references, not files shipped in this repository.

| Committed file | Original input under `RUN_ROOT` | Preservation |
| --- | --- | --- |
| [acceptance-summary.json](acceptance-summary.json) | `acceptance-summary.json` | Exact bytes |
| [artifact-provenance.json](artifact-provenance.json) | `artifact-provenance.json` | Exact bytes |
| [candidate-transition.json](candidate-transition.json) | `candidate-transition.json` | Exact bytes |
| [browser-receipt.json](browser-receipt.json) | `browser-installed/fixture-run-receipt.json`, `browser-installed/browser/receipt.json` | Selected fields; original hashes included; cold verifier output strings parsed as JSON |
| [crash-receipt.json](crash-receipt.json) | `crash-installed/receipt.json` | Exact bytes |
| [command-receipts.json](command-receipts.json) | `commands/01-clean-source.receipt.json` through `commands/08-linked-guide.receipt.json` | Exact receipt objects with source commits, original hashes, stdout hashes, and the clean-source stdout |
| [npm-link-receipt.json](npm-link-receipt.json) | Isolated link environment, command results, version and guide stdout | Relevant fields and original stdout hashes |
| [screenshot-review.json](screenshot-review.json) | `screenshot-review.json` | Exact bytes; four screenshot hashes and visual review |
| [receipt-file-hashes.json](receipt-file-hashes.json) | Curated files above | SHA-256 index |

The retained clone was `RUN_ROOT/tmp/amc-clean-source-jQvkqk/checkout`, the
archive was `RUN_ROOT/artifact/agent-maturity-compass-1.2.0.tgz`, and npm link
used `RUN_ROOT/link-isolated/{home,cache,prefix,workspace}`. The browser output
was `RUN_ROOT/browser-installed`; the crash output was
`RUN_ROOT/crash-installed`. Raw logs, private credentials and keys, workspaces,
the archive, screenshots, and the 3,985-file manifest were not copied here.
The original full browser receipts remain referenced by their SHA-256 values.
Token-file paths in the crash receipt identify disposable fixture files and
contain no token values.

## Reproduction and limits

[command-receipts.json](command-receipts.json) preserves the exact executed
arguments and exit results for all eight stages. On another device, use Node
22 and pnpm 10.33.0, clone the pinned commit independently, perform a frozen
install and build, and pack with `npm pack --ignore-scripts`. Resolve the local
Node, npm, Playwright browser and output paths and calculate their hashes
before invoking the committed `scripts/installed-studio-browser-check.py`
and `scripts/installed-crash-recovery-check.mjs` with the recorded flags. The
browser wrapper's `--shared-checkout` must explicitly identify the checkout
whose unchanged state it protects. Each output directory must be newly owned
by the run. The link receipt records every temporary HOME, npm configuration,
cache, prefix and workspace control used to avoid the user's global setup.

This run used macOS arm64, Node 22.22.0, npm 10.9.4, Playwright 1.62.1 and
Chromium revision 1234. Provider turns used the deterministic stub and the
crash lane used an operator-trusted local MCP tool. These establish installed
integration and signed-evidence behavior; they do not establish live-model
quality, OS confinement or execution on other operating systems. Monitor pins
establish local workspace-key consistency. Live browser verification reported
the actual refusal while Studio was running; all eight required cold
verifiers passed after shutdown. All observed owned process groups closed.
