#!/usr/bin/env python3
"""Finite fresh-pin acceptance and restored mutations for this new batch only."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import time

EVIDENCE = Path(__file__).resolve().parent
REPO = EVIDENCE.parents[2]
SCRATCH = REPO / "tmp/cos-native-recovery-control-gap-01"
DEADLINE = datetime.fromisoformat("2026-09-09T22:45:00+00:00")
NEW_TESTS = ["tests/nativeRecoveryControl.test.ts", "tests/nativeManagedRecovery.test.ts"]
RELATED = ["tests/sessionResume.test.ts", "tests/jsonlWriterResume.test.ts", "tests/nativeJsonlResumePublic.test.ts", "tests/studioNativeTaskService.test.ts"]

def now(): return datetime.now(timezone.utc)
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path, value): path.write_text(json.dumps(value, indent=2) + "\n")
def group_exists(pid):
    try: os.killpg(pid, 0); return True
    except ProcessLookupError: return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--attempt", required=True)
    parser.add_argument("--mode", choices=["source", "mutations", "installed"], default="source")
    parser.add_argument("--source")
    parser.add_argument("--browser-executable")
    args = parser.parse_args()
    if len(args.candidate) != 40 or any(c not in "0123456789abcdef" for c in args.candidate): parser.error("Use the full pinned commit hash")
    if not args.attempt.isalnum() or len(args.attempt) > 24: parser.error("Use a new alphanumeric attempt name")
    root = SCRATCH / args.attempt; root.mkdir(parents=True, exist_ok=False)
    receipts = root / "receipts"; receipts.mkdir()
    if args.mode == "source":
        if args.source: parser.error("source mode always creates its own fresh clone")
        source = root / "source"
    else:
        if not args.source: parser.error("Provide the prior fresh pinned source")
        source = Path(args.source).resolve(strict=True)
        if not source.is_relative_to(SCRATCH.resolve()) or source.name != "source": parser.error("source must be this batch's fresh clone")
    env = {key: value for key, value in os.environ.items() if not key.startswith("AMC_") and key not in {
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN", "NODE_OPTIONS"}}
    env.update(AMC_RECOVERY_CONTROL_RECEIPTS=str(root / "core-fixtures"), AMC_PUBLIC_TRANSPORT_RECEIPTS=str(root / "public-fixtures"),
               AMC_JSONL_RESUME_TEST_ROOT=str(root / "jsonl-fixtures"), AMC_RECOVERY_CONTROL_BROWSER="1", AMC_JSONL_RESUME_BROWSER="1",
               AMC_ACCEPTANCE_SOURCE=args.candidate)
    browser = None
    if args.browser_executable:
        browser = Path(args.browser_executable).resolve(strict=True)
        if not browser.is_file() or not os.access(browser, os.X_OK): parser.error("Existing browser must be executable")
        env["AMC_TEST_BROWSER_EXECUTABLE"] = str(browser)
    result = {"taskId": "native-recovery-control-gap-batch", "mode": args.mode, "sourceCommit": args.candidate,
        "source": str(source), "attempt": args.attempt, "startedAt": now().isoformat(), "runnerPid": os.getpid(),
        "environment": {"system": platform.system(), "release": platform.release(), "arch": platform.machine()},
        "commands": [], "mutations": [], "qualified": False,
        "exclusions": ["full suite", "release/prepack gate", "other platforms", "real provider/human", "old erasure/helper repins", "production secrets", "publication/deployment"]}
    active = None
    def save(state, child=None):
        write(receipts / "receipt.json", result)
        owned = json.loads((EVIDENCE / "ownership.json").read_text())
        if owned.get("taskId") != result["taskId"] or owned.get("owner") != "cos-native-recovery-control-gap-prime" or owned.get("ownershipReleased"):
            raise RuntimeError("Batch ownership changed; no conflicting status overwrite")
        owned.update(state=state, observedAt=now().isoformat(), sourceCandidate=args.candidate,
            activeOwnedExecution={"runnerPid": os.getpid(), "command": child} if child else "serial-prime-acceptance-review",
            ownedProcessGroups=[child["pid"]] if child else [], workers=[],
            remainingOperation="Complete current bounded acceptance, retain all attempts, then close and hand off.",
            receiptPaths=list(dict.fromkeys(owned.get("receiptPaths", []) + [str(receipts / "receipt.json")])))
        write(EVIDENCE / "ownership.json", owned)
    def close_group(pid):
        if not group_exists(pid): return True
        os.killpg(pid, signal.SIGTERM)
        until = time.monotonic() + 5
        while group_exists(pid) and time.monotonic() < until: time.sleep(.05)
        if group_exists(pid):
            os.killpg(pid, signal.SIGKILL); until = time.monotonic() + 5
            while group_exists(pid) and time.monotonic() < until: time.sleep(.05)
        return not group_exists(pid)
    def run(name, command, cwd=source, timeout=600, expected_failure=False):
        nonlocal active
        available = (DEADLINE - now()).total_seconds() - 120
        if available < 5: raise RuntimeError("Review deadline checkpoint reached; no new operation started")
        path = receipts / f"{name}.log"
        with path.open("x") as output:
            active = subprocess.Popen(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            row = {"name": name, "command": command, "cwd": str(cwd), "pid": active.pid, "pgid": active.pid,
                "startedAt": now().isoformat(), "log": str(path), "expectedFailure": expected_failure}
            result["commands"].append(row); save("acceptance-running", row)
            print(json.dumps({"started": name, "pid": active.pid, "log": str(path)}), flush=True)
            try: row["exitCode"] = active.wait(timeout=min(timeout, available))
            except subprocess.TimeoutExpired:
                row["timedOut"] = True; os.killpg(active.pid, signal.SIGTERM)
                try: active.wait(timeout=5)
                except subprocess.TimeoutExpired: os.killpg(active.pid, signal.SIGKILL); active.wait(timeout=5)
                row["exitCode"] = active.returncode
            finally:
                row["leaderClosed"] = active.poll() is not None
                row["groupClosed"] = close_group(active.pid); row["endedAt"] = now().isoformat(); active = None
                save("acceptance-command-ended")
        print(json.dumps({"finished": name, "exitCode": row["exitCode"], "groupClosed": row["groupClosed"]}), flush=True)
        if not row["groupClosed"] or row.get("timedOut") or (row["exitCode"] != 0 and not expected_failure): raise RuntimeError(f"{name} failed: {path}")
        return path.read_text(), row
    def tests(name, files, pattern=None, expected_failure=False):
        report = receipts / f"{name}.json"
        command = ["pnpm", "exec", "vitest", "run", *files, "--maxWorkers=1", "--no-file-parallelism",
            "--reporter=default", "--reporter=json", "--outputFile", str(report)]
        if pattern: command += ["--testNamePattern", pattern]
        _, row = run(name, command, expected_failure=expected_failure)
        data = json.loads(report.read_text())
        summary = {key: data.get(key) for key in ["numPassedTests", "numFailedTests", "numPendingTests", "numTotalTests", "success"]}
        row["testSummary"] = summary
        if expected_failure:
            if row["exitCode"] == 0 or not data.get("numFailedTests", 0): raise RuntimeError(f"Mutation survived or did not reach assertions: {name}")
        elif not data.get("success") or data.get("numFailedTests") or not data.get("numPassedTests"): raise RuntimeError(f"Invalid passing test receipt: {name}")
        save("acceptance-test-result-recorded"); return summary
    try:
        save("acceptance-starting")
        if args.mode == "source":
            run("clone", ["git", "clone", "--no-hardlinks", "--no-local", str(REPO), str(source)], REPO)
            run("pin", ["git", "checkout", "--detach", args.candidate])
        pin, _ = run("pin-identity", ["git", "rev-parse", "HEAD"])
        if pin.strip() != args.candidate: raise RuntimeError("Source pin mismatch")
        run("source-clean", ["git", "diff", "--exit-code"])
        for tool in ["node", "pnpm"]: result["environment"][tool] = run(f"{tool}-version", [tool, "--version"])[0].strip()
        if browser:
            result["environment"].update(browserExecutable=str(browser), browserSha256=sha(browser), browserVersion=run("browser-version", [str(browser), "--version"])[0].strip())
        if args.mode == "source":
            run("fresh-install", ["pnpm", "install", "--frozen-lockfile", "--offline"], timeout=900)
            run("vendor-build", ["pnpm", "run", "build:vendor"])
            run("candidate-build", ["pnpm", "run", "build"])
            result["newScope"] = tests("new-native-recovery-control", NEW_TESTS)
            result["relatedScope"] = tests("affected-native-continuation", RELATED)
        elif args.mode == "mutations":
            mutations = [
                ("sqlite-original-configuration", "src/session/sessionResume.ts", "assertSessionContinuationConfiguration(current, params);", "/* mutation: omit SQLite configuration gate */", NEW_TESTS[:1], "changed .* refuses"),
                ("parent-stop", "src/session/sessionContinuationControls.ts", 'if (cause?.kind === "parent" || cause?.kind === "hook")', 'if (false)', NEW_TESTS[:1], "stopped sessions|requested parent stop"),
                ("delegated-controller", "src/session/sessionContinuationControls.ts", "else if (value.childSessionId === sessionId)", "else if (false)", NEW_TESTS[:1], "delegated child"),
                ("unresolved-child", "src/session/sessionContinuationControls.ts", "if (!child || child.ended_ts === null)", "if (false)", NEW_TESTS[:1], "unresolved child"),
                ("actual-close-observation", "dist/sdk/nativeAgentClient.js", "get processClosed() { return this.closed; }", "get processClosed() { return true; }", NEW_TESTS[1:], "SDK observes"),
                ("same-studio-reconciliation", "dist/studio/nativeTaskService.js", "function reconcileClosedClient(entry) {", "function reconcileClosedClient(entry) { return;", NEW_TESTS[1:], "same Studio explicitly")]
            for name, target, original, replacement, files, pattern in mutations:
                path = source / target; before = path.read_bytes(); text = before.decode()
                if text.count(original) != 1: raise RuntimeError(f"Mutation target must be unique: {target} / {name}")
                item = {"name": name, "target": target, "beforeSha256": sha(path), "restored": False}; result["mutations"].append(item)
                try:
                    path.write_text(text.replace(original, replacement)); item["mutantSha256"] = sha(path)
                    item["testSummary"] = tests(f"mutation-{name}", files, pattern, True); item["detected"] = True
                finally:
                    path.write_bytes(before); item["restoredSha256"] = sha(path); item["restored"] = item["restoredSha256"] == item["beforeSha256"]
                    save("mutation-restored")
            result["restoredScope"] = tests("restored-native-recovery-control", NEW_TESTS)
            run("restored-source-clean", ["git", "diff", "--exit-code"])
        else:
            artifacts = root / "artifacts"; artifacts.mkdir()
            packed, _ = run("pack-local-artifact", ["npm", "pack", "--ignore-scripts", "--json", "--pack-destination", str(artifacts)])
            package = artifacts / json.loads(packed)[0]["filename"]
            result["package"] = {"path": str(package), "sha256": sha(package), "prepackOrReleaseQualified": False}
            consumer = root / "consumer"; consumer.mkdir()
            playwright_version = json.loads((source / "node_modules/@playwright/test/package.json").read_text())["version"]
            write(consumer / "package.json", {"name": "private-amc-native-recovery-consumer", "private": True, "type": "module",
                "dependencies": {"agent-maturity-compass": f"file:{package}", "@playwright/test": playwright_version}})
            helper = EVIDENCE / "installed-case.mjs"; result["installedHelperSha256"] = sha(helper)
            shutil.copyfile(helper, consumer / "installed-case.mjs")
            run("consumer-install", ["pnpm", "install"], consumer, timeout=900)
            run("consumer-frozen-lock", ["pnpm", "install", "--frozen-lockfile"], consumer)
            run("installed-native-cookie-browser-controls", ["node", "installed-case.mjs", str(root / "installed-fixtures")], consumer)
            installed = json.loads((root / "installed-fixtures/receipt.json").read_text())
            if not installed.get("ok") or not installed.get("allObservedWritersClosed") or not installed.get("browserClosed") or not installed.get("serverClosed"):
                raise RuntimeError("Installed receipt did not qualify and close all observed resources")
            result["installedReceipt"] = str(root / "installed-fixtures/receipt.json")
            for target in ["sdk/nativeAgentClient.js", "session/sessionResume.js", "session/sessionContinuationControls.js", "session/jsonlContinuation.js", "studio/nativeTaskService.js"]:
                a = source / "dist" / target; b = consumer / "node_modules/agent-maturity-compass/dist" / target
                if sha(a) != sha(b): raise RuntimeError(f"Installed runtime bytes differ from fresh built candidate: {target}")
            result["installedOwnedRuntimeMatchesBuild"] = True
        result["qualified"] = True
    except Exception as error:
        result["failure"] = str(error); print(json.dumps({"failure": str(error)}), flush=True)
    finally:
        if active is not None:
            close_group(active.pid)
            try: active.wait(timeout=5)
            except subprocess.TimeoutExpired: pass
        result["endedAt"] = now().isoformat()
        result["allOwnedCommandGroupsClosed"] = all(row.get("groupClosed") for row in result["commands"])
        save("acceptance-ended" if result["qualified"] else "acceptance-stopped-at-failure")
        print(json.dumps({"qualified": result["qualified"], "receipt": str(receipts / "receipt.json"), "allOwnedCommandGroupsClosed": result["allOwnedCommandGroupsClosed"]}), flush=True)
    return 0 if result["qualified"] else 1

if __name__ == "__main__": raise SystemExit(main())
