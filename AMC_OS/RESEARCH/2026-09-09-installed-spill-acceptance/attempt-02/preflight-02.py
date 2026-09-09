#!/usr/bin/env python3
"""Private, bounded helper-only checks; never an AMC runtime/source-suite receipt."""
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
config = json.loads((base / "config.json").read_text())
output = base / "preflight-02"
output.mkdir(mode=0o700)
for name in ("home", "tmp"):
    (output / name).mkdir(mode=0o700)
source = Path(config["supervisor"]["path"])
if hashlib.sha256(source.read_bytes()).hexdigest() != config["supervisor"]["sha256"]:
    raise RuntimeError("Reviewed supervisor digest changed")
spec = importlib.util.spec_from_file_location("reviewed_spill_preflight_supervisor", source)
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)
supervisor.RECORD = output
supervisor.requested_signal = None
signal.signal(signal.SIGINT, supervisor.interrupted)
signal.signal(signal.SIGTERM, supervisor.interrupted)
env = {"PATH": str(Path(config["node"]["path"]).parent) + ":/usr/bin:/bin",
       "HOME": str(output / "home"), "TMPDIR": str(output / "tmp"),
       "PYTHONDONTWRITEBYTECODE": "1", "LC_ALL": "C", "NO_COLOR": "1"}
state = {"schemaVersion": 1, "classification": "helper-syntax-config-only-not-AMC-acceptance",
         "commands": [], "active": None, "checks": [], "failures": [], "qualified": False,
         "source": config["source"], "runnerSha256": config["runnerSha256"],
         "nativeSha256": config["native"]["sha256"]}
def save():
    with (output / "receipt.json").open("w") as stream:
        json.dump(state, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
save()
runner = str(Path(config["native"]["path"]).with_name("run.py"))
parse = "import ast,pathlib,sys;ast.parse(pathlib.Path(sys.argv[1]).read_text());print('Python source parsed; not imported or executed')"
validate = "import importlib.util,json,pathlib,sys;sys.dont_write_bytecode=True;s=importlib.util.spec_from_file_location('reviewed_helper',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);c=json.loads(pathlib.Path(sys.argv[2]).read_text());print(m.validate(c))"
queue = [
    ("python-syntax", [sys.executable, "-c", parse, runner], 0),
    ("native-syntax", [config["node"]["path"], "--check", config["native"]["path"]], 0),
    ("config-validation", [sys.executable, "-c", validate, runner, str(base / "config.json")], 0),
    ("missing-opt-in-refused", [sys.executable, runner, "--config", str(base / "config.json")], 2),
]
try:
    for label, argv, wanted in queue:
        code = supervisor.supervised(label, argv, base, env, 30, state, save)
        passed = (code == wanted and state["active"] is None and
                  state["commands"][-1].get("cleanup", {}).get("confirmedClosed") is True and
                  not Path(config["root"]).exists())
        state["checks"].append({"label": label, "exitCode": code, "expectedExit": wanted,
                                "runRootStillAbsent": not Path(config["root"]).exists(), "passed": passed})
        save()
        if not passed:
            raise RuntimeError("Preflight refused: " + label)
    state["qualified"] = bool(state["checks"]) and all(item["passed"] for item in state["checks"])
except Exception as error:
    state["failures"].append({"error": str(error), "traceback": traceback.format_exc()})
finally:
    state["allObservedCommandProcessesClosed"] = (bool(state["commands"]) and state["active"] is None and
        all(item.get("cleanup", {}).get("confirmedClosed") is True for item in state["commands"]))
    save()
print(json.dumps({"receipt": str(output / "receipt.json"), "qualified": state["qualified"],
                  "checks": state["checks"], "failures": state["failures"]}, indent=2))
sys.exit(0 if state["qualified"] and state["allObservedCommandProcessesClosed"] else 1)
