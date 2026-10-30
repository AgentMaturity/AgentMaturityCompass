# rollback-revocation-list

A genuine revocation list with sequence 3 presented when sequence 5 is already known. Restoring an older list could un-revoke a lease, so it must not pass (P1-08 anti-rollback).
