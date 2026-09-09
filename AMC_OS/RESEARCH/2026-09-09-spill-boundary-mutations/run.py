#!/usr/bin/env python3
"""Author-only preparation: six retained-output SOURCE boundary mutations.

Execution requires a separate explicit opt-in, clean pinned source, existing
Node/pnpm/Git tools and an independently reviewed, SHA-256-pinned supervisor.
No result produced here is a killed-mutant, package, platform or release claim.
"""
from __future__ import annotations

import argparse
from collections import Counter
import datetime
import difflib
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import signal
import stat
import sys
import time
import types

AUTHORING_BASE = "a5987643ef6c26b01f687226fbc6a6709fc182cb"
SHARED_ROOT = Path("/Users/sid/AgentMaturityCompass")
OPERATOR = "src/cli-spill-commands.ts"
READER = "src/session/spill/spillRead.ts"
OP_TEST = "tests/cliSpillCommands.test.ts"
READ_TEST = "tests/sessionSpillRead.test.ts"
TEST_FILES = [OP_TEST, READ_TEST]
READ_GROUP = "authenticated bounded retained-output reading"
ERASE_GROUP = "reviewed exact-scope erasure"
MAX_TEXT_BYTES = 32 * 1024 * 1024
MAX_HASH_BYTES = 512 * 1024 * 1024
RED = "named-assertion-red-review-required"
BOUNDARY = ("Focused source regressions using synthetic local fixtures only; "
            "not installed CLI, full suite, platform matrix, human/provider, "
            "whole-history, deployment or issue-completion acceptance")


def case(file, group, title, assertion, marker=None):
    return dict(file=file, fullName=group + " " + title,
                sourceMarker=marker or 'it("' + title + '"',
                assertionAnchor=assertion)


def mutation(name, path, old, new, cases, boundary):
    return dict(name=name, path=path, originalAnchor=old, replacement=new,
                cases=cases, boundary=boundary)


MUTATIONS = [
    mutation("operator-backend-conflict-admission", OPERATOR,
        '  if (pinned && requested && pinned !== requested) {',
        '  if (false && pinned && requested && pinned !== requested) {',
        [case(OP_TEST, f"native spill commands over {backend} history",
              "refuses a conflicting explicit backend before opening the unrelated store",
              '    expect(result.report.error?.code).toBe("backend-mismatch");')
         for backend in ("sqlite", "jsonl")],
        "Remove explicit conflict refusal, not sticky selection: the pinned backend "
        "still wins. This targets operator admission/diagnostics, not a demonstrated "
        "read from an unrelated store or independent backend cryptography."),
    mutation("operator-authenticate-stripped-spill-rows", OPERATOR,
        '      if (runtime.evidence.spillLifecycleEventAuthenticityError(workspace, event, options) !== null) {',
        '      if (false && runtime.evidence.spillLifecycleEventAuthenticityError(workspace, event, options) !== null) {',
        [case(OP_TEST, "read-only admission and honest failures",
              "authenticates rows even when tampering removes the spill key",
              '    expect(result.report.error?.code).toBe("history-row-unauthentic");')],
        "Remove operator all-row admission. The selected JSONL fixture strips the "
        "spill key without resigning; downstream reference inventory deliberately "
        "skips non-spill declarations. Shared hash/signature validators stay intact."),
    mutation("operator-plan-requires-all-origins", OPERATOR,
        '    if (!entry.eventIds.every(selected)) refuse("outside-scope-reference",',
        '    if (false && !entry.eventIds.every(selected)) refuse("outside-scope-reference",',
        [case(OP_TEST, ERASE_GROUP,
              "refuses unknown IDs and incomplete commitment/result pairs without native erase or audit writes",
              '    expect(pair.report.error).toMatchObject({ code: "outside-scope-reference", outsideScopeEventIds: [fixture.commitment.id] });')],
        "Read-only review must reject result-only scope. Native erasure retains its "
        "own all-origins guard; this does NOT establish an out-of-scope unlink."),
    mutation("operator-apply-requires-fresh-plan", OPERATOR,
        '      if (plan.planSha256 !== flags.expectPlan) {',
        '      if (false && plan.planSha256 !== flags.expectPlan) {',
        [case(OP_TEST, ERASE_GROUP,
              f"refuses stale review after a {change} change before native erase",
              '    expect(result.report.error?.code).toBe("stale-plan");',
              '("refuses stale review after a %s change before native erase"')
         for change in ("reason", "scope", "history", "new-reference", "missing-object")],
        "Remove one fresh-plan comparison, keeping plan construction and native "
        "scope/authentication/audit controls. Parameter instances exercise one "
        "cohesive binding, not five independent protections or a concurrency lock."),
    mutation("reader-must-propagate-object-refusal", READER,
        '  const full = retrieveSpilledContent(input.workspace, event, options);',
        '  const full = (() => {\n'
        '    try { return retrieveSpilledContent(input.workspace, event, options); }\n'
        '    catch { return Buffer.alloc(entry.ref.bytes); } // Mutant-only unverified fallback.\n'
        '  })();',
        [case(READ_TEST, READ_GROUP,
              "refuses a modification outside the requested range instead of verifying only the page",
              '    expect(() => readSessionSpillRange({ workspace, events: f.events, locator: f.locator, offset: 0, limit: 1 })).toThrow(/tampered|commitment/);')],
        "Swallow authenticated-object retrieval refusal at the reader seam, returning "
        "mutant-only zero bytes. The real fixture corrupts ciphertext outside the "
        "page. This is fail-open refusal propagation, NOT independent evidence for "
        "encoded hash, GCM, AAD or either overlapping plaintext-hash check."),
    mutation("reader-must-not-disclose-beyond-page", READER,
        '      contentBase64: full.subarray(offset, end).toString("base64"),',
        '      contentBase64: full.toString("base64"),',
        [case(READ_TEST, READ_GROUP,
              f"reads exact byte ranges and both origins from {backend} without rewriting the object or backend",
              '    expect(Buffer.from(result.contentBase64, "base64")).toEqual(FULL.subarray(offset, offset + limit));',
              '("reads exact byte ranges and both origins from %s without rewriting the object or backend"')
         for backend in ("sqlite", "jsonl")],
        "Disclose the full authenticated object instead of the requested slice while "
        "keeping numeric bounds and metadata unchanged. Range/privacy is ONE "
        "over-disclosure boundary; terminal escaping and zeroization are not mutated."),
]

