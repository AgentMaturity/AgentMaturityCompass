# P1-19 oracle v2 security delta review

The closed v2 delta has no additional blocking static finding. It addresses both findings from the immutable original security review within the explicitly supported external default FINANCIAL profile. This is not an executed qualification result.

Q1 is addressed by two independent requirements: the actual auditor-signed approval-policy bytes and authorization record digest must match the external reviewed default-policy hash, and every signed request must exactly match the fixed two-approval, distinct-user, unique OWNER/AUDITOR role set and ten-minute profile. The verifier continues to recount genuine signed decisions and check request binding, consume execution identity and timing; it does not rely on CONSUMED as proof of quorum. The external default bytes must be captured before any deliberately weaker policy overwrite.

Q2 is addressed by requiring bodyFields to contain only unique strings and exactly equal the normalized body's complete key set, including cardinality. Existing allowed-shape, body completeness, byte-count and digest checks remain. Raw JSON keys lost during provider parsing remain outside the declared retained evidence.

The new finite expected-field admission accepts exactly decision, terminalReceiptState, posts and commits, rejects extra dimensions, and requires a supported matching decision/state. Invalid expected fields fail before cold-verifier launch. Every missing mandatory check remains false. The exact closed patch was compared with the complete original-to-v2 text diff, and all supplied source hashes match.

One known compatibility boundary remains explicit: current approval request creation calls Date.now twice. A tick between those calls can produce a lifetime other than exactly 600000 ms; the strict v2 check then refuses it. Such a result must be retained as a failure, without silently granting timing grace. This review did not execute or measure that boundary.

The original review's operator-anchor, snapshot, path, selected-scope, cold CLI/action-chain and same-UID limitations remain. No active test drafts were read. No product runtime, imports, parser, database, network, R writes or proposal edits occurred. Root remains the sole runner and admission owner.
