# P0-51 rebuilt candidate actual CLI qualification — 14 October 2026

The unchanged complete 84-case observer passes 81 cases and retains three failures, with zero pending or todo cases. Execution takes 64.867 seconds under Node22.23.3. The test file remains byte-identical at SHA256 86f45ab5601d53ae0dc274a52a113d7bb2cbdc9451c74c0e68668f46ce8e286f. Qualification remains incomplete.

All six prior strict label failures are fixed in the rebuilt candidate. The actual notary and transparency success outputs, each with captured PEM, unused allow flags and a signed operator list, now exit0. Independent postvalidation parses the production verifier and status schemas and asserts complete canonical claim fields: self_reported, result not_evaluated, and the canonical artifact label. Cryptographic admission does not promote a result to observed or independently reviewed.

The three retained compromise-revocation cases still exit0/trusted against expected1: Industry Pack explicit PEM, the independent external-authority file and the mandatory matching session fingerprint. Integrity passes and the report names explicit-key admission. The authored requirement contradiction and all three active RED expectations are unchanged. No source behavior was reinterpreted or test relaxed.

The private manifest contains 84 actual children and 168 independently rechecked stdout/stderr hashes. Eighteen compiled input hashes captured during this run remain unchanged afterward. Parent's temporary source-only export mutation did not alter the compiled CLI candidate. The separate final test typecheck previously passed for these exact test bytes. Raw data and prior failures remain in their original private artifacts.

This run targets a parent-owned dirty production candidate against 3b08, before the final source commit and comprehensive pinned checks. It changes no test or source, installs nothing and rebuilds nothing. The sibling license-lookup and F4 evidence remain separate; inherited P0-22 failures, held paths, full coverage and hosted/release obligations remain unresolved.
