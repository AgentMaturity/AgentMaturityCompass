#!/usr/bin/env python3
"""Finite pinned shipping-boundary + changed-guard qualification; never a release.

Reuses the already fresh candidate02 clone, not the dirty root or an old consumer.
Each negative changes one owned guard in that clone and restores exact bytes.
Every new artifact, consumer, fixture, failure and command receipt is retained.
"""
from datetime import datetime, timezone, timedelta
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import signal
import socket
import subprocess

REPO = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
PIN = "b516869eeaa275fe31248024a02596d71255add0"
SOURCE = REPO / "tmp/cos-native-jsonl-writer-resume-01/candidate02/source"


def digest(value):
    return hashlib.sha256(value).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempt", required=True)
    parser.add_argument("--installed-only", action="store_true", help="Do not repeat completed changed-guard scenarios")
    parser.add_argument("--allow-registry", action="store_true", help="Explicitly permit normal public dependency registry resolution in this new consumer; record the resulting lock")
    args = parser.parse_args()
    if not args.attempt.isalnum() or len(args.attempt) > 24:
        parser.error("create-only alphanumeric attempt required")
    base = REPO / "tmp/cos-native-jsonl-writer-resume-01" / args.attempt
    base.mkdir(parents=True, exist_ok=False)
    logs = base / "receipts"
    logs.mkdir()
    record = {"taskId": "native-jsonl-writer-resume-batch", "sourceCommit": PIN, "source": str(SOURCE),
              "startedAt": datetime.now(timezone.utc).isoformat(), "commands": [], "mutations": [],
              "installedQualified": False, "mutationsQualified": False,
              "scope": "new local artifact public SDK/packaged ACP CLI/admin HTTP, plus new source changed-security negatives",
              "excluded": ["prepack/release", "publishing", "deployment", "old retained-output erasure", "installed cookie/browser", "real provider/human", "full-suite/platform matrix"]}
    environment = {key: value for key, value in os.environ.items() if not key.startswith("AMC_")
                   and key not in {"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN"}}
    environment.update(AMC_ACCEPTANCE_SOURCE=PIN, AMC_JSONL_RESUME_TEST_ROOT=str(base / "mutation-fixtures"))

    def state(action, child=None):
        now = datetime.now(timezone.utc)
        write(EVIDENCE / "ownership.json", {"taskId": record["taskId"], "owner": "cos-native-jsonl-writer-resume-prime",
            "state": action, "sourceCandidate": PIN, "updatedAt": now.isoformat(),
            "timeoutReviewAt": (now + timedelta(minutes=25)).isoformat(), "activeOwnedExecution": child,
            "ownedProcessGroups": [child["pid"]] if child else [], "workers": [], "ownershipReleased": False,
            "nextAction": "Complete this finite newly installed consumer and changed-guard checks; retain receipts and close every owned process.",
            "receiptPaths": [str(logs / "receipt.json")], "centralStatus": "Earlier central refresh denied; not claimed current."})
        write(logs / "receipt.json", record)

    def run(name, command, cwd=SOURCE, timeout=600, expected_failure=False):
        log = logs / (name + ".log")
        with log.open("w") as output:
            process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            item = {"name": name, "command": command, "cwd": str(cwd), "pid": process.pid,
                    "log": str(log), "startedAt": datetime.now(timezone.utc).isoformat(), "expectedFailure": expected_failure}
            record["commands"].append(item)
            state("pinned-shipping-boundary-running", item)
            print(json.dumps({"started": name, "pid": process.pid}), flush=True)
            try:
                item["exitCode"] = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                item["timedOut"] = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=10)
                item["exitCode"] = process.returncode
            finally:
                item["leaderClosed"] = process.poll() is not None
                item["endedAt"] = datetime.now(timezone.utc).isoformat()
                state("pinned-shipping-boundary-command-ended")
        print(json.dumps({"finished": name, "exitCode": item["exitCode"]}), flush=True)
        text = log.read_text()
        if item.get("timedOut") or (expected_failure and (item["exitCode"] == 0 or "AssertionError" not in text)) or (not expected_failure and item["exitCode"] != 0):
            raise RuntimeError(f"Unexpected result for {name}; retained {log}")
        return text

    state("pinned-shipping-boundary-starting")
    assert run("exact-pin", ["git", "show", "-s", "--format=%H", "HEAD"]).strip() == PIN
    run("source-unmodified-before-pack", ["git", "diff", "--exit-code", "HEAD", "--", "src", "package.json"])
    record["sourceReceipt"] = json.loads((SOURCE.parent / "receipts/receipt.json").read_text())
    assert record["sourceReceipt"]["qualified"] is True and record["sourceReceipt"]["sourceCommit"] == PIN
    try:
        artifacts = base / "artifact"
        artifacts.mkdir()
        run("pack-artifact-not-release", ["npm", "pack", "--ignore-scripts", "--pack-destination", str(artifacts)])
        tarballs = list(artifacts.glob("*.tgz"))
        assert len(tarballs) == 1
        archive = tarballs[0]
        record["artifact"] = {"path": str(archive), "sha256": digest(archive.read_bytes()), "bytes": archive.stat().st_size,
                              "packMode": "--ignore-scripts; prepack/release deliberately not run"}
        consumer = base / "consumer"
        consumer.mkdir()
        write(consumer / "package.json", {"name": "amc-new-jsonl-resume-consumer", "private": True, "type": "module",
             "dependencies": {"agent-maturity-compass": "file:" + str(archive)},
             "pnpm": {"onlyBuiltDependencies": ["better-sqlite3", "agent-maturity-compass"]}})
        (consumer / "pnpm-workspace.yaml").write_text("packages: []\n")
        shutil.copy2(EVIDENCE / "installed-case.mjs", consumer / "installed-case.mjs")
        record["consumerScriptSha256"] = digest((consumer / "installed-case.mjs").read_bytes())
        record["consumerDependencyResolution"] = "normal registry; newly recorded exact lock" if args.allow_registry else "offline cache; newly recorded exact lock"
        run("consumer-registry-install" if args.allow_registry else "consumer-offline-install",
            ["pnpm", "install", *([] if args.allow_registry else ["--offline"]), "--ignore-workspace"], consumer, 900)
        run("consumer-frozen-confirmation", ["pnpm", "install", "--offline", "--ignore-workspace", "--frozen-lockfile"], consumer, 600)
        record["consumerLockSha256"] = digest((consumer / "pnpm-lock.yaml").read_bytes())
        package = consumer / "node_modules/agent-maturity-compass"
        record["installedPayloads"] = []
        for relative in ["dist/persistence/jsonl/jsonlWriterLock.js", "dist/session/jsonlContinuation.js", "dist/session/sessionResume.js",
                         "dist/session/sessionRecovery.js", "dist/studio/nativeTaskService.js", "dist/sdk/nativeAgentClient.js", "dist/cli.js"]:
            expected = digest((SOURCE / relative).read_bytes())
            actual = digest((package / relative).read_bytes())
            assert actual == expected, f"installed payload mismatch: {relative}"
            record["installedPayloads"].append({"path": relative, "sha256": actual, "matchesFreshBuiltSource": True})
        run("installed-public-resume", ["node", "installed-case.mjs", str(base / "installed-fixtures")], consumer, 240)
        record["installedReceipt"] = str(base / "installed-fixtures/receipt.json")
        installed = json.loads(Path(record["installedReceipt"]).read_text())
        assert installed["ok"] and installed["allObservedWritersClosed"] and installed["serverClosed"] and installed["clientsClosed"]
        record["installedQualified"] = True
    except Exception as error:
        record["installedFailure"] = str(error)
        print(json.dumps({"installedFailure": str(error)}), flush=True)

    continuation = "src/session/jsonlContinuation.ts"
    mutations = [
        ("exclusive-kernel-mutex", "src/persistence/jsonl/jsonlWriterLock.ts", [("this.db.exec(\"BEGIN EXCLUSIVE\");", "this.db.exec(\"BEGIN DEFERRED\");")], "kernel mutex excludes contenders"),
        ("original-configuration", continuation, [("if ((options.compositionDigest !== undefined && opening.compositionDigest !== options.compositionDigest)\n    || (options.policyDigest !== undefined && opening.policyDigest !== options.policyDigest))", "if (false)")], "changed (composition|policy) refuses"),
        ("original-accounting", continuation, [("  assertAccounting(history.workspace, rows, opening.agentId, state);", "  // isolated negative: original accounting gate intentionally disabled")], "an empty replacement operations journal"),
        ("parent-stop-preserved", continuation, [("if (ending.cancelCause?.kind === \"parent\" || ending.cancelCause?.kind === \"hook\")", "if (false)"),
          ("if (cause?.kind === \"parent\" || cause?.kind === \"hook\")", "if (false)")], "a parent cancellation cannot")
    ]
    for name, relative, changes, pattern in ([] if args.installed_only else mutations):
        path = SOURCE / relative
        original = path.read_bytes()
        detail = {"name": name, "path": relative, "beforeSha256": digest(original), "testPattern": pattern, "detected": False, "restored": False}
        record["mutations"].append(detail)
        try:
            changed = original.decode()
            for old, new in changes:
                assert changed.count(old) == 1, f"mutation anchor ambiguous: {name}"
                changed = changed.replace(old, new, 1)
            path.write_text(changed)
            detail["mutatedSha256"] = digest(path.read_bytes())
            (logs / (name + ".mutation.txt")).write_text(json.dumps(changes, indent=2) + "\n")
            run("negative-" + name, ["pnpm", "exec", "vitest", "run", "tests/jsonlWriterResume.test.ts", "-t", pattern,
                                      "--maxWorkers=1", "--no-file-parallelism"], expected_failure=True, timeout=120)
            detail["detected"] = True
        except Exception as error:
            detail["failure"] = str(error)
        finally:
            path.write_bytes(original)
            detail["restored"] = digest(path.read_bytes()) == detail["beforeSha256"]
            state("changed-guard-restored")
    try:
        run("restored-source-exact", ["git", "diff", "--exit-code", "HEAD", "--", "src", "package.json"])
        if args.installed_only:
            record["mutationsQualified"] = None
            record["mutationScope"] = "Not repeated in this installed-only attempt; independent shipping01 receipts retain the four changed-guard negatives and restored positive."
        else:
            run("restored-core-positive", ["pnpm", "exec", "vitest", "run", "tests/jsonlWriterResume.test.ts", "--maxWorkers=1", "--no-file-parallelism"], timeout=150)
            record["mutationsQualified"] = all(item["detected"] and item["restored"] for item in record["mutations"])
    except Exception as error:
        record["restorationFailure"] = str(error)
    record["processGroups"] = []
    for item in record["commands"]:
        try:
            os.killpg(item["pid"], 0)
            closed = False
        except ProcessLookupError:
            closed = True
        record["processGroups"].append({"pgid": item["pid"], "closed": closed})
    record["allOwnedProcessGroupsClosed"] = all(item["closed"] for item in record["processGroups"])
    record["endedAt"] = datetime.now(timezone.utc).isoformat()
    state("pinned-shipping-boundary-ended")
    print(json.dumps({key: record[key] for key in ["installedQualified", "mutationsQualified", "allOwnedProcessGroupsClosed"]}), flush=True)
    return 0 if record["installedQualified"] and (args.installed_only or record["mutationsQualified"]) and record["allOwnedProcessGroupsClosed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
