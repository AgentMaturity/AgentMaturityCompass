# P2-17: packages for Sid to publish (never published by an agent)

## Pi

No separate package. AMC's Pi extension ships inside `agent-maturity-compass` as the `agent-maturity-compass/pi`
export (P1-22), so it is published with AMC's normal release.

## dsh-amc-plugin

**Do not publish yet.** The plugin is not qualified, has no AMC transport (the Bridge has no `dsh` provider), and
denies every call until both exist. Publish only after Sid accepts the DSH pre-release pin and an installed
conformance run against `@deepseek-ai/dsh@0.2.1-rc.2` is recorded.

`npm pack --dry-run --json` in `packages/dsh-amc-plugin` at the DSH transport commit (`161dd74b6`, README updated since), on Node v22, 2026-10-28:

| Field | Value |
| --- | --- |
| Tarball | `dsh-amc-plugin-0.1.0.tgz`, 3,832 bytes packed, 10,204 unpacked, 4 entries |
| Files | `README.md` (1,843), `index.d.mts` (1,999), `index.mjs` (5,719), `package.json` (643) |
| shasum | `a955340a18a53b9dd03e64f5a35955ffb1272bc4` |
| integrity | `sha512-fzl0QCo+Tehswajkc2GDO6TjNpfRfQgYM88i1Jq2fDefnBhc3+58xAa1R+nZU6AR7A8HMlhfFrkb719r6T5jWA==` |

The name `dsh-amc-plugin` was unclaimed on the public registry on 2026-10-28 (HTTP 404). Choosing the final name and
scope (for example `@agentmaturity/dsh-amc-plugin`) is Sid's call.

When the conditions above are met, Sid runs:

```sh
cd packages/dsh-amc-plugin
# 1. Remove "private": true from package.json and set the final name and version.
npm pack --dry-run          # check the files and the version
npm publish --access public # needs Sid's npm credentials and 2FA
```

Then add the published version and integrity to the DSH manifest's qualification record. Never publish it with
`qualifiedVersions` non-empty in any example until the DSH manifest lists that version.
