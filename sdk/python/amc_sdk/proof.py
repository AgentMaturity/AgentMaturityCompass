"""Turn a finished session into something a third party can check.

A :class:`~amc_sdk.client.RunResult` is what the agent said. This is what can be
carried off the machine and verified by someone who was not there.

THESE ARE CLI CALLS, NOT PROTOCOL CALLS, and the distinction is deliberate rather
than a limitation. ACP has no method for "prove this session happened": anchoring
writes to the workspace's transparency log and exporting cuts an inclusion proof
from it, neither of which a client on the far end of a pipe can or should do. So
these shell out to the same ``amc`` binary the agent runs under, and say so.

WHAT THE PROOF IS WORTH, precisely. It shows that a session with this root was
included in a transparency log signed by an auditor key. The verifier needs that
key's fingerprint **out of band** — from the proof itself it would prove only
that the bundle is internally consistent, which is not the same as trustworthy.
:func:`verify_proof` therefore requires the fingerprint rather than defaulting it.

Export refuses if the workspace's ledger does not verify, so a proof cannot be
cut from a broken record. That check is the CLI's, not this module's.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from typing import Optional

__all__ = ["SessionProof", "anchor_session", "export_proof", "verify_proof", "AmcProofError"]


class AmcProofError(Exception):
    """Anchoring, exporting or verifying failed. Carries the CLI's own reason."""


@dataclass(frozen=True)
class SessionProof:
    """An exported proof and the fingerprint needed to check it."""

    path: str
    session_id: str
    #: Share this by a different route than the proof. A fingerprint that travels
    #: inside the bundle it authenticates proves nothing about the bundle.
    auditor_key_fingerprint: str


def _run(argv: list[str], cwd: str) -> str:
    completed = subprocess.run(
        argv, cwd=cwd, capture_output=True, text=True, check=False
    )
    if completed.returncode != 0:
        # The CLI's message is the useful part; a generic wrapper error would
        # hide "the evidence ledger does not verify" behind "command failed".
        raise AmcProofError(
            (completed.stderr or completed.stdout or f"{argv[0]} exited {completed.returncode}").strip()
        )
    return completed.stdout


def _bin(amc_bin: Optional[str | list[str]]) -> list[str]:
    """The CLI as an argv prefix. A `.js` path is run through node."""
    resolved = amc_bin or os.environ.get("AMC_BIN") or "amc"
    if isinstance(resolved, list):
        return list(resolved)
    return ["node", resolved] if resolved.endswith(".js") else [resolved]


def anchor_session(session_id: str, *, workspace: str = ".", amc_bin: Optional[str | list[str]] = None) -> None:
    """Record the session's root in the workspace's transparency log.

    Idempotent: anchoring a session whose descriptor is already logged returns
    the existing entry rather than adding a second.
    """
    _run([*_bin(amc_bin), "session", "anchor", session_id], workspace)


def export_proof(
    session_id: str,
    out_file: str,
    *,
    workspace: str = ".",
    amc_bin: Optional[str | list[str]] = None,
) -> SessionProof:
    """Anchor if needed, then write a detached inclusion proof.

    Raises :class:`AmcProofError` when the workspace's evidence ledger does not
    verify. That refusal is the point: a proof cut from a broken ledger would
    verify offline while the record behind it did not.
    """
    anchor_session(session_id, workspace=workspace, amc_bin=amc_bin)
    _run([*_bin(amc_bin), "session", "proof", session_id, "--out", out_file], workspace)

    resolved = out_file if os.path.isabs(out_file) else os.path.join(workspace, out_file)
    with open(resolved, "r", encoding="utf-8") as handle:
        bundle = json.load(handle)
    return SessionProof(
        path=resolved,
        session_id=session_id,
        auditor_key_fingerprint=bundle["auditorKeyFingerprint"],
    )


def verify_proof(
    proof_file: str,
    *,
    expect_auditor_key: str,
    workspace: str = ".",
    amc_bin: Optional[str | list[str]] = None,
) -> bool:
    """Check a detached proof against an auditor fingerprint held out of band.

    ``expect_auditor_key`` is required, not optional. Verifying a bundle against
    the key it carries would confirm only that it is self-consistent — a forger
    who wrote the bundle also wrote that field.

    Needs no workspace: the bundle is self-contained, which is what makes it a
    proof rather than a report.
    """
    _run(
        [*_bin(amc_bin), "session", "verify-proof", proof_file, "--expect-auditor-key", expect_auditor_key],
        workspace,
    )
    return True
