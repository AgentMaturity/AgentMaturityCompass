"""Drive a governed AMC agent from Python, and prove afterwards that it ran.

    from amc_sdk import AmcAgent, export_proof

    with AmcAgent(workspace=".", provider="stub") as agent:
        session = agent.new_session()
        result = session.prompt("summarise the changelog")
        print(result.stop_reason, result.text)

    proof = export_proof(session.session_id, "run.amcproof.json")

No dependencies: the transport is `subprocess` + `json` + `threading`.

Read `RunResult`'s notes before treating `stop_reason == "end_turn"` as success.
Three different AMC turn endings arrive under that name, one of which is a
governance veto.
"""

from .client import (
    AmcAgent,
    AmcError,
    AmcProtocolError,
    AmcRefusedError,
    RunResult,
    Session,
    SessionUpdate,
    Turn,
    ToolCall,
)
from .proof import (
    AmcProofError,
    SessionProof,
    anchor_session,
    export_proof,
    verify_proof,
)

__version__ = "0.2.0"

__all__ = [
    "AmcAgent",
    "Session",
    "SessionUpdate",
    "Turn",
    "RunResult",
    "ToolCall",
    "AmcError",
    "AmcProtocolError",
    "AmcRefusedError",
    "SessionProof",
    "anchor_session",
    "export_proof",
    "verify_proof",
    "AmcProofError",
]
