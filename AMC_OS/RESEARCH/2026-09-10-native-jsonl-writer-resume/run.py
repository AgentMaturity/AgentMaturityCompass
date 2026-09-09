#!/usr/bin/env python3
"""Finite, new-candidate source acceptance. Not the denied dirty-root dev run.

Only the named new clone and receipts are writable. Prior consumers, erasure
fixtures and helper repins are not accessed. This runner does not publish, deploy,
run release gates, start model workers, or change the shared source checkout.
"""
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import platform
import signal
import subprocess

REPOSITORY = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent


def now():
    return datetime.now(timezone.utc)


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--attempt", required=True)
    parser.add_argument("--browser-executable", help="Explicit existing Chromium executable; its version and hash are recorded, no download or fallback")
    args = parser.parse_args()
    if not args.attempt.isalnum() or len(args.attempt) > 24:
        parser.error("attempt must be an alphanumeric create-only name")
    if not 8 <= len(args.candidate) <= 40 or any(c not in "0123456789abcdef" for c in args.candidate):
        parser.error("candidate must be an explicit hexadecimal commit")
    root = REPOSITORY / "tmp/cos-native-jsonl-writer-resume-01" / args.attempt
    root.mkdir(parents=True, exist_ok=False)
    receipts = root / "receipts"
    receipts.mkdir()
    source = root / "source"
    env = {key: value for key, value in os.environ.items() if not key.startswith("AMC_")
           and key not in {"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NPM_TOKEN", "CHANGESETS_GITHUB_TOKEN"}}
    env.update(AMC_JSONL_RESUME_TEST_ROOT=str(root / "core-fixtures"),
               AMC_PUBLIC_TRANSPORT_RECEIPTS=str(root / "public-fixtures"),
               AMC_JSONL_RESUME_BROWSER="1")
    if args.browser_executable:
        browser = Path(args.browser_executable).resolve(strict=True)
        if not browser.is_file() or not os.access(browser, os.X_OK):
            raise ValueError("The explicit browser executable is not executable")
        env["AMC_TEST_BROWSER_EXECUTABLE"] = str(browser)
    receipt = {"taskId": "native-jsonl-writer-resume-batch", "candidateRequested": args.candidate,
               "attempt": args.attempt, "source": str(source), "startedAt": now().isoformat(),
               "environment": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
               "commands": [], "qualified": False, "ownedProcessGroups": [],
               "scope": "fresh pinned source; new JSONL recovery/core/public/real-browser scenarios only",
               "exclusions": ["installed package", "full suite", "release/prepack", "real provider/human",
                              "other platforms", "production keys", "publication/deployment", "old erasure/helper-repin lanes"]}
    active = None

    def status(action, child=None):
        instant = now()
        value = {"taskId": receipt["taskId"], "owner": "cos-native-jsonl-writer-resume-prime",
                 "sourceCandidate": receipt.get("sourceCommit", args.candidate), "state": action,
                 "updatedAt": instant.isoformat(), "timeoutReviewAt": (instant + timedelta(minutes=25)).isoformat(),
                 "nextAction": "Complete this finite new-candidate acceptance; retain failure or success and close owned processes.",
                 "activeOwnedExecution": child, "ownedProcessGroups": [child["pid"]] if child else [],
                 "workers": [], "receiptPaths": [str(receipts / "receipt.json")], "ownershipReleased": False,
                 "centralStatus": "Earlier central refresh was denied; this newly pinned attempt is separately owned and is not a rewrite of that request."}
        write(EVIDENCE / "ownership.json", value)
        write(receipts / "receipt.json", receipt)

    def run(name, command, cwd=REPOSITORY, timeout=600):
        nonlocal active
        log = receipts / (name + ".log")
        with log.open("w") as output:
            active = subprocess.Popen(command, cwd=cwd, env=env, stdout=output,
                                      stderr=subprocess.STDOUT, start_new_session=True)
            item = {"name": name, "command": command, "cwd": str(cwd), "pid": active.pid,
                    "startedAt": now().isoformat(), "log": str(log), "closed": False}
            receipt["commands"].append(item)
            receipt["ownedProcessGroups"] = [active.pid]
            status("new-candidate-acceptance-running", item)
            print(json.dumps({"started": name, "pid": active.pid, "log": str(log)}), flush=True)
            try:
                item["exitCode"] = active.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                item["timedOut"] = True
                os.killpg(active.pid, signal.SIGTERM)
                try:
                    active.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(active.pid, signal.SIGKILL)
                    active.wait(timeout=10)
                item["exitCode"] = active.returncode
            finally:
                item["closed"] = active.poll() is not None
                item["endedAt"] = now().isoformat()
                active = None
                receipt["ownedProcessGroups"] = []
                status("new-candidate-command-ended")
        print(json.dumps({"finished": name, "exitCode": item["exitCode"], "closed": item["closed"]}), flush=True)
        if item["exitCode"] != 0:
            raise RuntimeError(f"{name} failed; exact log retained: {log}")
        return log.read_text()

    try:
        status("new-candidate-acceptance-starting")
        run("clone", ["git", "clone", "--no-hardlinks", "--no-local", str(REPOSITORY), str(source)])
        run("pin", ["git", "checkout", "--detach", args.candidate], source)
        receipt["sourceCommit"] = run("pin-identity", ["git", "show", "-s", "--format=%H", "HEAD"], source).strip()
        if not receipt["sourceCommit"].startswith(args.candidate):
            raise RuntimeError("fresh clone commit did not match the requested candidate")
        receipt["environment"]["node"] = run("node", ["node", "--version"], source).strip()
        receipt["environment"]["pnpm"] = run("pnpm", ["pnpm", "--version"], source).strip()
        if args.browser_executable:
            import hashlib
            receipt["environment"]["browserExecutable"] = str(browser)
            receipt["environment"]["browserSha256"] = hashlib.sha256(browser.read_bytes()).hexdigest()
            receipt["environment"]["browserVersion"] = run("browser-version", [str(browser), "--version"], source).strip()
        run("fresh-install", ["pnpm", "install", "--frozen-lockfile", "--offline"], source, 900)
        run("vendor-build", ["pnpm", "run", "build:vendor"], source, 600)
        run("candidate-build", ["pnpm", "run", "build"], source, 600)
        run("new-jsonl-recovery-scope", ["pnpm", "exec", "vitest", "run", "tests/jsonlWriterResume.test.ts",
                                      "tests/nativeJsonlResumePublic.test.ts", "--maxWorkers=1", "--no-file-parallelism"], source, 600)
        receipt["qualified"] = True
    except Exception as error:
        receipt["failure"] = str(error)
        print(json.dumps({"failure": str(error)}), flush=True)
    finally:
        if active is not None and active.poll() is None:
            os.killpg(active.pid, signal.SIGTERM)
            try:
                active.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(active.pid, signal.SIGKILL)
                active.wait(timeout=10)
        receipt["endedAt"] = now().isoformat()
        receipt["allCommandLeadersClosed"] = all(row["closed"] for row in receipt["commands"])
        status("new-candidate-acceptance-ended")
    return 0 if receipt["qualified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
