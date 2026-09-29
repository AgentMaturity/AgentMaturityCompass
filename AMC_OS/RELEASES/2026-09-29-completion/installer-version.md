# Hosted installer version boundary — 2026-09-29

Role: REV_QA_LEAD. Parent identified the live hosted shell installer selecting nonexistent `v1.2.0/SHA256SUMS` while the verified published release was 1.1.1. Source package version 1.2.0 is a development candidate, not publication evidence.

## Correction

- Both shell installer copies and the hosted PowerShell installer now select **1.1.1**, matching the explicit `channels.githubRelease.version` in `website/install-channel.json` and the observed release in `website/publication-status.json`. Source `packageVersion` remains **1.2.0**. The channel also records the older available npm version without claiming current-source parity.
- A shared `verifyPublishedInstallerVersion` helper rejects absent published-version metadata, disagreement with publication status, installer pins that differ from the published version, or drift between the raw and hosted shell copies. Pages invokes this guard before changing its output directory. Its workflow watches the helper and raw installer.
- Release verification still requires the source package, built CLI, source channel version and release tag to agree. Hosted installer validation is separate, so normal source development cannot force an unpublished asset URL into Pages. Candidate packaging and release-tag checks remain intact.
- Missing checksum manifests and platform archives now produce an explicit failure before any installer executes. Existing checksum and archive-path verification remain mandatory. Only the pre-existing explicit test mode permits local fixture URL/version overrides.
- The repository-local Homebrew formula now references the actual 1.1.1 package asset. Its SHA-256 is `dfc370a884803159a7d8b8a42830c3f8303747a8f2caaa0c5f00513d74f9fbf6`, verified against the [official 1.1.1 SHA256SUMS](https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v1.1.1/SHA256SUMS). The previous formula incorrectly paired this older digest with a nonexistent 1.2.0 URL. No Homebrew tap was published or claimed live.

## Evidence and limits

- Node 22 focused validation: **30 tests passed in 5 files** (0.924 seconds): `publishedInstallerVersion`, `installerParity`, `publicDistributionTruth`, `publicBrandSystem`, and `pagesWorkflowRuntime`. New regression cases permit source-version advancement, retain source tag rejection, reject unobserved/incorrect hosted pins, require explicit metadata, preserve installer parity, and refuse missing fixture manifests/archives without executing a marker installer.
- Both shell scripts pass `sh -n`. Independent review confirmed the metadata/version boundaries and the official package checksum.
- Node 22 test typecheck (`tsc -p tsconfig.tests.json --noEmit`) passed after explicitly typing the fixture subprocess environment.
- Parent's validation agent owns the isolated production-mode install of the already-published 1.1.1 archive. That result is separate evidence, not qualification of new 1.2.0 native features. No release, tap, registry package or deployment was published by this agent.
- Parent owns the final combined candidate gates, generated counts, commit and Pages deployment. Local source correction does not establish that the live hosted script has changed until the new Pages artifact is deployed and fetched.
