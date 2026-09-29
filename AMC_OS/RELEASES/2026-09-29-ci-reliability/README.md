# CI reliability and installed composition inspection — 2026-09-29

`receipt.json` records the observations and verification. This work affects Deployment and CLI.

## Findings and fixes

- [CI 35043962992](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/35043962992): clean-source cloning, install, build and native checks passed. Its setup-node cache post-step failed because the isolated checker never populates the outer pnpm store. Disable caching for this job only.
- The Node 22/24 jobs and [npm Publish 35043962995](https://github.com/AgentMaturity/AgentMaturityCompass/actions/runs/35043962995) hit GitHub's six-hour maximum. GitHub retains no steps/logs for those jobs; the precise stall point is unknown. Add bounded test/coverage steps, JSON and hanging-process reporters, and logs uploaded even on failure. Keep every assertion and coverage threshold.
- Installed `amc composition` used the unpublished private workspace package directly. Route its three inspection functions through the existing bundled runtime seam. The packed-install check now inspects a disabled unavailable plugin and verifies the source hash, unsigned status and entries without loading that plugin. Restrict direct workspace imports to the bundle seam.

## Verification

48 tests passed across 5 focused files. Workflow YAML parsed; the synthetic negative test retained logs/JSON and returned status 1 through the same Bash/tee reporter pipeline. Script syntax and `git diff --check` passed.

Parent owns the final shared build, installed-package acceptance and hosted CI execution. A fresh hosted run is still needed before claiming the old six-hour failure resolved.
