# P2-17: packages for Sid to publish (never published by an agent)

## Pi

No separate package. AMC's Pi extension ships inside `agent-maturity-compass` as the `agent-maturity-compass/pi`
export (P1-22), so it is published with AMC's normal release.

## dsh-amc-plugin

**Do not publish yet.** The plugin is not qualified, has no AMC transport (the Bridge has no `dsh` provider), and
denies every call until both exist. Publish only after Sid accepts the DSH pre-release pin and an installed
conformance run against `@deepseek-ai/dsh@0.2.1-rc.2` is recorded.

`npm pack --dry-run --json` in `packages/dsh-amc-plugin` at the part C commit (`5085ae0b4`, with the
`index.d.mts` rename), on Node v22, 2026-10-28:

| Field | Value |
| --- | --- |
| Tarball | `dsh-amc-plugin-0.1.0.tgz`, 3,230 bytes packed, 7,872 unpacked, 4 entries |
| Files | `README.md` (1,552), `index.d.mts` (1,537), `index.mjs` (4,140), `package.json` (643) |
| shasum | `b161cde60910a7a55d58c8144daf87373e3b7d56` |
| integrity | `sha512-3Du2G766906qDkp9DyhmZvZTdqpafpmvPPkvUxD67folhgdsO5Y87MQPC7xKyfYJFSnwq7HWV+adCjDjIG8NKg==` |

The name `dsh-amc-plugin` was unclaimed on the public registry on 2026-10-28 (HTTP 404). Choosing the final name and
scope (for example `@agentmaturity/dsh-amc-plugin`) is Sid's call.

When the conditions above are met, Sid runs:

```sh
cd packages/dsh-amc-plugin
# 1. Remove "private": true from package.json and set the final name and version.
npm pack --dry-run          # check the four files and the version
npm publish --access public # needs Sid's npm credentials and 2FA
```

Then add the published version and integrity to the DSH manifest's qualification record. Never publish it with
`qualifiedVersions` non-empty in any example until the DSH manifest lists that version.
