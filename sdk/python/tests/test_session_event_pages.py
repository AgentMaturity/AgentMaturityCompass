"""WP20 scripted page transport tests; the native reader owns signature verification."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import threading
import time

import pytest

from amc_sdk import AmcAgent, AmcError, AmcProtocolError, AmcRefusedError, Turn


DIGEST = "a" * 64
PEER = r'''
import json
import os
from pathlib import Path
import sys
import time
pages = json.loads(sys.argv[1])
delays = json.loads(os.environ.get("AMC_WP20_PAGE_DELAYS", "[]"))
reference = json.loads(os.environ.get("AMC_WP20_TURN_REF", '{"turn":1,"seq":51,"eventId":"seal-1","eventHash":"' + "a" * 64 + '"}'))
pending = None

def outcome(reason):
    extension = {} if os.environ.get("AMC_WP20_NO_TURN_REF") else {"committedTurn": reference}
    return {"stopReason": reason, "_meta": {"dev.agentmaturity.amc": extension}}

for line in sys.stdin:
    request = json.loads(line)
    if os.environ.get("AMC_WP20_CAPTURE"):
        with Path(os.environ["AMC_WP20_CAPTURE"]).open("a", encoding="utf-8") as record:
            record.write(json.dumps(request) + "\n")
    if request["method"] == "session/cancel" and pending is not None:
        print(json.dumps({"jsonrpc": "2.0", "id": pending, "result": outcome("cancelled")}), flush=True)
        pending = None
    if "id" not in request:
        continue
    if request["method"] == "initialize":
        result = {"protocolVersion": 1, "agentInfo": {"name": "page-fixture", "version": "1.2.0"},
                  "agentCapabilities": {"_meta": {"dev.agentmaturity.amc": {
                      "executionApi": 1, "committedTurn": None if os.environ.get("AMC_WP20_NO_TURN_CAP") else "amc-committed-turn-v1",
                      "sessionEventPage": None if sys.argv[2] == "disabled" else "amc-session-event-page-v1"}}}}
    elif request["method"] == "_amc/session/events":
        time.sleep((delays.pop(0) if delays else 0) / 1000)
        result = pages.pop(0)
    elif sys.argv[3] == "resync" and request["method"] == "session/new":
        result = {"sessionId": "fixture-session"}
    elif sys.argv[3] == "resync" and request["method"] == "session/prompt":
        for index in range(50):
            update = ({"sessionUpdate": "tool_call", "toolCallId": f"call-{index}", "status": "pending", "title": "tool"}
                      if os.environ.get("AMC_WP20_TOOL_OVERFLOW") else {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": f"part-{index};"}})
            print(json.dumps({"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": "fixture-session", "update": update}}), flush=True)
        if os.environ.get("AMC_WP20_HOLD_PROMPT"):
            pending = request["id"]
            continue
        result = outcome("end_turn")
    else:
        raise RuntimeError("page reads must never acquire a writer")
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
'''


def state():
    metric = {"observedTokens": None, "reportedRequests": 0}
    return {"validation": {"status": "not-requested", "turn": None, "configSha256": None, "checks": []},
            "usage": {"scope": "recorded-session", "status": "unavailable", "requests": 0, "syntheticRequests": 0,
                      "reportedRequests": 0, "completeRequests": 0, "unreportedRequests": 0, "pendingRequests": 0, "issueCount": 0,
                      "totals": {key: dict(metric) for key in ("inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens")},
                      "cache": {"basis": "reported-input-token-subtotal", "readShare": None, "readTokens": None, "inputTokens": None,
                                "eligibleRequests": 0, "excludedRequests": 0, "unreportedWriteRequests": 0}},
            "turn": {"number": None, "lastEnd": None, "lastSeal": None, "cancellationRequested": False},
            "approvals": {"pending": 0, "answered": 0, "denied": 0, "unavailable": 0}, "toolOutcomes": {"unknown": 0, "unavailable": 0}}


VERIFICATION = {"metadata": "hashes-signatures-global-and-session-chains", "checkedStoreEventCount": 100,
                "payloads": "verified", "retainedOutput": "not-read", "completeness": "all-available-events-in-requested-scope",
                "rollbackProtection": "no-external-head", "trustRoot": {"anchored": False, "monitorFingerprint": DIGEST, "expectedFingerprint": None}}



SEAL = {"turn": 1, "seq": 51, "eventId": "seal-1", "eventHash": DIGEST}


def completed_state():
    snapshot = state()
    snapshot["turn"] = {"number": 1, "lastEnd": {"turn": 1, "reason": "complete", "interrupted": False, "cancelCause": None},
                        "lastSeal": dict(SEAL), "cancellationRequested": False}
    return snapshot


def page(**changes):
    return {"format": "amc-session-event-page-v1", "sessionId": "fixture-session", "agentId": "default", "committed": True,
            "backend": "sqlite", "headEventHash": DIGEST, "headSeq": 2, "storeHeadEventHash": DIGEST,
            "firstSeq": 0, "nextSeq": 3, "nextCursor": None, "resumeCursor": "follow-cursor", "sealed": False,
            "verification": VERIFICATION, "state": state(), "updates": [{"seq": 1, "eventId": "event-1", "eventHash": DIGEST,
                "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "committed answer"}}}], **changes}


@pytest.fixture
def peer(tmp_path):
    agents = []
    def start(pages=None, disabled=False, resync=False, **options):
        script = tmp_path / "peer.py"
        script.write_text(PEER, encoding="utf-8")
        capture = tmp_path / "requests.jsonl"
        environment = {**options.pop("env", {}), "AMC_WP20_CAPTURE": str(capture)}
        agent = AmcAgent(str(tmp_path), provider="stub", timeout=options.pop("timeout", 5), env=environment,
                         amc_bin=[sys.executable, str(script), json.dumps([page()] if pages is None else pages),
                                  "disabled" if disabled else "enabled", "resync" if resync else "read-only"], **options)
        agent._wp20_capture = capture
        agents.append(agent)
        return agent
    yield start
    for agent in agents:
        agent.close()


def test_read_is_detached_bounded_and_never_claims_a_writer(peer):
    result = peer().read_session_page("fixture-session", limit=8)
    assert result.committed and result.session_id == "fixture-session" and result.agent_id == "default"
    assert result.updates[0].update["content"]["text"] == "committed answer"
    assert result.resume_cursor == "follow-cursor" and result.next_cursor is None


def test_bounded_iteration_and_explicit_follow_cursor(peer):
    first = page(headSeq=3, nextSeq=2, nextCursor="next-page")
    second = page(headSeq=3, firstSeq=2, nextSeq=4, updates=[{"seq": 3, "eventId": "event-3", "eventHash": DIGEST,
                  "update": {"sessionUpdate": "tool_call_update", "toolCallId": "call-1", "status": "failed"}}])
    third = page(firstSeq=4, nextSeq=5, headSeq=4, updates=[], resumeCursor="new-follow-cursor")
    agent = peer([first, second, third])
    pages = list(agent.read_session_pages("fixture-session", limit=2))
    assert [update.seq for result in pages for update in result.updates] == [1, 3]
    assert agent.read_session_page("fixture-session", cursor=pages[-1].resume_cursor).updates == ()


def test_unadvertised_capability_is_refused(peer):
    with pytest.raises(AmcRefusedError):
        peer(disabled=True).read_session_page("fixture-session")


@pytest.mark.parametrize("limit", [0, -1, 257, 1.5, "8", True])
def test_bad_bounds_are_refused_before_transport(peer, limit):
    with pytest.raises(ValueError):
        peer().read_session_page("fixture-session", limit=limit)


@pytest.mark.parametrize("changes", [
    {"sessionId": "another-session"}, {"agentId": "another-owner"}, {"committed": False}, {"headEventHash": "bad"},
    {"nextSeq": 4}, {"firstSeq": -1}, {"resumeCursor": ""}, {"nextCursor": 3},
    {"updates": [{"seq": 3, "eventId": "event-3", "eventHash": DIGEST, "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "out of range"}}}]},
    {"updates": [{"seq": 1, "eventId": "event-1", "eventHash": DIGEST, "update": {"sessionUpdate": "provisional_text", "content": {"type": "text", "text": "draft"}}}]}
])
def test_inconsistent_pages_are_refused(peer, changes):
    with pytest.raises(AmcProtocolError):
        peer([page(**copy.deepcopy(changes))]).read_session_page("fixture-session")


def test_iteration_refuses_a_changed_snapshot(peer):
    agent = peer([page(nextSeq=2, nextCursor="next-page"), page(firstSeq=2, updates=[], headEventHash="b" * 64)])
    pages = agent.read_session_pages("fixture-session")
    next(pages)
    with pytest.raises(AmcProtocolError):
        next(pages)


@pytest.mark.parametrize("entry", [
    {"content": "prepare", "priority": "medium", "status": "invented"},
    {"content": "prepare", "priority": [], "status": "pending"},
    {"content": "prepare", "priority": "medium", "status": {}},
    {"content": "x" * 8193, "priority": "medium", "status": "pending"},
])
def test_malformed_plan_updates_are_refused(peer, entry):
    update = {"sessionUpdate": "plan", "entries": [entry]}
    result = page(updates=[{"seq": 1, "eventId": "event-1", "eventHash": DIGEST, "update": update}])
    with pytest.raises(AmcProtocolError, match="plan update"):
        peer([result]).read_session_page("fixture-session")


def test_plan_and_status_metadata_survive_read_projection(peer):
    plan = {"sessionUpdate": "plan", "entries": [{"content": "<script>model text</script>", "priority": "medium", "status": "pending"}],
            "_meta": {"dev.agentmaturity.amc": {"listKind": "todo", "sourceStatuses": ["blocked"]}}}
    snapshot = state()
    snapshot["approvals"]["pending"] = 1
    snapshot["toolOutcomes"]["unknown"] = 1
    agent = peer([page(state=snapshot, updates=[{"seq": 1, "eventId": "event-1", "eventHash": DIGEST, "update": plan}])])
    result = agent.read_session_page("fixture-session")
    assert result.state == snapshot and result.updates[0].update == plan


def test_iteration_refuses_a_nonadvancing_cursor(peer):
    agent = peer([page(nextSeq=2, nextCursor="repeated-cursor"),
                  page(firstSeq=2, nextSeq=2, updates=[], nextCursor="repeated-cursor")])
    pages = agent.read_session_pages("fixture-session")
    next(pages)
    with pytest.raises(AmcProtocolError, match="did not advance"):
        next(pages)


def test_missing_next_cursor_is_refused_instead_of_silently_ending_a_page(peer):
    response = page()
    del response["nextCursor"]
    with pytest.raises(AmcProtocolError):
        peer([response]).read_session_page("fixture-session")


def recovery_pages(**changes):
    baseline = page(headSeq=0, nextSeq=1, updates=[], resumeCursor="before-turn")
    updates = [{"seq": index + 1, "eventId": f"event-{index + 1}", "eventHash": DIGEST,
                "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": f"part-{index};"}}} for index in range(50)]
    return [baseline, page(firstSeq=1, nextSeq=52, headSeq=51, updates=updates, state=changes.pop("state", completed_state()), **changes)]


def test_overflow_resynchronizes_text_without_retaining_all_updates(peer):
    agent = peer(recovery_pages(), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    turn = agent.new_session().start_prompt("many updates")
    seen = []
    with pytest.raises(AmcProtocolError) as raised:
        for event in turn:
            seen.append(event)
    assert raised.value.__class__.__name__ == "AmcResyncRequiredError" and raised.value.recoverable
    assert len(seen) == 8
    result = turn.result()
    assert result.text == "".join(f"part-{index};" for index in range(50))
    assert len(result.updates) == 8 and result.resynced
    assert result.recovery == {"cursor": "follow-cursor", "updatesComplete": False, "retainedUpdates": "bounded-prefix"}
    assert not agent.closed


def test_overflow_recovery_refuses_a_tampered_page(peer):
    agent = peer(recovery_pages(committed=False), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("many updates")


def test_recovered_text_respects_the_existing_byte_bound(peer):
    agent = peer(recovery_pages(), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8, "max_bytes": 200})
    with pytest.raises(AmcProtocolError, match="byte limit"):
        agent.new_session().prompt("many updates")


@pytest.mark.parametrize("session_id", ["", "\0", None])
def test_invalid_session_identity_is_refused(peer, session_id):
    with pytest.raises(ValueError):
        peer().read_session_page(session_id)


@pytest.mark.parametrize("cursor", ["", "x" * 2049])
def test_invalid_cursor_length_is_refused(peer, cursor):
    with pytest.raises(ValueError):
        peer().read_session_page("fixture-session", cursor=cursor)


@pytest.mark.parametrize("path,value", [
    (("usage", "requests"), -1), (("usage", "totals"), {}), (("usage", "totals", "inputTokens"), {}),
    (("usage", "cache"), {}), (("usage", "requestCache"), {}), (("toolOutcomes", "unknown"), -1),
    (("validation", "status"), "invented"), (("approvals", "pending"), -1),
    (("turn", "lastEnd"), {"turn": 1, "reason": "complete", "interrupted": True, "cancelCause": None}),
    (("turn", "lastEnd"), {"turn": 1, "reason": "cancelled", "interrupted": False, "cancelCause": None}),
    (("turn", "lastEnd"), {"turn": 1, "reason": "cancelled", "interrupted": False, "cancelCause": {"kind": "hook"}}),
])
def test_invalid_cumulative_state_is_refused_without_inventing_zero(peer, path, value):
    snapshot = state()
    target = snapshot
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(AmcProtocolError):
        peer([page(state=snapshot)]).read_session_page("fixture-session")


@pytest.mark.parametrize("changes", [
    {"firstSeq": 0, "nextSeq": 257, "headSeq": 256, "updates": []},
    {"nextCursor": "extra-page-at-end"}, {"nextCursor": None, "nextSeq": 2}, {"verification": {}},
])
def test_inconsistent_bounded_ranges_are_refused(peer, changes):
    with pytest.raises(AmcProtocolError):
        peer([page(**changes)]).read_session_page("fixture-session")



def records(agent):
    try:
        return [json.loads(line) for line in agent._wp20_capture.read_text(encoding="utf-8").splitlines()]
    except FileNotFoundError:
        return []


def wait_for_reads(agent, count):
    deadline = time.monotonic() + 5
    while len([record for record in records(agent) if record["method"] == "_amc/session/events"]) < count:
        assert time.monotonic() < deadline, "scripted peer did not receive its page request"
        time.sleep(0.005)


def test_recovery_requires_committed_turn_capability(peer):
    with pytest.raises(AmcRefusedError):
        peer([], resync=True, resync_on_overflow=True, env={"AMC_WP20_NO_TURN_CAP": "1"})


def test_recovery_refuses_valid_prefix_rollback_to_unchanged_baseline(peer):
    baseline = recovery_pages()[0]
    rollback = page(firstSeq=1, headSeq=0, nextSeq=1, updates=[])
    agent = peer([baseline, rollback], resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("valid-prefix rollback")


@pytest.mark.parametrize("environment", [
    {"AMC_WP20_NO_TURN_REF": "1"}, {"AMC_WP20_TURN_REF": "null"},
    {"AMC_WP20_TURN_REF": json.dumps({**SEAL, "seq": 0})}, {"AMC_WP20_TURN_REF": json.dumps({**SEAL, "eventHash": "bad"})},
])
def test_recovery_requires_exact_current_reply_seal(peer, environment):
    agent = peer(recovery_pages(), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8}, env=environment)
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("reply seal required")


@pytest.mark.parametrize("changes", [
    {"lastSeal": None}, {"lastSeal": {**SEAL, "eventId": "another-seal"}},
    {"lastEnd": {"turn": 2, "reason": "complete", "interrupted": False, "cancelCause": None}},
])
def test_recovery_requires_this_completed_turn_in_page_state(peer, changes):
    snapshot = completed_state()
    snapshot["turn"].update(changes)
    agent = peer(recovery_pages(state=snapshot), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("exact current seal")


def test_recovery_refuses_text_different_from_retained_live_prefix(peer):
    pages = recovery_pages()
    for event in pages[1]["updates"]:
        event["update"]["content"]["text"] = "different"
    agent = peer(pages, resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("matching text required")


def test_preflight_total_deadline_stops_before_another_page_or_prompt(peer):
    pages = [page(headSeq=2, nextSeq=1, nextCursor="p1", updates=[]),
             page(headSeq=2, firstSeq=1, nextSeq=2, nextCursor="p2", updates=[]), page(firstSeq=2, updates=[])]
    agent = peer(pages, resync=True, resync_on_overflow=True, timeout=0.6, env={"AMC_WP20_PAGE_DELAYS": "[300,300,300]"})
    with pytest.raises(AmcProtocolError):
        agent.new_session().start_prompt("deadline")
    assert len([record for record in records(agent) if record["method"] == "_amc/session/events"]) <= 2
    assert not [record for record in records(agent) if record["method"] == "session/prompt"]


def test_session_cancel_can_interrupt_preflight_without_waiting_for_handle_lock(peer):
    pages = [page(nextSeq=1, nextCursor="p1", updates=[]), page(firstSeq=1, updates=[])]
    agent = peer(pages, resync=True, resync_on_overflow=True, env={"AMC_WP20_PAGE_DELAYS": "[400,400]"})
    session = agent.new_session()
    outcome = []
    def submit():
        try:
            outcome.append(session.start_prompt("cancel before model"))
        except BaseException as error:
            outcome.append(error)
    worker = threading.Thread(target=submit)
    worker.start()
    wait_for_reads(agent, 1)
    cancelled = threading.Event()
    def cancel():
        session.cancel()
        cancelled.set()
    canceller = threading.Thread(target=cancel)
    canceller.start()
    try:
        assert cancelled.wait(0.15), "session.cancel blocked on the long preflight handle lock"
    finally:
        worker.join(3)
        canceller.join(3)
    assert outcome and isinstance(outcome[0], AmcError)
    assert len([record for record in records(agent) if record["method"] == "_amc/session/events"]) == 1
    assert not [record for record in records(agent) if record["method"] == "session/prompt"]


def test_cancel_during_recovery_refuses_result_without_replaying_prompt(peer):
    agent = peer(recovery_pages(), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8},
                 env={"AMC_WP20_PAGE_DELAYS": "[0,100]"})
    turn = agent.new_session().start_prompt("cancel during recovery")
    wait_for_reads(agent, 2)
    turn.cancel()
    with pytest.raises(AmcError, match="cancel"):
        turn.result()
    assert len([record for record in records(agent) if record["method"] == "session/prompt"]) == 1


def test_acknowledged_model_cancellation_still_returns_cancelled_result(peer):
    snapshot = completed_state()
    snapshot["turn"]["lastEnd"].update(reason="cancelled", cancelCause={"kind": "user"})
    agent = peer(recovery_pages(state=snapshot), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8},
                 env={"AMC_WP20_HOLD_PROMPT": "1"})
    turn = agent.new_session().start_prompt("cancel model")
    with pytest.raises(AmcProtocolError):
        list(turn)
    turn.cancel()
    assert turn.result().stop_reason == "cancelled"



def test_recovery_uses_same_total_deadline_after_prompt_reply(peer):
    baseline, recovered = recovery_pages()
    updates = recovered["updates"]
    pages = [baseline, {**recovered, "nextSeq": 18, "nextCursor": "r1", "updates": updates[:17]},
             {**recovered, "firstSeq": 18, "nextSeq": 35, "nextCursor": "r2", "updates": updates[17:34]},
             {**recovered, "firstSeq": 35, "updates": updates[34:]}]
    agent = peer(pages, resync=True, resync_on_overflow=True, event_buffer={"max_events": 8}, timeout=0.6,
                 env={"AMC_WP20_PAGE_DELAYS": "[0,300,300,300]"})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("recovery deadline")
    assert len([record for record in records(agent) if record["method"] == "_amc/session/events"]) <= 3
    assert len([record for record in records(agent) if record["method"] == "session/prompt"]) == 1


def test_recovery_refuses_rows_before_saved_follow_boundary(peer):
    pages = recovery_pages()
    pages[1]["firstSeq"] = 0
    agent = peer(pages, resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("exact follow boundary")


def test_recovery_accepts_final_pinned_seal_after_multiple_drained_turns(peer):
    reference = {**SEAL, "turn": 3}
    snapshot = completed_state()
    snapshot["turn"].update(number=3, lastSeal=reference)
    snapshot["turn"]["lastEnd"]["turn"] = 3
    agent = peer(recovery_pages(state=snapshot), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8},
                 env={"AMC_WP20_TURN_REF": json.dumps(reference)})
    assert agent.new_session().prompt("drained queued turns").text == "".join(f"part-{index};" for index in range(50))


def test_session_page_state_requires_explicit_nullable_last_seal(peer):
    snapshot = state()
    del snapshot["turn"]["lastSeal"]
    with pytest.raises(AmcProtocolError):
        peer([page(state=snapshot)]).read_session_page("fixture-session")



def test_recovery_refuses_coherent_prior_seal_even_without_assistant_prefix(peer):
    baseline = page(headSeq=51, nextSeq=52, updates=[], state=completed_state(), resumeCursor="before-turn")
    rollback = page(firstSeq=52, headSeq=51, nextSeq=52, updates=[], state=completed_state())
    agent = peer([baseline, rollback], resync=True, resync_on_overflow=True, event_buffer={"max_events": 8},
                 env={"AMC_WP20_TOOL_OVERFLOW": "1"})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("no new current turn seal")



def test_cancel_at_final_recovery_settlement_cannot_publish_completed_result(peer, monkeypatch):
    original = Turn._finish
    def cancel_before_settlement(self, response, recovered=None):
        if recovered is not None:
            self.cancel()
        return original(self, response, recovered)
    monkeypatch.setattr(Turn, "_finish", cancel_before_settlement)
    agent = peer(recovery_pages(), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8})
    with pytest.raises(AmcError, match="cancel"):
        agent.new_session().prompt("cancel at settlement")



def test_recovery_refuses_coherently_malformed_reply_and_snapshot_seal(peer):
    reference = {**SEAL, "eventHash": "bad"}
    snapshot = completed_state()
    snapshot["turn"]["lastSeal"] = reference
    agent = peer(recovery_pages(state=snapshot), resync=True, resync_on_overflow=True, event_buffer={"max_events": 8},
                 env={"AMC_WP20_TURN_REF": json.dumps(reference)})
    with pytest.raises(AmcProtocolError):
        agent.new_session().prompt("invalid seal digest")
