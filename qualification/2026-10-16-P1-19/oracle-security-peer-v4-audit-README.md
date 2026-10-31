# Independent review of the oracle v4 reader lifecycle

The closed v4 lifecycle delta is acceptable statically. It addresses both issues reported against the unapplied v3 proposal, and no additional blocker was found. Both exact text patches and all supplied v3/v4 source hashes match. No version was applied or executed by this reviewer.

The preparation guard now compares every non-WAL DB/key/history pin exactly before and after the real read-only BEGIN plus sqlite_master SELECT. The WAL must remain exact or change only from absent to a regular zero-byte file with the empty-byte digest. The guard runs before the cold CLI. The existing full baseline-to-after comparison remains unchanged while the same read transaction stays open through cold verification and independent action extraction. No WAL omission, restoration, copying or check relaxation is introduced.

The cleanup helper independently attempts rollback and close, retaining the original preparation error and all cleanup errors. The main finally runs it, and any failure forces inputs false before verdict. Aggregate errors preserve their component diagnostics.

This is a static review of closed source and diagnosis metadata. It ran no product import, parser, SQL, tests or network operation and changed no R or source-proposal files. Existing quiescent-fixture, external-anchor and endpoint-snapshot limitations remain; same-UID ABA writes are not excluded by this architecture. Root owns actual application and qualification.
