# Independent review of the initial oracle runtime

The closed guarded run exited normally with code 1 after 23,159 ms. PGID 3089 was recorded absent by ESRCH. Raw and observer reports agree on ten unique case identities: five passed and five failed. There were no skipped, pending, todo or nonterminal tests. The file afterAll hook passed; file/suite nodes own no separate error, and no unhandled or known late diagnostics were found in the closed streams.

Four failures are the positive verdict assertion at financeOracle.test.ts:24:44, called from 30:53, 52:7, 65:7 and 70:7. The last three are prerequisite positives for the log, preimage and decision-signature controls. Their intended mutations were never reached: each public marker has one oracle output and no controlled mutation. They cannot be credited as measured mutation refusals.

The fifth failure is the weaker-policy case's action-chain true assertion at 77:41. Its output records the exact external default-policy hash mismatch, but its snapshot gate also fails. That policy control therefore remains unqualified. The five passing test bodies are actual reported passes, while their use as negative qualification remains provisional because the genuine positive fails.

All nine oracle outputs that reached the cold ledger verifier report it true and report snapshot-stable false. The four completed prerequisite fixtures show no action-chain or authorization parsing errors, one verified preimage and one matched commit, but differ between their before/after snapshot hashes. This peer review did not identify which physical DB, WAL or key input differed; the parent owns retained-filesystem diagnosis. The unsupported-expectation output contains the explicit input refusal and required false placeholders instead of a reached cold-verifier result.

Ten oracle markers each contain one complete sixteen-check fail verdict. Recorded closure is natural exit 0 and closed streams for all thirty initializer/producer/oracle children and ten provider children, with PID ESRCH. Nine internal cold verifier records also report natural exit 0, no stream/overflow/late errors and PID ESRCH. These public finite process observations are not universal isolation or descendant proof.

This audit read only closed reports, streams, command/group metadata and public markers. It opened no token, private key, secret config, SQL database or mutable oracle source, ran no product code and changed no R files. The original run and all failure evidence remain unchanged.
