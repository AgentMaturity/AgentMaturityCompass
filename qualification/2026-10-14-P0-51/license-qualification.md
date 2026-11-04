# P0-51 portable licence key discovery — bounded evidence

The unchanged 21-case pure test moved from 17 passing / 4 failing to 21 passing / 0 failing, with zero pending or todo cases. The real Ed25519 licence and operator-signed trust list exercise integrity and admission separately; unknown, distrusted, revoked, wrong-purpose, tampered, legacy and HMAC controls remain intact.

The exact retained CLI fixture and command arguments moved from a successful explicit-PEM control plus failing list-only verification to two successful commands. The rebuilt list-only report has integrity `pass`, issuer source `trust-list`, admission `admitted`, `trusted: true`, and no overrides. Licence, list, public-key, offline-guard and argv hashes are identical between phases. The actual CLI red/green wrappers took 1.872s / 1.866s.

The original CLI RED used unchanged baseline dist while the TypeScript repair was already dirty. GREEN used the parent-rebuilt dirty candidate at HEAD `3b08f2285a9b276e3aa0fce8f36ed2f6198adb46`. Only the licence module changes within the captured compiled input set. This is not a final committed source or whole-task qualification.

The companion JSON pins every report, command, stream, fixture and source hash without storing raw private keys. Original RED evidence and fixtures remain preserved. Three separate explicit-pin compromise-revocation CLI failures remain open. Full suite, coverage, Node24, hosted, browser, release, live activation and prior held failures remain outside this bounded proof.
