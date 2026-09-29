# Dependency security repair — 2026-09-29

Ten open Dependabot alerts mapped to four lockfile updates. All alerts were npm runtime dependencies; the standalone QA lockfile is outside the pnpm workspace. No actionable Python or development-only alerts were returned.

Root ip-address is patched from 10.5.0 to 10.5.1. QA ip-address is patched from 10.2.0 to 10.5.1, qs from 6.15.2 to 6.16.0, and body-parser from 2.2.2 to 2.3.0. Required QA transitive changes and exact checksums are recorded in receipt.json and lockfiles.diff. Package manifests are unchanged.

Root production and complete QA lockfile audits both report zero vulnerabilities at the low severity threshold. Fresh isolated QA installation passes all four existing runner tests on Node22.22.0. Fourteen bounded assertions confirm advisory-specific fixes and preserve the current JSON limit/IP subnet-key behavior. Root frozen-lock validation passes; root installed dependency refresh belongs to final integration validation.

The inspected callsites do not establish an active exploit path: QA uses a fixed valid JSON body limit and default simple query parser; express-rate-limit uses IP subnet keys, not the affected trust classifiers. Vulnerable dependency versions are nevertheless replaced. These observations do not certify uninspected integrations.

Primary advisory sources: [IPv6 link-local](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-rpw4-54j3-4h4q), [NAT64 local-use](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-2vr4-cq9g-pvrc), [qs constructor](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g), [qs array limit](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [body-parser invalid limit](https://github.com/expressjs/body-parser/security/advisories/GHSA-v422-hmwv-36x6). Alert IDs and additional advisories appear in receipt.json. Retrieved 2026-09-29.