OMITTED = [
    "Individual ciphertext hash, GCM/tag, AAD/framing, plaintext hashes and key-history controls; overlapping refusals are not independent proof.",
    "Other marker/link/backend cases, monitor pin substitution, duplicate/conflicting references and full chain/seal verification.",
    "Independent numeric-limit/EOF guards, terminal escaping, memory zeroization, legacy reads, unavailable keys and cross-user authorization.",
    "Native unlink all-origin enforcement, audit order/failure/payload bounds, retention, transport/backup/remote erasure and DSAR completion.",
    "Filesystem races, malicious same-UID processes, unobserved daemon escape, OS/network containment, SIGKILL recovery and host-wide cleanup.",
    "Installed CLI wiring, public package exports, full suite/release gate, platform matrix, human/provider study, deployment and superiority.",
]


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_bytes(path, data):
    """Only new receipt files. Never truncate an earlier attempt."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode())


def file_identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def read_bytes(path, maximum=MAX_TEXT_BYTES, single_link=False, stable=True):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as handle:
        before = os.fstat(handle.fileno())
        if (not stat.S_ISREG(before.st_mode) or before.st_size > maximum
                or (single_link and before.st_nlink != 1)):
            raise RuntimeError(f"Not a bounded regular file: {path}")
        data = handle.read(min(before.st_size, maximum) + 1)
        after, named = os.fstat(handle.fileno()), path.lstat()
        if stable and (file_identity(before) != file_identity(after)
                       or file_identity(after) != file_identity(named)
                       or stat.S_ISLNK(named.st_mode) or len(data) != before.st_size):
            raise RuntimeError(f"File changed during read: {path}")
        return data


def hash_file(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as handle:
        before = os.fstat(handle.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_HASH_BYTES:
            raise RuntimeError(f"File exceeds regular-file hash bound: {path}")
        digest, remaining = hashlib.sha256(), before.st_size
        while remaining:
            block = handle.read(min(1024 * 1024, remaining))
            if not block:
                raise RuntimeError(f"Truncated hash input: {path}")
            digest.update(block)
            remaining -= len(block)
        if (file_identity(before) != file_identity(os.fstat(handle.fileno()))
                or file_identity(before) != file_identity(path.lstat())):
            raise RuntimeError(f"Unstable hash input: {path}")
        return digest.hexdigest()


def overlaps(left, right):
    return left == right or left in right.parents or right in left.parents


def absolute_path(value):
    if (not value.is_absolute() or ".." in value.parts
            or any(ord(char) < 32 or ord(char) == 127 for char in str(value))):
        raise RuntimeError(f"Absolute path without traversal/control characters required: {value}")
    return value


def trusted_existing(value, directory=False, executable=False):
    path = absolute_path(value).resolve(strict=True)
    info = path.lstat()
    valid_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not valid_type or info.st_uid not in (0, os.getuid())
            or info.st_mode & 0o022 or (executable and not os.access(path, os.X_OK))):
        raise RuntimeError(f"Unsafe or unavailable {'directory' if directory else 'tool/file'}: {path}")
    return path


def owned_source(clone, relative):
    path = clone / relative
    if path.resolve(strict=True) != path or clone not in path.parents:
        raise RuntimeError(f"Source path is linked or escaped: {relative}")
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or info.st_uid != os.getuid() or info.st_mode & 0o022):
        raise RuntimeError(f"Source is not an independent operator-owned file: {relative}")
    return path


def replace_source(clone, relative, expected, replacement):
    """Only the current owned bytes may be changed; interrupted writes fail closed."""
    path = owned_source(clone, relative)
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "r+b") as handle:
        before = os.fstat(handle.fileno())
        if file_identity(before) != file_identity(path.lstat()) or handle.read(len(expected) + 1) != expected:
            raise RuntimeError(f"Unexpected source bytes/identity preserved: {relative}")
        handle.seek(0)
        handle.write(replacement)
        handle.truncate()
        handle.flush()
        os.fsync(handle.fileno())
    if read_bytes(path, single_link=True) != replacement:
        raise RuntimeError(f"Source write could not be verified: {relative}")


class Runner:
    """All subprocesses use the supplied supervisor, including Git metadata.

    Its weaker metadata() helper and release-gate main() are never called.
    Any unconfirmed closure latches a prohibition on every subsequent launch.
    """
    def __init__(self, out, env, supervisor, seconds):
        self.out, self.env, self.supervisor = out, env, supervisor
        self.deadline = time.monotonic() + seconds
        self.commands = []
        self.blocked = None

    def command(self, label, argv, cwd, timeout, report=False):
        if self.blocked or self.supervisor.requested_signal is not None:
            raise RuntimeError("Further commands refused after unconfirmed closure or interruption")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Overall work deadline exhausted; no new command permitted")
        folder = self.out / f"{len(self.commands) + 1:03d}-{label}"
        folder.mkdir(mode=0o700)
        args = [str(arg) for arg in argv]
        if report:
            args.append("--outputFile=" + str(folder / "vitest.json"))
        record = dict(label=label, directory=str(folder), argv=args, cwd=str(cwd),
                      startedAt=utc(), timeoutSeconds=min(timeout, remaining), process=None)
        self.commands.append(record)
        write_json(folder / "invocation.json", record)
        state = dict(commands=[], active=None)
        saves = 0

        def save():
            nonlocal saves
            saves += 1
            write_json(folder / f"supervisor-state-{saves:03d}.json", state)

        self.supervisor.RECORD = folder
        try:
            self.supervisor.supervised("command", args, str(cwd), self.env,
                                       record["timeoutSeconds"], state, save)
        except BaseException as exc:
            record["supervisorError"] = f"{type(exc).__name__}: {exc}"
        finally:
            if state["commands"]:
                record["process"] = state["commands"][-1]
            if not closure_confirmed(record):
                self.blocked = dict(label=label, directory=str(folder),
                                    reason="No final confirmed observed-owned-process closure")
            record["endedAt"] = utc()
            record["outputBoundary"] = ("Observed snapshot; child output may still change"
                                        if self.blocked else "Observed owned processes closed before parsing")
            write_json(folder / "call-result.json", record)
        return record, folder

    def checked(self, label, argv, cwd, timeout=30):
        record, folder = self.command(label, argv, cwd, timeout)
        if not process_healthy(record) or record["process"].get("exitCode") != 0:
            raise RuntimeError(f"Command failed or closure unconfirmed; inspect {folder}")
        return read_bytes(folder / "command.log")


def closure_confirmed(record):
    process = record.get("process")
    cleanup = process.get("cleanup") if isinstance(process, dict) else None
    return isinstance(cleanup, dict) and cleanup.get("confirmedClosed") is True


def process_healthy(record):
    process = record.get("process") or {}
    return (not record.get("supervisorError") and not process.get("error")
            and not process.get("timedOut") and not process.get("interrupted")
            and closure_confirmed(record))


def git_args(git, *args):
    return [git, "--no-optional-locks", "-c", "core.hooksPath=/dev/null",
            "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", *args]


def assert_clean(runner, git, path, source, label):
    head = runner.checked(label + "-head", git_args(git, "rev-parse", "HEAD"), path).decode().strip()
    status = runner.checked(label + "-status", git_args(git, "status", "--porcelain=v1",
                            "--untracked-files=all", "--ignore-submodules=none"), path)
    flags = runner.checked(label + "-flags", git_args(git, "ls-files", "-v"), path).decode().splitlines()
    if head != source or status.strip() or not flags or any(not line.startswith("H ") for line in flags):
        raise RuntimeError(f"Dirty/nonmatching source or hidden index flags: {path}; never reset/stash")


def resolve_cases(clone):
    for item in MUTATIONS:
        original = read_bytes(owned_source(clone, item["path"]), single_link=True)
        if original.count(item["originalAnchor"].encode()) != 1:
            raise RuntimeError("Missing/ambiguous production anchor: " + item["name"])
        for selected in item["cases"]:
            text = read_bytes(owned_source(clone, selected["file"]), single_link=True).decode()
            marker, assertion = selected["sourceMarker"], selected["assertionAnchor"]
            if text.count(marker) != 1 or text.count(assertion) != 1:
                raise RuntimeError("Missing/ambiguous test or assertion anchor: " + selected["fullName"])
            start, location = text.index(marker), text.index(assertion)
            end = text.find("\n  it", start + len(marker))
            if location <= start or (end >= 0 and location >= end):
                raise RuntimeError("Expected assertion is outside its named test: " + selected["fullName"])
            selected["assertionLine"] = text.count("\n", 0, location) + 1
            selected["testSourceSha256"] = sha(text.encode())


def json_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON key: " + key)
        value[key] = item
    return value


def parse_report(record, folder, clone, files):
    result = dict(command=record, reportError=None, healthErrors=[], counts={},
                  success=None, suites=[], assertions=[], unhandledErrors=[])
    try:
        raw = read_bytes(folder / "vitest.json", stable=not bool(record.get("outputBoundary", "").startswith("Observed snapshot")))
        write_bytes(folder / "vitest-observed.json", raw)
        parsed = json.loads(raw, object_pairs_hook=json_object)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("testResults"), list):
            raise ValueError("Unsupported Vitest report shape")
        result["success"] = parsed.get("success")
        result["counts"] = {key: value for key, value in parsed.items() if key.startswith("num")}
        result["unhandledErrors"] = parsed.get("unhandledErrors", [])
        if result["unhandledErrors"] or parsed.get("testExecError") or parsed.get("errors"):
            result["healthErrors"].append("Unhandled/report-level execution error")
        seen_files = []
        for suite in parsed["testResults"]:
            if (not isinstance(suite, dict) or not isinstance(suite.get("name"), str)
                    or not isinstance(suite.get("assertionResults"), list)):
                raise ValueError("Unsupported Vitest suite shape")
            name = Path(suite["name"])
            resolved = name if name.is_absolute() else clone / name
            relative = str(resolved.relative_to(clone))
            if relative not in files:
                raise ValueError("Unexpected test file in report: " + relative)
            seen_files.append(relative)
            result["suites"].append(dict(file=relative, status=suite.get("status"), message=suite.get("message")))
            if (suite.get("message") or suite.get("testExecError")
                    or suite.get("status") not in ("passed", "failed")):
                result["healthErrors"].append("Suite/setup/import/compiler error or unsupported status")
            for assertion in suite["assertionResults"]:
                if (not isinstance(assertion, dict) or not isinstance(assertion.get("fullName"), str)
                        or assertion.get("status") not in ("passed", "failed", "pending", "skipped", "todo", "disabled")
                        or not isinstance(assertion.get("failureMessages", []), list)
                        or any(not isinstance(message, str) for message in assertion.get("failureMessages", []))):
                    raise ValueError("Unsupported assertion shape")
                result["assertions"].append({**assertion, "file": relative})
        if Counter(seen_files) != Counter(files):
            raise ValueError("Missing or duplicated test-file report")
        assertions, counts = result["assertions"], result["counts"]
        observed = Counter(item["status"] for item in assertions)
        required = dict(numTotalTests=len(assertions), numPassedTests=observed["passed"],
                        numFailedTests=observed["failed"])
        for key, expected in required.items():
            if type(counts.get(key)) is not int or counts[key] != expected:
                raise ValueError("Vitest count/assertion disagreement: " + key)
        if counts.get("numRuntimeErrorTestSuites", 0) != 0:
            result["healthErrors"].append("Runtime-error test suites")
        identities = Counter((item["file"], item["fullName"]) for item in assertions)
        if not assertions:
            raise ValueError("Empty named assertions")
        # Existing malformed-options it.each rows intentionally repeat titles.
        # Preserve those observations; only selected mutation identities must
        # occur exactly once (enforced against baseline and each selected run).
        result["repeatedNames"] = [dict(file=file, fullName=name, count=count)
                                   for (file, name), count in identities.items() if count > 1]
        if any(item.get("failureMessages") for item in assertions if item["status"] != "failed"):
            result["healthErrors"].append("Failure messages on nonfailed assertion")
    except (OSError, ValueError, TypeError, RuntimeError) as exc:
        result["reportError"] = f"{type(exc).__name__}: {exc}"
    write_json(folder / "parsed.json", result)
    return result


def active_assertions(result):
    return [item for item in result["assertions"] if item["status"] in ("passed", "failed")]


def report_healthy(result):
    return (process_healthy(result["command"]) and result["reportError"] is None
            and not result["healthErrors"] and not result["unhandledErrors"])


def green(result, cases=None):
    active = active_assertions(result)
    actual = Counter((item["file"], item["fullName"]) for item in active)
    intended = Counter((item["file"], item["fullName"]) for item in cases) if cases is not None else actual
    return (report_healthy(result) and result["command"]["process"].get("exitCode") == 0
            and result["success"] is True and bool(active) and actual == intended
            and all(item["status"] == "passed" for item in active)
            and (cases is not None or len(active) == len(result["assertions"]))
            and result["counts"].get("numFailedTests") == 0)


def classify(result, cases):
    """Never infer causality from exit status or merely from a failing test title."""
    active = active_assertions(result)
    per_case = [{"file": item["file"], "fullName": item["fullName"], "observedStatus": item["status"]}
                for item in active]
    expected = {(item["file"], item["fullName"]): item for item in cases}
    actual = Counter((item["file"], item["fullName"]) for item in active)
    if not report_healthy(result) or actual != Counter(expected.keys()):
        return "inconclusive-process-report-or-selection", per_case
    if green(result, cases):
        return "survived", per_case
    if (result["command"]["process"].get("exitCode") != 1 or result["success"] is not False
            or any(item["status"] != "failed" for item in active)):
        return "inconclusive-exit-or-mixed-results", per_case
    for item in active:
        selected = expected[(item["file"], item["fullName"])]
        messages = item.get("failureMessages", [])
        if not messages:
            return "inconclusive-nonassertion-failure", per_case
        for message in messages:
            locations = re.findall(re.escape(selected["file"]) + r":(\d+):\d+", message)
            if ("AssertionError" not in message
                    or str(selected["assertionLine"]) not in locations):
                return "inconclusive-nonassertion-or-unintended-assertion", per_case
    return RED, per_case


def test_run(runner, clone, node, label, files, cases, timeout):
    args = [node, clone / "node_modules/vitest/vitest.mjs", "run", *files,
            "--maxWorkers=1", "--no-file-parallelism", "--reporter=json"]
    if cases is not None:
        # Escape JavaScript regex metacharacters, not Python-specific escapes.
        escape = lambda text: re.sub(r"([.*+?^${}()|\[\]\\])", r"\\\1", text)
        args.extend(["--testNamePattern", "^(?:" + "|".join(escape(item["fullName"]) for item in cases) + ")$"])
    record, folder = runner.command(label, args, clone, timeout, report=True)
    result = parse_report(record, folder, clone, files)
    if runner.blocked:
        log = folder / "command.log"
        try:
            write_bytes(folder / "command-observed.log", read_bytes(log, stable=False))
        except (OSError, RuntimeError) as exc:
            write_json(folder / "log-snapshot-error.json", dict(error=str(exc)))
        raise RuntimeError("Process closure unconfirmed; parsed observation retained, all later launches/restoration refused")
    return result, folder


def isolated_environment(out, node, pnpm):
    for name in ("home", "tmp", "cache", "store", "bin", "empty-template"):
        (out / name).mkdir(mode=0o700)
    home = out / "home"
    for name in (".config", ".cache", ".local", ".state", ".npm"):
        (home / name).mkdir(mode=0o700)
    for name in (".npmrc", ".npmrc-global"):
        write_bytes(home / name, b"")
    (out / "bin/node").symlink_to(node)
    launcher = out / "bin/pnpm"
    write_bytes(launcher, ("#!/bin/sh\nexec " + shlex.quote(str(node)) + " "
                           + shlex.quote(str(pnpm)) + ' "$@"\n').encode())
    launcher.chmod(0o700)
    return {"PATH": f"{out / 'bin'}:/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(home),
            "TMPDIR": str(out / "tmp"), "TMP": str(out / "tmp"), "TEMP": str(out / "tmp"),
            "XDG_CONFIG_HOME": str(home / ".config"), "XDG_CACHE_HOME": str(home / ".cache"),
            "XDG_DATA_HOME": str(home / ".local"), "XDG_STATE_HOME": str(home / ".state"),
            "npm_config_userconfig": str(home / ".npmrc"), "npm_config_globalconfig": str(home / ".npmrc-global"),
            "npm_config_cache": str(home / ".npm"), "npm_config_global": "false",
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_OPTIONAL_LOCKS": "0",
            "GIT_TERMINAL_PROMPT": "0", "CI": "1", "NO_COLOR": "1", "LC_ALL": "C", "TZ": "UTC"}


def load_supervisor(path, content):
    # Execute the EXACT hash-checked snapshot as a module, without importlib's
    # bytecode cache writes to the supplied directory. Never call its main().
    module = types.ModuleType("_amc_reviewed_boundary_supervisor")
    module.__file__ = str(path)
    exec(compile(content, str(path), "exec"), module.__dict__)
    if (not callable(getattr(module, "supervised", None))
            or not callable(getattr(module, "interrupted", None))
            or getattr(module, "requested_signal", "missing") is not None):
        raise RuntimeError("Supplied reviewed supervisor has an incompatible API")
    return module


def assert_hashes(clone, sources):
    for relative, expected in sources.items():
        if hash_file(owned_source(clone, relative)) != expected:
            raise RuntimeError("Pinned source changed: " + relative)


def execute_mutation(runner, args, clone, item, sources, receipts, summary):
    assert_hashes(clone, sources)
    original = read_bytes(owned_source(clone, item["path"]), single_link=True)
    anchor = item["originalAnchor"].encode()
    if original.count(anchor) != 1:
        raise RuntimeError("Exact mutation anchor drift: " + item["name"])
    changed = original.replace(anchor, item["replacement"].encode(), 1)
    folder = receipts / ("mutation-" + item["name"])
    folder.mkdir(mode=0o700)
    write_bytes(folder / "original.source", original)
    write_bytes(folder / "mutated.source", changed)
    patch = "".join(difflib.unified_diff(original.decode().splitlines(True), changed.decode().splitlines(True),
                                       fromfile="a/" + item["path"], tofile="b/" + item["path"]))
    write_bytes(folder / "mutation.patch", patch.encode())
    row = dict(name=item["name"], path=item["path"], status="not-run", boundary=item["boundary"],
               originalSha256=sha(original), mutatedSha256=sha(changed), expectedCases=item["cases"],
               restored=False, restoredRegressionGreen=None, directory=str(folder))
    summary["mutations"].append(row)
    write_json(folder / "planned.json", row)
    application_started = False
    try:
        application_started = True
        replace_source(clone, item["path"], original, changed)
        row["status"] = "incomplete-mutant-run"
        result, result_folder = test_run(runner, clone, args.node, item["name"],
                                        sorted({case["file"] for case in item["cases"]}), item["cases"], args.test_timeout)
        row["mutantResult"] = str(result_folder / "parsed.json")
        row["status"], row["observedCases"] = classify(result, item["cases"])
    finally:
        try:
            if not application_started:
                row["restoration"] = "not-applied"
            elif runner.blocked:
                row["restoration"] = "deferred: processes may still use source; original backup retained"
            else:
                current = read_bytes(owned_source(clone, item["path"]), single_link=True)
                if current not in (original, changed):
                    raise RuntimeError("Unexpected/partial source bytes preserved; manual recovery required")
                if current != original:
                    replace_source(clone, item["path"], changed, original)
                row["restored"] = read_bytes(owned_source(clone, item["path"]), single_link=True) == original
                row["restoration"] = "original-bytes-restored" if row["restored"] else "failed"
        except BaseException as exc:
            row["restoration"] = f"unconfirmed: {type(exc).__name__}: {exc}"
        write_json(folder / "restoration.json", row)
    if not row["restored"]:
        raise RuntimeError("Restoration unconfirmed; no restored regression or later mutation permitted")
    # Even survivors and inconclusive assertion results get the SAME restored
    # regression. Never relabel their mutation classification after restoration.
    assert_hashes(clone, sources)
    restored, restored_folder = test_run(runner, clone, args.node, item["name"] + "-restored",
                                       sorted({case["file"] for case in item["cases"]}), item["cases"], args.test_timeout)
    row["restoredResult"] = str(restored_folder / "parsed.json")
    row["restoredRegressionGreen"] = green(restored, item["cases"])
    assert_hashes(clone, sources)
    write_json(folder / "result.json", row)
    if not row["restoredRegressionGreen"]:
        raise RuntimeError("Restored regression failed; original classification/failure retained, later mutations refused")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("repository", "output", "node", "pnpm", "git", "supervisor"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--source", required=True, help="Exact lowercase 40-character source commit; repository HEAD must match")
    parser.add_argument("--supervisor-sha256", required=True, help="Independently reviewed local supervisor SHA-256")
    parser.add_argument("--execute", action="store_true", help="Explicitly authorize clone/install/synthetic source-mutation execution")
    parser.add_argument("--test-timeout", type=int, default=600)
    parser.add_argument("--install-timeout", type=int, default=1800)
    parser.add_argument("--total-timeout", type=int, default=14400)
    args = parser.parse_args()
    if (not args.execute or os.name != "posix" or sys.version_info < (3, 10)
            or not re.fullmatch(r"[a-f0-9]{40}", args.source)
            or not re.fullmatch(r"[a-f0-9]{64}", args.supervisor_sha256)):
        parser.error("Explicit --execute, POSIX/Python 3.10+, full source SHA and supervisor SHA-256 required")
    if not (0 < args.test_timeout <= 1200 and 0 < args.install_timeout <= 3600 and 0 < args.total_timeout <= 43200):
        parser.error("Positive bounded timeouts required: test<=1200, install<=3600, total<=43200 seconds")
    if not 1 <= len(MUTATIONS) <= 6:
        raise RuntimeError("Finite mutation bound exceeded")
    for name in ("node", "pnpm", "git", "supervisor"):
        setattr(args, name, trusted_existing(getattr(args, name), executable=name in ("node", "git")))
    args.repository = trusted_existing(args.repository, directory=True)
    absolute_path(args.output)
    parent = args.output.parent.resolve(strict=True)
    parent_info = parent.lstat()
    private_parent = parent_info.st_uid == os.getuid() and not parent_info.st_mode & 0o022
    system_scratch = parent_info.st_uid == 0 and bool(parent_info.st_mode & stat.S_ISVTX)
    if not stat.S_ISDIR(parent_info.st_mode) or not (private_parent or system_scratch):
        raise RuntimeError("Output parent must be operator-owned non-shared-write or root-owned sticky scratch")
    out = parent / args.output.name
    if os.path.lexists(out) or not out.name or any(os.path.lexists(path / ".git") for path in (parent, *parent.parents)):
        raise RuntimeError("Output must be new and outside every existing worktree")
    for forbidden in (args.repository, SHARED_ROOT.resolve(), args.supervisor.parent, args.node.parent, args.pnpm.parent, args.git.parent):
        if overlaps(out, forbidden):
            raise RuntimeError("Output overlaps a source/workspace/tool input")
    supervisor_bytes = read_bytes(args.supervisor)
    if sha(supervisor_bytes) != args.supervisor_sha256:
        raise RuntimeError("Reviewed supervisor hash mismatch; no module loaded")
    os.umask(0o077)
    out.mkdir(mode=0o700)
    receipts = out / "receipts"
    receipts.mkdir(mode=0o700)
    clone = out / "clone"
    summary = dict(schemaVersion=1, source=args.source, authoringBase=AUTHORING_BASE,
                   repository=str(args.repository), clone=str(clone), output=str(out),
                   startedAt=utc(), status="incomplete", boundary=BOUNDARY, omitted=OMITTED,
                   mutations=[], baselineGreen=None, finalSourceClean=None,
                   host=dict(os=platform.system(), release=platform.release(), arch=platform.machine(), python=sys.version),
                   supervisor=dict(path=str(args.supervisor), sha256=args.supervisor_sha256))
    runner, supervisor = None, None
    previous_signals = {}
    try:
        helper = read_bytes(Path(__file__).resolve())
        write_bytes(receipts / "executed-helper.py", helper)
        write_bytes(receipts / "reviewed-supervisor.py", supervisor_bytes)
        summary["helperSha256"] = sha(helper)
        write_json(receipts / "requested-run.json", summary)
        env = isolated_environment(out, args.node, args.pnpm)
        summary["childEnvironment"] = env  # Allowlist only; never copy os.environ.
        supervisor = load_supervisor(args.supervisor, supervisor_bytes)
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous_signals[signum] = signal.signal(signum, supervisor.interrupted)
        runner = Runner(receipts, env, supervisor, args.total_timeout)
        # Reject input dirtiness and source mismatch BEFORE clone/install; no reset,
        # checkout, optional index lock or stash action touches the input repository.
        top = runner.checked("source-toplevel", git_args(args.git, "rev-parse", "--show-toplevel"), args.repository).decode().strip()
        if Path(top).resolve() != args.repository:
            raise RuntimeError("--repository must be the existing checkout root")
        assert_clean(runner, args.git, args.repository, args.source, "source")
        resolved = runner.checked("source-commit", git_args(args.git, "rev-parse", args.source + "^{commit}"), args.repository).decode().strip()
        if resolved != args.source:
            raise RuntimeError("Requested commit is not an exact commit object")
        trees = runner.checked("registered-worktrees", git_args(args.git, "worktree", "list", "--porcelain"), args.repository).decode()
        for line in trees.splitlines():
            if line.startswith("worktree "):
                if overlaps(out, Path(line[len("worktree "):]).resolve()):
                    raise RuntimeError("Output overlaps a registered worktree")
        common = runner.checked("source-common-dir", git_args(args.git, "rev-parse", "--git-common-dir"), args.repository).decode().strip()
        if overlaps(out, (args.repository / common).resolve()):
            raise RuntimeError("Output overlaps source Git storage")
        runtime = runner.checked("node-version", [args.node, "-p", "JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,versions:process.versions})"], out)
        summary["runtime"] = json.loads(runtime)
        if not re.fullmatch(r"v22\.\d+\.\d+", summary["runtime"].get("node", "")):
            raise RuntimeError("Existing Node 22 release required; no runtime download attempted")
        summary["tools"] = {name: dict(path=str(getattr(args, name)), sha256=hash_file(getattr(args, name)))
                            for name in ("node", "pnpm", "git")}
        runner.checked("clone", git_args(args.git, "-c", "protocol.allow=never", "-c", "protocol.file.allow=always",
                       "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--template=" + str(out / "empty-template"),
                       "--", args.repository, clone), out, 300)
        if (not (clone / ".git").is_dir() or (clone / ".git").is_symlink()
                or os.path.lexists(clone / ".git/objects/info/alternates")):
            raise RuntimeError("Refuse linked/shared Git storage")
        runner.checked("checkout", git_args(args.git, "checkout", "--detach", args.source), clone, 120)
        assert_clean(runner, args.git, clone, args.source, "clone")
        stages = runner.checked("tracked-modes", git_args(args.git, "ls-files", "--stage"), clone).decode().splitlines()
        if any(line.startswith("160000 ") for line in stages):
            raise RuntimeError("Submodule sources are outside this helper's frozen-install contract")
        paths = sorted(set(TEST_FILES + [OPERATOR, READER, "src/cli-session-spill-read-command.ts",
                           "src/session/spill/spillEvidence.ts", "src/session/spill/spillLifecycle.ts",
                           "src/session/spill/spillStore.ts", "src/session/spill/spillEncryption.ts",
                           "src/persistence/openSessionEventStore.ts", "src/persistence/sessionStoreVerification.ts",
                           "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "vitest.config.ts"]))
        sources = {}
        for number, relative in enumerate(paths):
            local = read_bytes(owned_source(clone, relative), single_link=True)
            pinned = runner.checked(f"pinned-file-{number:02d}", git_args(args.git, "show", args.source + ":" + relative), clone)
            if local != pinned:
                raise RuntimeError("Source bytes differ from commit: " + relative)
            sources[relative] = sha(local)
        summary["sourceFiles"] = sources
        resolve_cases(clone)
        write_json(receipts / "mutation-map.json", MUTATIONS)
        manager = json.loads(read_bytes(clone / "package.json")).get("packageManager", "")
        wanted = re.fullmatch(r"pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\..+)?", manager)
        version = runner.checked("pnpm-version", [args.node, args.pnpm, "--version"], clone).decode().strip()
        if not wanted or version != wanted.group(1):
            raise RuntimeError("Explicit pnpm entry must match candidate packageManager exactly")
        summary["tools"]["pnpm"]["version"] = version
        if os.path.lexists(clone / "node_modules"):
            raise RuntimeError("Fresh clone contains a preexisting install root; no install attempted")
        runner.checked("frozen-install", [args.node, args.pnpm, "install", "--frozen-lockfile", "--store-dir", out / "store"], clone, args.install_timeout)
        assert_clean(runner, args.git, clone, args.source, "installed")
        assert_hashes(clone, sources)
        entry = (clone / "node_modules/vitest/vitest.mjs").resolve(strict=True)
        if clone not in entry.parents:
            raise RuntimeError("Vitest entry escaped the private installation")
        summary["vitestEntrySha256"] = hash_file(entry)
        summary["installBoundary"] = "New clone, initially empty private pnpm store, exact pnpm version, frozen lockfile; permitted lifecycle scripts logged, not a package acceptance"
        baseline, folder = test_run(runner, clone, args.node, "baseline", TEST_FILES, None, args.test_timeout)
        summary["baseline"] = str(folder / "parsed.json")
        summary["baselineGreen"] = green(baseline)
        if not summary["baselineGreen"]:
            raise RuntimeError("Unmodified two-file baseline is not wholly green; no mutation applied")
        passed = Counter((item["file"], item["fullName"]) for item in active_assertions(baseline))
        for item in MUTATIONS:
            if any(passed[(selected["file"], selected["fullName"])] != 1 for selected in item["cases"]):
                raise RuntimeError("Expected mutation regression missing/ambiguous in baseline")
        assert_clean(runner, args.git, clone, args.source, "baseline")
        for item in MUTATIONS:
            execute_mutation(runner, args, clone, item, sources, receipts, summary)
            assert_clean(runner, args.git, clone, args.source, item["name"] + "-clean")
        assert_hashes(clone, sources)
        summary["finalSourceClean"] = True
        summary["status"] = ("source-mutations-awaiting-causal-review"
                             if all(row["status"] == RED and row["restoredRegressionGreen"] is True
                                    for row in summary["mutations"]) else "not-qualified")
    except BaseException as exc:
        summary["error"] = f"{type(exc).__name__}: {exc}"
        summary["status"] = "incomplete"
    finally:
        summary["endedAt"] = utc()
        summary["commands"] = runner.commands if runner else []
        summary["processClosure"] = dict(
            allObservedCommandsClosed=(all(closure_confirmed(row) for row in runner.commands)
                                       if runner and runner.commands else None),
            blocked=runner.blocked if runner else None,
            boundary="Reviewed supervisor's observed-owned identities/groups only; not whole-host or kernel containment")
        if runner and runner.blocked:
            summary["status"] = "closure-unconfirmed"
            summary["finalSourceClean"] = None
        summary["signal"] = supervisor.requested_signal if supervisor else None
        if summary["signal"] is not None and summary["status"] != "closure-unconfirmed":
            summary["status"] = "interrupted"
        summary["retainedArtifacts"] = "Private clone/store/HOME/tmp and every receipt retained. Fixture leftovers are not a claim of successful fixture cleanup. No automatic deletion or retry."
        write_json(receipts / "summary.json", summary)
        manifest = dict(source=args.source, files={}, errors=[],
                        boundary="Observed hashes; active child outputs may change" if runner and runner.blocked else "Hashes after observed-owned command closure")
        for path in sorted(receipts.rglob("*")):
            if path.is_symlink():
                manifest["errors"].append("Refused receipt symlink: " + str(path))
            elif path.is_file():
                try:
                    manifest["files"][str(path.relative_to(out))] = hash_file(path)
                except (OSError, RuntimeError) as exc:
                    manifest["errors"].append(f"{path}: {exc}")
        write_json(out / "receipt-manifest.json", manifest)
        for signum, handler in previous_signals.items():
            signal.signal(signum, handler)
    print(json.dumps(dict(status=summary["status"], summary=str(receipts / "summary.json"))))
    return 0 if summary["status"] == "source-mutations-awaiting-causal-review" and not manifest["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
