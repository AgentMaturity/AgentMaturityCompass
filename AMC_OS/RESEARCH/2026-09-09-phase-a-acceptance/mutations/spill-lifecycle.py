#!/usr/bin/env python3
"""AUTHOR ONLY until the final batch: isolated, source-pinned spill mutations.

Never import this helper as a qualification result. Every run creates its own
clone, frozen installation and exclusive receipts. Assertion RED still requires
human review of causality; this is not a full-suite or release qualification.
"""
import argparse
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
import subprocess
import sys
import time

AUTHORING_BASE = "d9d55034b1e856513eea1c68b09e50ecd433063e"
SHARED_ROOT = Path("/Users/sid/AgentMaturityCompass").resolve()
SESSION = "tests/sessionSpillCommitment.test.ts"
EVIDENCE = "tests/sessionSpill.test.ts"
ENCRYPTION = "tests/spillEncryption.test.ts"
LIFECYCLE = "tests/spillLifecycle.test.ts"
RETENTION = "tests/retentionSpill.test.ts"
BUNDLE = "tests/bundleSpill.test.ts"
FILES = [SESSION, EVIDENCE, ENCRYPTION, LIFECYCLE, RETENTION, BUNDLE]
GROUPS = {
    SESSION: "signed spill commitment precedes encrypted persistence",
    EVIDENCE: "spill — oversized tool output leaves the ledger, its commitment does not",
    ENCRYPTION: "retained spill encryption and publication",
    RETENTION: "retention reaches committed spill objects without selecting active sessions",
    BUNDLE: "portable evidence bundles retain encrypted spill commitments and explicit gaps",
}


def case(file, title, group=None, marker=None):
    return {"file": file, "fullName": (group or GROUPS[file]) + " " + title,
            "sourceMarker": marker or 'it("' + title + '"'}


def edit(path, old, new):
    return {"path": path, "old": old, "new": new}


def mutant(name, edits, cases, boundary):
    return {"name": name, "edits": edits, "cases": cases, "boundary": boundary}


POLICY = "src/session/spill/spillPolicy.ts"
ENC = "src/session/spill/spillEncryption.ts"
LIFE = "src/session/spill/spillLifecycle.ts"
EVID = "src/session/spill/spillEvidence.ts"
RET = "src/ops/retention/retentionEngine.ts"
COMMIT = '      const commitment: unknown = commitBeforeRetain(Object.freeze(refFor()));'
INTENTION = '''  const intention = appendOpsAuditEvent({ workspace: input.workspace, auditType: "SESSION_SPILL_ERASURE_INTENDED",
    payload: { reason: input.reason, eventIds: [...eventIds].sort(), sessionIds: [...sessionIds].sort(), selectionSha256,
      scope: "local-referenced-spill-objects-only", selectedObjects: entries.length } });
  auditEventIds.push(intention.eventId);
'''
OUTCOME = '''  const outcome = appendOpsAuditEvent({ workspace: input.workspace, auditType: "SESSION_SPILL_ERASURE_FINISHED",
    payload: finishedPayload(intention.eventId, ok, outcomes) });'''
AUTH_INDEX = '''    if (!authorized || canonicalize(authorized.ref) !== canonicalize(entry.ref)
      || canonicalize(authorized.eventIds) !== canonicalize(entry.eventIds)
      || canonicalize(authorized.sessionIds) !== canonicalize(entry.sessionIds)) throw new Error("Spill export entry is not authorized by destination signed rows");'''
POLICY_AUTH = '''  const signature = policySignatureSchema.parse(JSON.parse(readKeyMetadata(opsPolicySigPath(workspace)).toString("utf8")));
  const digest = sha256Hex(bytes);
  // Preserve the existing ops-policy verifier's envelope/legacy signature
  // compatibility while authenticating precisely the YAML parsed below.
  if (digest !== signature.digestSha256 || !(verifySignedDigest({ workspace, digestHex: digest, signed: signature }) ||
      verifyHexDigestAny(digest, signature.signature, getPublicKeyHistory(workspace, "auditor")))) {
    throw new Error("spill operations policy signature verification failed");
  }
'''
CLOSED = '''      const closed = entry.sessionIds.every((sessionId) => {
        const last = lastBySession.get(sessionId);
        return last?.event_type === "session/close" && last.ts < pruneBeforeTs &&
          spillLifecycleEventAuthenticityError(params.workspace, last) === null;
      });'''

