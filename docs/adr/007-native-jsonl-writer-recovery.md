# ADR 007: Authenticated local JSONL writer recovery

Status: implemented source candidate; execution qualification is separate.
Owner: AMC-1511 under AMC-1505. Date: 2026-09-10.

## Problem

The existing JSONL append backend replaced a dead or unreadable PID file without
electing a single takeover winner. Native signed session ownership and expected
head checks already existed, as did synthetic crash reconstruction, but reopening
the workspace writer was not safe. Cold history inspection could not fill that gap.

## Decision

Use AMC's existing SQLite binding for a dedicated, non-pooled, process-lifetime
`BEGIN EXCLUSIVE` mutex beside the JSONL logs. Its kernel lock is released on real
process death. Keep the advisory owner record for explicit token identity and
fail-closed handling of live, foreign-host, unknown or unsupported older owners.
All current JSONL writers use the same mutex. The coordinator holds no history,
usage or authority, and JSONL remains the selected native session evidence backend.

Reuse the native signed owner/head fence and synthetic recovery vocabulary rather
than introducing a second session lineage. Authenticate complete original JSONL
metadata, native identity, original configuration, append boundaries, relevant
parent/child state and original usage/reservation evidence before append descriptors
open, and repeat native checks under the writer mutex. Append recovery facts to
the same session; never trim a partial tail or relabel an unknown effect successful.
The next execution requires a new explicit turn and preserves original admitted IDs.

Expose only advisory readiness in Studio and the public native SDK. The existing
CLI/ACP/SDK continuation path must acquire the real writer; HTTP authentication,
signed descriptor ownership, revision checks, pinned scope, approval admission and
explicit browser refresh remain unchanged. A readiness flag cannot authorize code.

## Refused boundaries

No time-based lease theft; no takeover of remote or unprovably dead owners; no
empty-operations-database fallback. Closed/archived sessions do not become writable.
A parent/hook-stopped session, detached delegated child or parent with unresolved
children cannot become a fresh unrestricted standalone agent. Unresolved dispatch
cost stays reserved or unknown and remains subject to the original signed policy.
Metadata inspection does not decrypt retained output.

This is local filesystem coordination, not a distributed lease service, an
anti-administrator tamper guarantee or a power-loss-durability upgrade. Unsupported
older concurrent writers must not share the workspace. Whole-store rollback needs
independent head/checkpoint evidence beyond a self-consistent restored snapshot.

## Alternatives rejected

Overwriting stale PID files races. Expiring leases may steal a paused live writer.
A second stale lock directory has the same crash-recovery election problem. An
unreleased helper daemon creates another lifecycle to recover. A new native flock
dependency adds packaging/platform scope without replacing authentication. Moving
session evidence into operations SQLite would change the selected-backend contract
instead of implementing native JSONL recovery.

## Qualification

New scoped tests author actual killed writers and concurrent contenders, original
prefix and side-effect preservation, pending usage, state/configuration refusals,
and public continuation. Authored tests are not results. Use the exact candidate,
installed artifact and receipts in
`AMC_OS/RESEARCH/2026-09-10-native-jsonl-writer-resume/` for what actually ran.
