# `amc-sdk`

Drive a governed AMC agent from Python, and prove afterwards that it ran.

```python
from amc_sdk import AmcAgent, export_proof, verify_proof

with AmcAgent(workspace=".", provider="stub") as agent:
    session = agent.new_session()
    result = session.prompt("summarise the changelog")
    print(result.stop_reason)   # "end_turn"
    print(result.text)
    for call in result.tool_calls:
        print(call.title, call.status)

proof = export_proof(session.session_id, "run.amcproof.json")
```

No pip dependencies — the transport is `subprocess` + `json` + `threading`.
You need the `amc` CLI on the PATH, or `AMC_BIN` pointing at a build.

## What it does

Spawns `amc acp` and speaks the Agent Client Protocol down the pipe. That is the
only AMC surface where a message from a client causes a turn to actually execute:
the NDJSON wire (`amc wire`) accepts work and records the acceptance, but nothing
there ever runs it.

Each session is a real, ledger-backed AMC session. Several prompts may run on one
session, in turn, and they share a conversation.

## What a result does not mean

**`stop_reason == "end_turn"` is not "it worked."** ACP has five stop reasons and
AMC has seven turn endings, so `blocked` — a governance hook vetoed the turn —
arrives as `end_turn`, as do `error` and `interrupted`. When the mapping loses
something the real ending is in `result.meta`; authoritatively it is in the
signed log. Code that treats `end_turn` as success is claiming more than the
protocol said.

**`result.text` is not a token stream.** AMC records one row per completed block
of a completed model response, and rows are the only signed artifact — a token
stream would have to bypass the ledger. Text arrives in block-sized pieces.

**Nothing the client returns is verified.** Text that came over a pipe is bytes
from a subprocess. The proof below is the part that can be checked.

## Proving a run

```python
proof = export_proof(session_id, "run.amcproof.json", workspace=".")
# Send proof.path to whoever needs it. Send proof.auditor_key_fingerprint
# BY A DIFFERENT ROUTE — a fingerprint that travels inside the bundle it
# authenticates proves nothing about the bundle.

verify_proof("run.amcproof.json", expect_auditor_key=fingerprint_from_elsewhere)
```

`verify_proof` needs no workspace: the bundle is self-contained, which is what
makes it a proof rather than a report. `export_proof` refuses if the workspace's
evidence ledger does not verify, so a proof cannot be cut from a broken record.

These two shell out to the `amc` CLI. ACP has no method for "prove this session
happened", and pretending the protocol carried one would be the wrong kind of
convenience.

## Not supported

`session/load` — AMC has no resume path, and the agent declares
`loadSession: false` rather than claiming one. MCP servers — `new_session` sends
an empty list, and the agent refuses a non-empty one rather than accepting
servers it will never connect.

## Tests

```bash
AMC_BIN=$(pwd)/dist/cli.js python3 -m pytest sdk/python/tests -q
```

They spawn the real CLI and skip when they cannot find one that supports `acp`.
A bare `amc` on the PATH is probed rather than trusted: an older AMC installed
system-wide has no `acp` command, and driving it would fail somewhere deep in the
protocol instead of saying so.