MUTATIONS = [
    mutant("publish-before-signed-commitment", [
        edit(POLICY, COMMIT, '      prepared.persist();\n' + COMMIT),
        edit(POLICY, '      try {\n        prepared.persist();',
             '      try {\n        // Mutant already materialized before commitment admission.')],
        [case(SESSION, "admits the signed non-surface commitment before any spill file, then admits the result after persistence")],
        "Move the same publication before admission; the real SessionEventStore interceptor observes the file before signing. No second persist masks the result."),
    mutant("swallow-commitment-admission-failure", [edit(POLICY, COMMIT,
        '      const commitment: unknown = (() => { try { return commitBeforeRetain(Object.freeze(refFor())); } catch { return undefined; } })();')],
        [case(SESSION, "a commitment failure at " + fault + " never persists an object or publishes a result",
              marker='"a commitment failure at %s never persists an object or publishes a result"')
         for fault in ("before-admission", "after-commit-return-lost")],
        "Both injected failures must escape. The second fixture actually appends a signed intention before simulating lost return; neither may publish."),
    mutant("publish-raw-plaintext", [edit("src/session/spill/spillStore.ts",
        '        publishObject(this.workspace, locator, encoded, this.root);',
        '        publishObject(this.workspace, locator, plaintext, this.root);')],
        [case(ENCRYPTION, "prepares only in memory and publishes encrypted bytes from the input snapshot")],
        "Write the actual captured plaintext. Its raw-byte exclusion assertion precedes reader format/hash checks, so a later detector cannot create a false success."),
    mutant("invent-fallback-spill-key", [edit(ENC,
        '  const { keyVersion, key } = writerKey(workspace);',
        '  const { keyVersion, key } = (() => { try { return writerKey(workspace); } catch { return { keyVersion: 1, key: Buffer.alloc(32, 7) }; } })();')],
        [case(SESSION, "missing current-key signature produces only an explicit unretrievable preview and creates no key")],
        "Model the forbidden usable fallback with a fixed synthetic mutant-only key. Missing current signature leaves ordinary fixture signing available; the native result must remain unretained. No production key or provisioning API is used."),
    mutant("trust-unsigned-spill-policy", [edit(ENC, POLICY_AUTH,
        '  // Mutant trusts policy YAML without its signature.\n')],
        [case(ENCRYPTION, "refuses unsigned or tampered operations policy before trusting its size limit")],
        "Bypass both signature-file admission and digest/signature checks as one policy-authentication boundary; removing only the comparison leaves missing-file refusal active."),
    mutant("ignore-signed-row-hash", [edit(EVID,
        '  if (recomputed !== event.event_hash) {', '  if (false && recomputed !== event.event_hash) {')],
        [case(EVIDENCE, "refuses retrieval when the commitment itself was edited to match a swapped file")],
        "Donor ciphertext belongs to the same session and matches the substituted ref. The original signed event hash is untouched, isolating recomputation from signature validation."),
    mutant("ignore-monitor-row-signature", [edit(EVID,
        '  if (!verifyHexDigestAny(event.event_hash, event.writer_sig, [...monitorKeys])) {',
        '  if (false && !verifyHexDigestAny(event.event_hash, event.writer_sig, [...monitorKeys])) {')],
        [case(EVIDENCE, "refuses retrieval when the commitment was edited and the event_hash recomputed to match")],
        "The same-session donor reference and recomputed event hash agree. Only the old monitor signature cannot authorize the forged hash."),
    mutant("ignore-signed-ciphertext-digest", [edit(ENC,
        '      sha256Hex(encoded) !== ref.encodedSha256) throw new Error("encrypted spill does not match its signed envelope commitment");',
        '      false) throw new Error("encrypted spill does not match its signed envelope commitment");')],
        [case(BUNDLE, "rejects a ciphertext-only attack despite a genuinely re-signed bundle manifest",
              marker='("rejects a %s attack despite a genuinely re-signed bundle manifest"')],
        "Outer bundle manifest is genuinely re-signed; signed index ref stays original. Keyless ciphertext transport has no GCM decryption detector to mask omission of its encoded digest."),
    mutant("erase-partial-reference-scope", [edit(LIFE,
        '    if (!entry.eventIds.every(selected)) throw new Error(`Spill erasure scope excludes another signed reference to ${entry.locator}`);',
        '    // Mutant admits only one of a locator\'s signed references.')],
        [case(LIFECYCLE, "rejects empty scope and scope that leaves another signed reference outside it", "explicit local spill erasure")],
        "Keep empty-scope refusal. Result-only selection now reaches actual unlink although its commitment lies outside scope; the second toThrow must fail."),
    mutant("sign-erasure-intention-after-unlink", [
        edit(LIFE, INTENTION, ''),
        edit(LIFE, '  const ok = outcomes.every(entry => entry.status !== "failed");',
             INTENTION + '  const ok = outcomes.every(entry => entry.status !== "failed");')],
        [case(LIFECYCLE, "signs intention before real unlink and records exact outcomes while preserving other sessions", "explicit local spill erasure")],
        "Relocate the signed intention after the removal loop. The real remove wrapper asserts audit ordering; its failure is captured as a failed removal and the test's result.ok assertion turns red. Review that causal chain, not merely exit status."),
    mutant("swallow-final-erasure-audit-failure", [edit(LIFE, OUTCOME,
        '  const outcome = (() => { try { return appendOpsAuditEvent({ workspace: input.workspace, auditType: "SESSION_SPILL_ERASURE_FINISHED",\n'
        '    payload: finishedPayload(intention.eventId, ok, outcomes) }); } catch { return { eventId: "mutant-unwritten-outcome" }; } })();')],
        [case(LIFECYCLE, "does not report success when final outcome signing fails after deletion", "explicit local spill erasure")],
        "The real object has already been removed; swallowing only the injected final signing error incorrectly reports success. The test must fail on the required thrown refusal."),
    mutant("retain-no-closed-session-gate", [edit(RET, CLOSED,
        '      const closed = true; // Mutant discards the closed-session admission condition.')],
        [case(RETENTION, "preserves an old active session, a young closed session and an old result whose close is recent")],
        "Disable the cohesive closed-session admission gate, while old reference and payload-pruned requirements stay active. This targets old active sessions, not general payload retention."),
    mutant("ignore-last-close-age", [edit(RET,
        '        return last?.event_type === "session/close" && last.ts < pruneBeforeTs &&',
        '        return last?.event_type === "session/close" &&')],
        [case(RETENTION, "preserves an old active session, a young closed session and an old result whose close is recent")],
        "Preserve close type and signature checks. An old result with a recent authentic close must still retain its object."),
    mutant("trust-index-reference-for-restore", [edit(LIFE, AUTH_INDEX,
        '''    if (!authorized
      || canonicalize(authorized.eventIds) !== canonicalize(entry.eventIds)
      || canonicalize(authorized.sessionIds) !== canonicalize(entry.sessionIds)) throw new Error("Spill export entry is not authorized by destination signed rows");
    expected.set(key, { ...authorized, ref: entry.ref }); // Mutant substitutes transport authority for the signed reference.''')],
        [case(BUNDLE, "rejects a index-also-forged attack despite a genuinely re-signed bundle manifest",
              marker='("rejects a %s attack despite a genuinely re-signed bundle manifest"')],
        "Cohesive authority substitution: admit the forged ref AND pass it to the storage publisher. Merely removing equality still leaves final storage validation against the original signed ref and would not establish this property."),
    mutant("claim-complete-despite-spill-gaps", [edit("src/bundles/bundle.ts",
        'retainedSpills: { objectsComplete: errors.length === 0 && spillGaps.length === 0, plaintextVerified: false, gaps: spillGaps }',
        'retainedSpills: { objectsComplete: errors.length === 0, plaintextVerified: false, gaps: spillGaps }')],
        [case(BUNDLE, "names originally missing encrypted objects and excluded legacy plaintext without fabricating completeness")],
        "Keep bundle signature/ledger verification and explicit gap entries. Only the false completeness claim changes; plaintextVerified remains false."),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_bytes(path, data):
    with path.open("xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode())


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False


class Runner:
    def __init__(self, out, env, deadline):
        self.out, self.env, self.deadline = out, env, deadline
        self.commands = []
        self.unconfirmed_cleanup = None

    def command(self, label, argv, cwd, timeout):
        if self.unconfirmed_cleanup is not None:
            raise RuntimeError("Further subprocesses refused after unconfirmed process-group cleanup")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError("Overall execution deadline exhausted")
        folder = self.out / label
        folder.mkdir(mode=0o700)
        record = {"argv": [str(arg) for arg in argv], "cwd": str(cwd), "startedAt": time.time(),
                  "timeoutSeconds": min(timeout, remaining), "timedOut": False, "cleanup": {}}
        write_json(folder / "started.json", record)
        self.commands.append({"label": label, "record": str(folder / "process.json")})
        proc = None
        try:
            with (folder / "stdout.log").open("xb") as stdout, (folder / "stderr.log").open("xb") as stderr:
                proc = subprocess.Popen(record["argv"], cwd=cwd, env=self.env, stdin=subprocess.DEVNULL,
                                        stdout=stdout, stderr=stderr, start_new_session=True)
                record["pid"] = proc.pid
                try:
                    record["exitCode"] = proc.wait(timeout=record["timeoutSeconds"])
                except subprocess.TimeoutExpired:
                    record["timedOut"] = True
        except BaseException as exc:
            record["exception"] = type(exc).__name__ + ": " + str(exc)
            raise
        finally:
            if proc is not None:
                # Reap only this command's process group, including leaked workers.
                sent = []
                for sig in (signal.SIGTERM, signal.SIGKILL):
                    if group_exists(proc.pid):
                        try:
                            os.killpg(proc.pid, sig)
                            sent.append(sig.name)
                        except ProcessLookupError:
                            pass
                        until = time.monotonic() + 3
                        while group_exists(proc.pid) and time.monotonic() < until:
                            proc.poll()
                            time.sleep(0.05)
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    record["reapTimeout"] = True
                record["cleanup"] = {"processGroup": proc.pid, "closed": not group_exists(proc.pid), "signals": sent}
            record["finishedAt"] = time.time()
            write_json(folder / "process.json", record)
            if not record["cleanup"].get("closed"):
                self.unconfirmed_cleanup = {"label": label, "folder": str(folder),
                                            "processGroup": record["cleanup"].get("processGroup"),
                                            "detail": "Process-group closure was not confirmed; root inspection required"}
        return record, folder

    def checked(self, label, argv, cwd, timeout=30):
        record, folder = self.command(label, argv, cwd, timeout)
        if record.get("exitCode") != 0 or record["timedOut"] or not record["cleanup"].get("closed"):
            raise RuntimeError("Command failed or cleanup unconfirmed: " + label)
        return (folder / "stdout.log").read_bytes()


def assert_clean(runner, clone, source, label):
    head = runner.checked(label + "-head", ["git", "rev-parse", "HEAD"], clone).decode().strip()
    status = runner.checked(label + "-status", ["git", "status", "--porcelain", "--untracked-files=no"], clone)
    flags = runner.checked(label + "-flags", ["git", "ls-files", "-v"], clone).decode().splitlines()
    if head != source or status.strip() or any(line and line[0] != "H" for line in flags):
        raise RuntimeError("Checkout no longer clean at supplied source; no reset will be attempted")


def source_case_span(clone, item):
    text = (clone / item["file"]).read_text()
    marker = item["sourceMarker"]
    if text.count(marker) != 1:
        raise RuntimeError("Missing or ambiguous test-source marker: " + item["fullName"])
    start = text.index(marker)
    end = text.find("\n  it", start + len(marker))
    if end < 0:
        end = len(text)
    return {"first": text.count("\n", 0, start) + 1, "last": text.count("\n", 0, end) + 1}


def test_run(runner, clone, node, label, files, cases, timeout):
    # Vitest alone creates this not-yet-existing report; commands/logs use xb.
    report = runner.out / label / "vitest.json"
    argv = [node, clone / "node_modules/vitest/vitest.mjs", "run", *files,
            "--maxWorkers=1", "--no-file-parallelism", "--reporter=json", "--outputFile=" + str(report)]
    if cases:
        escape = lambda value: re.sub(r"([.*+?^${}()|\[\]\\])", r"\\\1", value)
        argv += ["--testNamePattern", "^(?:" + "|".join(escape(item["fullName"]) for item in cases) + ")$"]
    try:
        process, folder = runner.command(label, argv, clone, timeout)
    except BaseException:
        # An interrupted command can also finish its cleanup attempt unconfirmed.
        # Preserve its parsed evidence before raising the fail-stop error below.
        if runner.unconfirmed_cleanup is None or runner.unconfirmed_cleanup["label"] != label:
            raise
        folder = runner.out / label
        process = json.loads((folder / "process.json").read_text())
    parsed, report_error = {}, None
    if report.is_file():
        try:
            with report.open("rb") as handle:
                raw = handle.read(os.fstat(handle.fileno()).st_size)
            write_bytes(folder / "vitest-observed.json", raw)
            parsed = json.loads(raw)
            if not isinstance(parsed, dict) or not isinstance(parsed.get("testResults", []), list):
                raise ValueError("Vitest report has an unsupported top-level shape")
            if any(not isinstance(suite, dict) or not isinstance(suite.get("assertionResults", []), list)
                   for suite in parsed.get("testResults", [])):
                raise ValueError("Vitest report has an unsupported suite shape")
        except (ValueError, OSError) as exc:
            parsed = {}
            report_error = str(exc)
    else:
        report_error = "No Vitest JSON report"
    assertions = [item for suite in parsed.get("testResults", []) for item in suite.get("assertionResults", [])]
    suites = [{"name": suite.get("name"), "message": suite.get("message"),
               "status": suite.get("status"), "assertions": len(suite.get("assertionResults", []))}
              for suite in parsed.get("testResults", [])]
    result = {"process": process, "reportError": report_error, "success": parsed.get("success"),
              "counts": {key: value for key, value in parsed.items() if key.startswith("num")},
              "unhandledErrors": parsed.get("unhandledErrors", []), "suites": suites, "assertions": assertions}
    if runner.unconfirmed_cleanup is not None:
        # A still-live process may continue writing its original output files.
        # Preserve bounded observed snapshots and do not call them final output.
        for filename in ("stdout.log", "stderr.log"):
            original = folder / filename
            if original.is_file():
                with original.open("rb") as handle:
                    observed = handle.read(os.fstat(handle.fileno()).st_size)
                write_bytes(folder / (filename + ".observed"), observed)
        result["cleanupFailure"] = {**runner.unconfirmed_cleanup,
                                    "outputBoundary": "Observed snapshots only; original child output may continue changing"}
    write_json(folder / "parsed.json", result)
    if runner.unconfirmed_cleanup is not None:
        raise RuntimeError("Test process-group cleanup unconfirmed; receipts preserved, further execution and qualification refused: " + str(folder))
    return result


def healthy(result):
    proc = result["process"]
    return (not result["reportError"] and not proc["timedOut"] and not proc.get("exception")
            and proc["cleanup"].get("closed") and not result["unhandledErrors"]
            and not result["counts"].get("numRuntimeErrorTestSuites", 0)
            and not any(suite["message"] or (suite["status"] == "failed" and not suite["assertions"])
                        for suite in result["suites"]))


def green(result):
    active = [item for item in result["assertions"] if item.get("status") == "passed"]
    return (healthy(result) and result["process"].get("exitCode") == 0 and result["success"] is True
            and bool(active) and len(active) == len(result["assertions"])
            and result["counts"].get("numFailedTests") == 0)


def classify(result, cases):
    active = [item for item in result["assertions"] if item.get("status") not in ("pending", "skipped", "todo", "disabled")]
    expected = {item["fullName"]: item for item in cases}
    names = [item.get("fullName") for item in active]
    if not healthy(result) or len(names) != len(expected) or set(names) != set(expected):
        return "inconclusive-report-selection-or-runtime"
    if result["process"].get("exitCode") == 0 and all(item.get("status") == "passed" for item in active):
        return "survived"
    if result["process"].get("exitCode") != 1 or result["counts"].get("numFailedTests") != len(expected):
        return "inconclusive-exit-or-mixed-results"
    for assertion in active:
        item = expected[assertion["fullName"]]
        messages = assertion.get("failureMessages", [])
        if assertion.get("status") != "failed" or not messages:
            return "inconclusive-nonassertion-failure"
        for message in messages:
            # beforeEach/import/teardown errors cannot qualify: a named AssertionError
            # must carry a stack frame inside this exact authored test's body.
            locations = re.findall(re.escape(item["file"]) + r":(\d+):\d+", message)
            if "AssertionError" not in message or not any(item["span"]["first"] <= int(line) <= item["span"]["last"] for line in locations):
                return "inconclusive-nonassertion-or-outside-test-body"
    return "named-assertions-red-review-required"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True, help="Existing local AMC Git repository; read only")
    parser.add_argument("--source", required=True, help="Explicit lowercase forty-character final candidate commit")
    parser.add_argument("--output", type=Path, required=True, help="New private run directory outside repository/worktrees")
    parser.add_argument("--node", type=Path, required=True, help="Absolute Node 22 executable")
    parser.add_argument("--pnpm", type=Path, required=True, help="Absolute installed pnpm JS entry, run by --node")
    parser.add_argument("--test-timeout", type=int, default=600)
    parser.add_argument("--install-timeout", type=int, default=1800)
    parser.add_argument("--total-timeout", type=int, default=14400)
    args = parser.parse_args()
    if os.name != "posix" or not re.fullmatch(r"[0-9a-f]{40}", args.source):
        parser.error("POSIX process groups and an explicit lowercase 40-character source SHA are required")
    if not (0 < args.test_timeout <= 1200 and 0 < args.install_timeout <= 3600 and 0 < args.total_timeout <= 43200):
        parser.error("Timeouts must be positive and bounded: tests <=1200, install <=3600, total <=43200 seconds")
    if not all(path.is_absolute() for path in (args.repository, args.output, args.node, args.pnpm)):
        parser.error("All paths must be absolute")
    repository, node, pnpm = args.repository.resolve(strict=True), args.node.resolve(strict=True), args.pnpm.resolve(strict=True)
    parent = args.output.parent.resolve(strict=True)
    out = parent / args.output.name
    for forbidden in (repository, SHARED_ROOT):
        if out == forbidden or forbidden in out.parents or out in forbidden.parents:
            parser.error("Run directory must be outside the repository and shared workspace")
    if out.exists() or out.is_symlink() or "cos-human-first-use" in str(out):
        parser.error("A new unused scratch run directory is required")
    if not node.is_file() or not os.access(node, os.X_OK) or not pnpm.is_file():
        parser.error("Node executable and pnpm JavaScript entry must already exist")
    os.umask(0o077)
    out.mkdir(mode=0o700)
    clone, receipts = out / "clone", out / "receipts"
    receipts.mkdir(mode=0o700)
    for folder in ("home", "tmp", "cache", "pnpm-store", "bin"):
        (out / folder).mkdir(mode=0o700)
    (out / "bin/node").symlink_to(node)
    pnpm_launcher = out / "bin/pnpm"
    write_bytes(pnpm_launcher, ("#!/bin/sh\nexec " + shlex.quote(str(node)) + " " + shlex.quote(str(pnpm)) + ' "$@"\n').encode())
    pnpm_launcher.chmod(0o700)
    # No inherited credentials, NODE_OPTIONS, proxy, notary, agent endpoints,
    # user git config, npmrc or production vault configuration enters a child.
    env = {"PATH": str(out / "bin") + ":/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(out / "home"),
           "TMPDIR": str(out / "tmp"), "XDG_CACHE_HOME": str(out / "cache"),
           "CI": "1", "NO_COLOR": "1", "LANG": "en_US.UTF-8", "TZ": "UTC",
           "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0",
           "NPM_CONFIG_USERCONFIG": "/dev/null", "NPM_CONFIG_GLOBALCONFIG": "/dev/null"}
    runner = Runner(receipts, env, time.monotonic() + args.total_timeout)
    summary = {"schemaVersion": 1, "source": args.source, "authoringBase": AUTHORING_BASE,
               "repository": str(repository), "clone": str(clone), "output": str(out),
               "status": "incomplete", "mutations": [], "startedAt": time.time(),
               "helperSha256": digest(Path(__file__).read_bytes()), "python": sys.version,
               "host": {"platform": platform.platform(), "machine": platform.machine()},
               "scope": "Focused source mutation protocol; no full-suite, package, platform matrix, live-provider, human-study or release claim"}
    write_bytes(receipts / "executed-helper.py", Path(__file__).read_bytes())
    write_json(receipts / "requested-run.json", summary)
    ready = False
    try:
        runtime = runner.checked("runtime", [node, "-p", "JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,versions:process.versions})"], out)
        summary["runtime"] = json.loads(runtime)
        if not summary["runtime"]["node"].startswith("v22."):
            raise RuntimeError("Node 22 is required; no runtime is downloaded automatically")
        runner.checked("clone", ["git", "-c", "core.hooksPath=/dev/null", "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--", repository, clone], out, 300)
        if not (clone / ".git").is_dir() or (clone / ".git").is_symlink() or (clone / ".git/objects/info/alternates").exists():
            raise RuntimeError("Refuse linked/shared Git object storage")
        runner.checked("checkout", ["git", "-c", "core.hooksPath=/dev/null", "checkout", "--detach", args.source], clone, 120)
        assert_clean(runner, clone, args.source, "initial")
        tracked = sorted(set(FILES + [change["path"] for item in MUTATIONS for change in item["edits"]] + ["pnpm-lock.yaml", "package.json", "vitest.config.ts"]))
        summary["sourceFiles"] = {}
        for number, relative in enumerate(tracked):
            path = clone / relative
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or clone not in path.resolve().parents:
                raise RuntimeError("Expected independent regular source file: " + relative)
            pinned = runner.checked("pin-file-" + str(number), ["git", "show", args.source + ":" + relative], clone)
            if path.read_bytes() != pinned:
                raise RuntimeError("Source bytes differ from supplied commit: " + relative)
            summary["sourceFiles"][relative] = digest(pinned)
        for item in MUTATIONS:
            for change in item["edits"]:
                if (clone / change["path"]).read_text().count(change["old"]) != 1:
                    raise RuntimeError("Exact patch anchor drift: " + item["name"])
            for selected in item["cases"]:
                selected["span"] = source_case_span(clone, selected)
        write_json(receipts / "mutation-map.json", MUTATIONS)
        manager = json.loads((clone / "package.json").read_text()).get("packageManager", "")
        wanted = re.fullmatch(r"pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\..+)?", manager)
        version = runner.checked("pnpm-version", [node, pnpm, "--version"], clone).decode().strip()
        if not wanted or version != wanted.group(1):
            raise RuntimeError("pnpm version must exactly match candidate packageManager")
        summary["pnpm"] = {"path": str(pnpm), "version": version, "entrySha256": digest(pnpm.read_bytes())}
        summary["nodeSha256"] = digest(node.read_bytes())
        runner.checked("frozen-install", [node, pnpm, "install", "--frozen-lockfile", "--store-dir", out / "pnpm-store"], clone, args.install_timeout)
        assert_clean(runner, clone, args.source, "installed")
        for relative, expected_hash in summary["sourceFiles"].items():
            if digest((clone / relative).read_bytes()) != expected_hash:
                raise RuntimeError("Frozen install changed qualified source: " + relative)
        installed_lock = clone / "node_modules/.pnpm/lock.yaml"
        if not installed_lock.is_file() or not (clone / "node_modules/vitest/vitest.mjs").is_file():
            raise RuntimeError("Frozen installation did not produce expected lock/Vitest entry")
        summary["installedLockfileSha256"] = digest(installed_lock.read_bytes())
        summary["installProvenance"] = "This run's new clone, empty isolated store, pinned pnpm and successful frozen-lockfile install; lifecycle hooks are logged"
        baseline = test_run(runner, clone, node, "baseline", FILES, None, args.test_timeout)
        assert_clean(runner, clone, args.source, "baseline-restored")
        if not green(baseline):
            raise RuntimeError("Relevant full-file baseline is not wholly green; no mutation applied")
        passed = [item.get("fullName") for item in baseline["assertions"]]
        for item in MUTATIONS:
            if any(passed.count(selected["fullName"]) != 1 for selected in item["cases"]):
                raise RuntimeError("Expected test absent or ambiguous in baseline: " + item["name"])
        ready = True
        for item in MUTATIONS:
            originals, changed = {}, {}
            for change in item["edits"]:
                relative = change["path"]
                if relative not in originals:
                    originals[relative] = (clone / relative).read_bytes()
                    if digest(originals[relative]) != summary["sourceFiles"][relative]:
                        raise RuntimeError("Mutation source drift: " + relative)
                    changed[relative] = originals[relative]
                if changed[relative].count(change["old"].encode()) != 1:
                    raise RuntimeError("Sequential patch anchor drift: " + item["name"])
                changed[relative] = changed[relative].replace(change["old"].encode(), change["new"].encode(), 1)
            row = {"name": item["name"], "status": "incomplete", "boundary": item["boundary"], "restored": False,
                   "expectedCases": item["cases"], "files": {key: {"before": digest(value), "mutated": digest(changed[key])} for key, value in originals.items()}}
            summary["mutations"].append(row)
            patch_folder = receipts / (item["name"] + "-patch")
            patch_folder.mkdir(mode=0o700)
            for number, (relative, original) in enumerate(originals.items()):
                write_bytes(patch_folder / (str(number) + ".original"), original)
                write_bytes(patch_folder / (str(number) + ".mutant"), changed[relative])
                diff = "".join(difflib.unified_diff(original.decode().splitlines(True), changed[relative].decode().splitlines(True), fromfile=relative, tofile=relative))
                write_bytes(patch_folder / (str(number) + ".patch"), diff.encode())
            applied = []
            try:
                for relative, content in changed.items():
                    applied.append(relative)
                    (clone / relative).write_bytes(content)
                result = test_run(runner, clone, node, item["name"], sorted({selected["file"] for selected in item["cases"]}), item["cases"], args.test_timeout)
                row["status"] = classify(result, item["cases"])
                row["actualFailedCases"] = [entry.get("fullName") for entry in result["assertions"] if entry.get("status") == "failed"]
            finally:
                # Only own exact clone mutations are restored. Preserve an unexpected
                # third-party edit rather than resetting/stashing someone else's work.
                row["restoration"] = {}
                for relative in applied:
                    if runner.unconfirmed_cleanup is not None:
                        row["restoration"][relative] = "deferred: process group may still be using this source; original backup retained"
                        continue
                    target = clone / relative
                    if target.read_bytes() not in (originals[relative], changed[relative]):
                        row["restoration"][relative] = "unexpected bytes preserved; manual recovery required"
                        continue
                    target.write_bytes(originals[relative])
                    row["restoration"][relative] = "restored" if target.read_bytes() == originals[relative] else "restoration failed"
                row["restored"] = len(applied) == len(originals) and all(value == "restored" for value in row["restoration"].values())
                write_json(patch_folder / "result.json", row)
            if not row["restored"]:
                raise RuntimeError("Source restoration not confirmed; subsequent mutations refused")
            assert_clean(runner, clone, args.source, item["name"] + "-restored")
        final = test_run(runner, clone, node, "restored-baseline", FILES, None, args.test_timeout)
        assert_clean(runner, clone, args.source, "final")
        summary["restoredBaselineGreen"] = green(final)
        summary["status"] = ("named-assertions-red-review-required" if green(final) and all(row["status"] == "named-assertions-red-review-required" for row in summary["mutations"]) else "not-qualified")
    except BaseException as exc:
        summary["error"] = type(exc).__name__ + ": " + str(exc)
        summary["status"] = "incomplete"
    finally:
        # Reserve only a bounded metadata/cleanup allowance after the work
        # deadline. Never run another test or install during this allowance.
        if runner.unconfirmed_cleanup is not None:
            summary["finalTrackedCleanAtPin"] = None
            summary["restoredBaselineGreen"] = None
            summary["qualificationWithheld"] = runner.unconfirmed_cleanup
            summary["cleanupError"] = "Source-state checking and restoration qualification withheld while process closure is unconfirmed"
            summary["status"] = "incomplete"
        elif (clone / ".git").is_dir():
            runner.deadline = max(runner.deadline, time.monotonic() + 90)
            try:
                assert_clean(runner, clone, args.source, "cleanup-final-state")
                summary["finalTrackedCleanAtPin"] = True
            except BaseException as exc:
                summary["finalTrackedCleanAtPin"] = False
                summary["cleanupError"] = type(exc).__name__ + ": " + str(exc)
                summary["status"] = "incomplete"
        else:
            summary["finalTrackedCleanAtPin"] = False
        summary["finishedAt"] = time.time()
        summary["baselineAdmittedMutations"] = ready
        summary["commands"] = runner.commands
        summary["cleanup"] = {"clonePreserved": str(clone), "temporaryFixturesPreservedIfTestsDidNotClean": str(out / "tmp"),
                              "allProcessGroupsClosed": all(json.loads(Path(row["record"]).read_text())["cleanup"].get("closed") for row in runner.commands)}
        if not summary["cleanup"]["allProcessGroupsClosed"]:
            summary["status"] = "incomplete"
        write_json(receipts / "summary.json", summary)
        # Receipts are write-once; preserve the clone, failed logs and fixture
        # leftovers. Nothing is automatically deleted or overwritten on rerun.
        files = [path for path in receipts.rglob("*") if path.is_file()]
        write_json(out / "receipt-manifest.json", {"source": args.source,
                   "outputBoundary": "Hashes observed during finalization; child-owned outputs may change if process closure is unconfirmed" if runner.unconfirmed_cleanup else "All command process groups closed before finalization",
                   "files": {str(path.relative_to(out)): digest(path.read_bytes()) for path in sorted(files)}})
    print(json.dumps({"status": summary["status"], "summary": str(receipts / "summary.json")}, ensure_ascii=False))
    return 0 if summary["status"] == "named-assertions-red-review-required" else 1


def interrupted(signum, _frame):
    # The first signal aborts work; repeat signals must not interrupt source
    # restoration, child reaping or the write-once failure receipt.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise KeyboardInterrupt("Received signal " + str(signum))


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    sys.exit(main())
