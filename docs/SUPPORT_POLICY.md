# AMC Support Policy

This document defines AMC's support expectations, version policy, and what "stable" means for adopters.

## Support Philosophy

AMC is an OSS trust/security tool. That means users need:
- predictable upgrades
- clear deprecation signals
- a reasonable support window
- confidence that current docs match supported versions

## Release Channels

### Stable
- Intended for most users
- Published through independently verified GitHub Release assets
- npm and Homebrew are not stable channels until the publication manifest marks them live
- Receives bug fixes and documentation updates

### Main / Development
- Latest work on `main`
- May include unfinished features or documentation drift
- Best for contributors and early adopters

## Versioning

AMC uses semantic versioning:
- **MAJOR**: breaking changes to CLI, APIs, config, or data expectations
- **MINOR**: new backward-compatible features
- **PATCH**: fixes, docs corrections, packaging fixes, and low-risk improvements

## Supported Versions

AMC aims to support:
- the latest stable release line
- the previous minor release line for critical fixes when practical

Example:
- if current stable is `1.8.x`, then `1.8.x` is fully supported
- `1.7.x` may receive critical fixes for a limited window
- anything older is best-effort only

## Node Runtime Support

AMC currently targets:
- Node 20 LTS
- Node 22 LTS

Support for non-LTS Node versions is best-effort only.

## Deprecation Policy

When AMC plans to remove or rename a user-facing surface, the project should:
1. document the change in the changelog
2. provide a migration path when possible
3. keep deprecated behavior for at least one minor release where practical
4. update docs/examples before or alongside the breaking change

## CLI Stability Expectations

Stable CLI surfaces should avoid casual breaking changes in:
- top-level command names
- config file semantics
- evidence formats users are expected to depend on
- exported reports and CI integration patterns

## What is best-effort

The following are generally best-effort unless explicitly documented otherwise:
- experimental adapters
- early integration examples
- rapidly evolving research-oriented pack interfaces
- unreleased `main` branch behavior

## Security fixes

Security-sensitive issues should be handled under the process documented in `docs/SECURITY.md`.

## Documentation policy

User-facing docs should describe the current supported stable behavior wherever possible.
Historical docs and research handoff files may intentionally preserve older snapshots.

## Bottom line

For most teams, the safest path is:
1. use the latest stable release
2. stay on Node 20/22 LTS
3. read the changelog before upgrading
4. test upgrades in CI before production rollout
