#!/usr/bin/env python3
"""One outer supervision boundary for the reviewed installed-spill runner."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import traceback

os.umask(0o077)
sys.dont_write_bytecode = True
base = Path(__file__).resolve().parent
config_path = base / "config.json"
config_bytes = config_path.read_bytes()
if hashlib.sha256(config_bytes).hexdigest() != "c332640791f9c4711e3ca37e5e92576b36321d7fb484af6a39ac808999b9b3f0":
    raise RuntimeError("Reviewed configuration changed")
config = json.loads(config_bytes)
preflight = json.loads((base / "preflight-02/receipt.json").read_text())
if preflight.get("qualified") is not True or preflight.get("allObservedCommandProcessesClosed") is not True:
    raise RuntimeError("Helper preflight is not qualified/closed")
prepared = json.loads((base / "prepared.json").read_text())
python = prepared["python"]["path"]
runner = Path(config["native"]["path"]).with_name("run.py")
for path, sha in [(Path(python), prepared["python"]["sha256"]),
                  (runner, config["runnerSha256"]),
                  (Path(config["supervisor"]["path"]), config["supervisor"]["sha256"])]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        raise RuntimeError("Execution input changed: " + str(path))
if Path(config["root"]).exists():
    raise RuntimeError("One-shot run root already exists; no retry or reuse")
out = base / "outer"
out.mkdir(mode=0o700)
for name in ("home", "tmp"):
    (out / name).mkdir(mode=0o700)
spec = importlib.util.spec_from_file_location("reviewed_outer_spill_supervisor", config["supervisor"]["path"])
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
supervisor.RECORD = out
supervisor.requested_signal = None
signal.signal(signal.SIGTERM, supervisor.interrupted)
signal.signal(signal.SIGINT, supervisor.interrupted)
env = {"PATH": str(Path(config["node"]["path"]).parent) + ":/usr/bin:/bin",
       "HOME": str(out / "home"), "TMPDIR": str(out / "tmp"),
       "LC_ALL": "C", "PYTHONDONTWRITEBYTECODE": "1", "NO_COLOR": "1"}
state = {"schemaVersion": 1, "classification": "outer-runner-process-supervision-not-an-independent-AMC-verdict",
         "helperCommit": "446087ca8510c27e83c2465bab9946634a88724b", "source": config["source"],
         "commands": [], "active": None, "failures": [], "exitCode": None,
         "configurationSha256": hashlib.sha256(config_bytes).hexdigest()}
def save():
    with (out / "receipt.json").open("w") as stream:
        json.dump(state, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
save()
try:
    state["exitCode"] = supervisor.supervised("installed-spill", [python, str(runner), "--config", str(config_path), "--execute"],
                                               base, env, 2100, state, save)
except Exception as error:
    state["failures"].append({"error": str(error), "traceback": traceback.format_exc()})
finally:
    state["allObservedCommandProcessesClosed"] = (bool(state["commands"]) and state["active"] is None and
        all(c.get("cleanup", {}).get("confirmedClosed") is True for c in state["commands"]))
    save()
print(json.dumps({"receipt": str(out / "receipt.json"), "exitCode": state["exitCode"],
                  "allObservedCommandProcessesClosed": state["allObservedCommandProcessesClosed"],
                  "failures": state["failures"]}, indent=2))
sys.exit(0 if state["exitCode"] == 0 and state["allObservedCommandProcessesClosed"] and not state["failures"] else 1)
