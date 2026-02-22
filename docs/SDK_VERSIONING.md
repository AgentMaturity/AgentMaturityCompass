# SDK Versioning And Deprecation Policy

AMC SDKs and Bridge integration surfaces follow SemVer for breaking/non-breaking changes.

## Scope

- Package version source: `package.json` (`agent-maturity-compass`).
- Bridge contract version: `v1` (`/bridge/*`).
- Internal control-plane routes (`/api/v1/*`) are not part of the public SDK contract.

## Compatibility Rules

1. Patch versions: bug fixes only, no contract changes.
2. Minor versions: additive changes only (new fields/endpoints/methods).
3. Major versions: breaking contract changes.

## Deprecation Rules

1. Minimum notice window: 90 days before sunset.
2. Deprecated routes must return:
   - `Deprecation: true`
   - `Sunset: <RFC 1123 date>`
   - `Link: <docs/SDK_VERSIONING.md>; rel="deprecation"`
3. Redirect targets must be provided in response body and `Location` header.

## Current Deprecated Legacy Routes

- `/api/v1/chat/completions` -> `/bridge/openai/v1/chat/completions`
- `/api/v1/completions` -> `/bridge/openai/v1/completions`
- `/api/v1/embeddings` -> `/bridge/openai/v1/embeddings`

Current announced date: 2026-02-22.
Current sunset date: 2026-06-01.
