#!/usr/bin/env python3
"""Opt-in installed AMC retained-output acceptance orchestrator.

No subprocess launcher is implemented here. Future execution delegates every
command to the caller's hash-pinned, reviewed attempt-3 supervisor.supervised.
See README.md for the public history boundary and separate fixture-erasure review.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import traceback
import uuid

SOURCE = "130c2d0087cf574016411fdc7d91067d3eddd637"
GROUPS = (
    "installed-boundary", "native-retention", "inventory-and-origins",
    "bounded-public-reads", "locked-vault-boundary", "encrypted-export", "refused-overwrite",
    "tamper-and-missing", "existing-history-restore", "reviewed-erasure",
)
LOCAL_TRUST = "workspace-key-consistency-with-a-locally-observed-pre-run-pin"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def absolute(value):
    require(isinstance(value, str) and "\0" not in value, "Expected path string")
    path = Path(value)
    require(path.is_absolute() and str(path) == value and ".." not in path.parts,
            "Paths must be absolute, normalized and NUL-free")
    return path


def plain(path, directory=False, private=False):
    path = absolute(str(path))
    for component in [*reversed(path.parents), path]:
        require(not component.is_symlink(), "Symlink path refused: " + str(component))
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode),
            "Wrong file type: " + str(path))
    if not directory:
        require(info.st_nlink == 1, "Multiply linked file refused: " + str(path))
    if private:
        require(info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
                "Expected a private caller-owned path: " + str(path))
    return info


def bytes_at(path, maximum=32 * 1024 * 1024):
    info = plain(path)
    require(info.st_size <= maximum, "Input exceeds read bound: " + str(path))
    with open(path, "rb") as stream:
        data = stream.read(maximum + 1)
    require(len(data) <= maximum, "File grew beyond read bound")
    return data


def read_json(path, maximum=8 * 1024 * 1024):
    return json.loads(bytes_at(path, maximum))


def put(path, value, exclusive=True):
    data = (json.dumps(value, ensure_ascii=True, indent=2) + "\n").encode()
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def put_bytes(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def pinned(spec, maximum=256 * 1024 * 1024):
    require(isinstance(spec, dict), "Pin must be an object")
    require(re.fullmatch(r"[0-9a-f]{64}", spec.get("sha256", "")) is not None,
            "Pin needs a complete lowercase SHA-256")
    path = absolute(spec["path"])
    data = bytes_at(path, maximum)
    require(digest(data) == spec["sha256"], "Digest mismatch: " + str(path))
    return path, data


def validate(config):
    keys = {"schemaVersion", "allowExecution", "source", "sourceReceipt", "tarball",
            "node", "npm", "cliSha256", "supervisor", "native", "runnerSha256",
            "root", "backends", "nodePlatform", "nodeArch", "allowInstallScripts",
            "installTimeoutSeconds", "commandTimeoutSeconds", "reviewTimeoutSeconds"}
    require(isinstance(config, dict) and set(config) == keys, "Unexpected/missing config keys")
    require(config["schemaVersion"] == 1 and config["allowExecution"] is True,
            "schemaVersion=1 and allowExecution=true required")
    require(config["source"] == SOURCE, "This authored lane is pinned to " + SOURCE)
    require(config["backends"] in (["sqlite"], ["jsonl"], ["sqlite", "jsonl"]),
            "Choose sqlite, jsonl, or sqlite then jsonl; no duplicates or implicit variants")
    require(config["nodePlatform"] in ("darwin", "linux"), "No Windows supervisor qualification")
    require(config["nodeArch"] in ("arm64", "x64"), "Unsupported declared architecture")
    require(re.fullmatch(r"v(?:22|24|25)\.\d+\.\d+", config["node"]["version"]) is not None,
            "An exact reviewed Node 22, 24 or 25 version is required")
    require(re.fullmatch(r"\d+\.\d+\.\d+", config["npm"]["version"]) is not None,
            "An exact npm version is required")
    require(config["allowInstallScripts"] is True,
            "Reviewed native dependency install scripts require explicit opt-in")
    for key, upper in (("installTimeoutSeconds", 900), ("commandTimeoutSeconds", 180),
                       ("reviewTimeoutSeconds", 600)):
        require(type(config[key]) is int and 1 <= config[key] <= upper, "Invalid " + key)
    for key in ("cliSha256", "runnerSha256"):
        require(re.fullmatch(r"[0-9a-f]{64}", config[key]) is not None, "Invalid " + key)
    require(digest(bytes_at(Path(__file__).resolve())) == config["runnerSha256"],
            "Caller must pin this reviewed runner")
    root = absolute(config["root"])
    plain(root.parent, directory=True, private=True)
    require(not os.path.lexists(root), "New consumer/output root must not already exist")
    for name in ("sourceReceipt", "tarball", "node", "npm", "supervisor", "native"):
        path, _ = pinned(config[name])
        require(path != root and root not in path.parents, "Inputs must be outside the new root")
    receipt = read_json(absolute(config["sourceReceipt"]["path"]))
    require(receipt.get("source") == SOURCE and receipt.get("finalHead") == SOURCE,
            "Source receipt does not bind this candidate")
    artifact = receipt.get("artifact", {})
    require(artifact.get("sha256") == config["tarball"]["sha256"] and
            artifact.get("bytes") == config["tarball"].get("bytes") and
            artifact.get("cliSha256") == config["cliSha256"], "Artifact receipt mismatch")
    require(type(config["tarball"].get("bytes")) is int and
            plain(absolute(config["tarball"]["path"])).st_size == config["tarball"]["bytes"],
            "Tarball byte length mismatch")
    require(receipt.get("allObservedCommandProcessesClosed") is True,
            "Prior artifact receipt has no confirmed closure")
    return root


class Lane:
    def __init__(self, config, config_bytes, root):
        self.c, self.root = config, root
        self.closed, self.counter, self.cli = True, 0, None
        root.mkdir(mode=0o700)
        self.out = root / "receipts"
        self.consumer = root / "consumer"
        self.commands = root / "commands"
        for path in (self.out, self.consumer, self.commands, root / "inputs"):
            path.mkdir(mode=0o700)
        put_bytes(root / "inputs/config.json", config_bytes)
        self.state = {"schemaVersion": 1, "issue": "AMC-1547", "source": SOURCE,
                      "classification": "installed-public-scripted-owned-fixture",
                      "qualityClaim": False, "trustBoundary": LOCAL_TRUST,
                      "status": "in-progress", "qualified": False, "active": None,
                      "commands": [], "groups": [], "failures": [], "blockers": [],
                      "configSha256": digest(config_bytes), "pins": config,
                      "startedAtUnixSeconds": time.time(), "allObservedProcessesClosed": None}
        self.save()
        try:
            self.prepare_inputs(config)
        except Exception as error:
            self.state["status"] = "initialization-failed"
            self.state["failures"].append({"phase": "initialization", "error": str(error),
                                           "traceback": traceback.format_exc()})
            self.state["allObservedProcessesClosed"] = None
            self.save()
            raise

    def prepare_inputs(self, config):
        # Import ONLY at explicit future execution, after pin verification; never call main/metadata.
        sys.dont_write_bytecode = True
        _, supervisor_bytes = pinned(config["supervisor"])
        supervisor_copy = self.root / "inputs/reviewed-supervisor.py"
        put_bytes(supervisor_copy, supervisor_bytes)
        spec = importlib.util.spec_from_file_location("reviewed_attempt3_supervisor", supervisor_copy)
        require(spec is not None and spec.loader is not None, "Cannot load reviewed supervisor")
        self.supervisor = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.supervisor)
        require(callable(getattr(self.supervisor, "supervised", None)), "Missing supervised API")
        self.supervisor.RECORD = self.commands
        self.supervisor.requested_signal = None
        signal.signal(signal.SIGTERM, self.supervisor.interrupted)
        signal.signal(signal.SIGINT, self.supervisor.interrupted)
        _, worker = pinned(config["native"])
        self.worker = self.consumer / "native-case.mjs"
        put_bytes(self.worker, worker)
        _, tarball = pinned(config["tarball"])
        self.tarball = self.root / "inputs/candidate.tgz"
        put_bytes(self.tarball, tarball)
        _, provenance = pinned(config["sourceReceipt"])
        put_bytes(self.root / "inputs/source-receipt.json", provenance)

    def save(self):
        put(self.out / "receipt.json", self.state,
            exclusive=not (self.out / "receipt.json").exists())

    def guard(self):
        require(self.closed and self.state["active"] is None,
                "Closure unconfirmed: no more launches, mutations, or restoration")
        require(getattr(self.supervisor, "requested_signal", None) is None,
                "Signal received: stop rather than continue or restore")

    def group(self, backend, name):
        require(name in GROUPS, "Undeclared scenario group")
        group = {"backend": backend, "name": name, "verdict": "unknown", "checks": [],
                 "evidence": [], "blockers": []}
        self.state["groups"].append(group)
        self.save()
        return group

    def check(self, group, name, condition):
        group["checks"].append({"name": name, "passed": bool(condition)})
        if not condition:
            group["verdict"] = "failed"
        self.save()
        require(condition, name)

    def finish_group(self, group):
        require(group["checks"] and all(c["passed"] for c in group["checks"]),
                "Empty/failed scenario cannot pass")
        group["verdict"] = "blocked" if group["blockers"] else "passed"
        self.save()

    def environment(self, parent, backend=None, vault=None, monitor=None):
        home, tmp, cache, xdg = (parent / n for n in ("home", "tmp", "npm-cache", "xdg"))
        for path in (home, tmp, cache, xdg):
            path.mkdir(mode=0o700)
        user, global_ = parent / "npm-user.conf", parent / "npm-global.conf"
        put_bytes(user, b"")
        put_bytes(global_, b"")
        env = {"PATH": str(Path(self.c["node"]["path"]).parent) + ":/usr/bin:/bin",
               "HOME": str(home), "USERPROFILE": str(home), "TMPDIR": str(tmp),
               "TMP": str(tmp), "TEMP": str(tmp), "XDG_CONFIG_HOME": str(xdg),
               "XDG_CACHE_HOME": str(cache), "LANG": "C.UTF-8", "LC_ALL": "C",
               "NO_COLOR": "1", "CI": "1", "npm_config_cache": str(cache),
               "npm_config_userconfig": str(user), "npm_config_globalconfig": str(global_),
               "npm_config_registry": "https://registry.npmjs.org/",
               "npm_config_update_notifier": "false", "npm_config_fetch_retries": "0"}
        if backend is not None:
            env["AMC_SESSION_STORE"] = backend
        if vault is not None:
            env["AMC_VAULT_PASSPHRASE"] = vault
        if monitor is not None:
            env["AMC_EXPECTED_MONITOR_FINGERPRINT"] = monitor
        return env

    def command(self, label, args, cwd, env, timeout=None):
        self.guard()
        pinned(self.c["node"])
        if self.cli is not None:
            require(digest(bytes_at(self.cli)) == self.c["cliSha256"], "Installed CLI changed")
        self.counter += 1
        label = f"{self.counter:03d}-{label}"
        before = len(self.state["commands"])
        self.closed = False
        try:
            code = self.supervisor.supervised(label, [str(a) for a in args], Path(cwd), env,
                    timeout or self.c["commandTimeoutSeconds"], self.state, self.save)
        finally:
            current = self.state["commands"][before:]
            self.closed = (len(current) == 1 and current[0].get("cleanup", {}).get("confirmedClosed") is True
                           and self.state["active"] is None)
            self.state["allObservedProcessesClosed"] = self.closed
            self.save()
        self.guard()
        result = {"exitCode": code, "log": str(self.commands / (label + ".log")),
                  "processReceipt": str(self.commands / (label + "-process.json"))}
        return result

    def public_cli(self, label, args, workspace, env):
        result = self.command(label, [self.c["node"]["path"], self.cli, *args], workspace, env)
        # Whole JSON only. No picking a last JSON fragment out of noisy failure output.
        result["report"] = read_json(Path(result["log"]))
        require(isinstance(result["report"], dict), "CLI returned no structured object")
        return result

    def worker_case(self, label, mode, workspace, env, extra=None):
        require(digest(bytes_at(self.worker)) == self.c["native"]["sha256"], "Consumer helper changed")
        folder = self.out / label
        folder.mkdir(mode=0o700)
        data = {"schemaVersion": 1, "mode": mode, "source": SOURCE,
                "ownedRoot": str(self.root), "workspace": str(workspace), "output": str(folder),
                "backend": env["AMC_SESSION_STORE"], "node": self.c["node"],
                "cli": str(self.cli), "cliSha256": self.c["cliSha256"],
                "nodePlatform": self.c["nodePlatform"], "nodeArch": self.c["nodeArch"],
                "monitorFingerprint": env["AMC_EXPECTED_MONITOR_FINGERPRINT"], **(extra or {})}
        input_path = folder / "input.json"
        put(input_path, data)
        process = self.command(label, [self.c["node"]["path"], self.worker, input_path], workspace, env)
        process["report"] = read_json(folder / "worker-receipt.json")
        process["evidenceDirectory"] = str(folder)
        if not (process["report"].get("cleanup", {}).get("sdkClosed") is True and
                process["report"].get("cleanup", {}).get("endpointClosed") is True):
            self.closed = False
            self.state["allObservedProcessesClosed"] = False
            self.state["blockers"].append({"worker": label, "cleanup": "missing-or-unconfirmed",
                                           "receipt": str(folder / "worker-receipt.json")})
            self.save()
            raise RuntimeError("Worker cleanup missing or unconfirmed; no further action authorized")
        return process

    def install(self):
        group = self.group(None, "installed-boundary")
        env = self.environment(self.root)
        put(self.consumer / "package.json", {"name": "owned-installed-spill-consumer",
                "version": "0.0.0", "private": True, "type": "module"})
        for label, argv, expected in (
            ("node-version", [self.c["node"]["path"], "--version"], self.c["node"]["version"]),
            ("npm-version", [self.c["node"]["path"], self.c["npm"]["path"], "--version"], self.c["npm"]["version"]),
        ):
            result = self.command(label, argv, self.consumer, env)
            group["evidence"].append(result)
            self.check(group, label, result["exitCode"] == 0 and
                       bytes_at(Path(result["log"])).decode().strip() == expected)
        pinned(self.c["npm"])
        result = self.command("install", [self.c["node"]["path"], self.c["npm"]["path"],
                 "install", "--omit=dev", "--no-audit", "--no-fund", "--foreground-scripts",
                 "--ignore-scripts=false", "--save-exact", self.tarball],
                 self.consumer, env, self.c["installTimeoutSeconds"])
        group["evidence"].append(result)
        self.check(group, "bounded new local-tarball install", result["exitCode"] == 0)
        package = self.consumer / "node_modules/agent-maturity-compass"
        metadata = read_json(package / "package.json")
        self.check(group, "installed public exports", metadata.get("name") == "agent-maturity-compass"
                   and metadata.get("bin", {}).get("amc") == "dist/cli.js"
                   and "./sdk/native" in metadata.get("exports", {}))
        self.cli = package / "dist/cli.js"
        self.check(group, "actual installed CLI digest", digest(bytes_at(self.cli)) == self.c["cliSha256"])
        lock = bytes_at(self.consumer / "package-lock.json")
        put_bytes(self.out / "installed-package-lock.json", lock)
        group["installed"] = {"packageVersion": metadata.get("version"), "consumer": str(self.consumer),
                              "cli": str(self.cli), "lockSha256": digest(lock)}
        self.finish_group(group)

    def object_path(self, workspace, locator):
        # Filesystem observation/mutation of OWNED generated objects, not an AMC reader or crypto implementation.
        match = re.fullmatch(r"amc-spill:v2:([0-9a-f]{64}):([0-9a-f]{32}-[A-Za-z0-9._-]{1,64})", locator)
        require(match is not None, "Unsupported locator: do not guess or mutate")
        path = workspace / ".amc/spill" / ("session-" + match[1]) / match[2]
        require(self.root in path.parents, "Mutation escaped owned root")
        plain(path, private=True)
        return path

    def cli_range(self, label, workspace, env, locator, expected, offset=0, limit=16384, origin=None):
        result = self.public_cli(label, ["session", "spill-read", locator, "--workspace", workspace,
                  "--expect-monitor", env["AMC_EXPECTED_MONITOR_FINGERPRINT"], "--offset", str(offset),
                  "--limit", str(limit), "--json"], workspace, env)
        page = result["report"]
        require(result["exitCode"] == 0 and page.get("locator") == locator, "CLI range unavailable")
        recovered = base64.b64decode(page.get("contentBase64", ""), validate=True)
        wanted = expected[offset:offset + limit]
        require(recovered == wanted and page.get("returnedBytes") == len(wanted) and
                page.get("totalBytes") == len(expected) and page.get("offset") == offset and
                page.get("contentSha256") == digest(expected) and
                page.get("nextOffset") == (offset + len(wanted) if offset + len(wanted) < len(expected) else None)
                and page.get("storage") == "encrypted-v2" and
                page.get("verification", {}).get("fullContentVerified") is True and
                page["verification"].get("expectedMonitorFingerprint") == env["AMC_EXPECTED_MONITOR_FINGERPRINT"]
                and page["verification"].get("history") == "supplied-references-only"
                and isinstance(page.get("eventIds"), list) and len(page["eventIds"]) >= 2,
                "Exact range/content/reference metadata mismatch")
        if origin is not None:
            require(sorted(page.get("eventIds", [])) == sorted(origin["eventIds"]) and
                    sorted(page.get("sessionIds", [])) == sorted(origin["sessionIds"]),
                    "CLI range must retain the exact authenticated origin IDs")
        return result

    def snapshot_objects(self, workspace, entries):
        return {entry["locator"]: {"path": str(self.object_path(workspace, entry["locator"])),
                "sha256": digest(bytes_at(self.object_path(workspace, entry["locator"])))} for entry in entries}

    def unchanged(self, snapshot):
        return all(digest(bytes_at(Path(item["path"]))) == item["sha256"] for item in snapshot.values())

    def quarantine(self, path, destination):
        self.guard()
        plain(path, private=True)
        require(self.root in path.parents and self.root in destination.parents and not os.path.lexists(destination),
                "Quarantine must be new and within this owned run")
        os.rename(path, destination)
        put(destination.with_name(destination.name + ".receipt.json"),
            {"operation": "owned-fixture-quarantine", "originalPath": str(path),
             "retainedPath": str(destination), "sha256": digest(bytes_at(destination))})

    def variant(self, backend):
        base = self.root / backend
        base.mkdir(mode=0o700)
        workspace = base / "workspace"
        workspace.mkdir(mode=0o700)
        originals = base / "originals"
        originals.mkdir(mode=0o700)
        # Generated disposable local secret; never an inherited credential or production key.
        fixture_secret = "owned-spill-fixture-" + uuid.uuid4().hex
        put(base / "fixture-secret.private.json", {"classification": "generated-disposable-local-fixture-only",
                                                  "AMC_VAULT_PASSPHRASE": fixture_secret})
        env = self.environment(base, backend, fixture_secret)
        group = self.group(backend, "native-retention")
        for label, args in (("init", ["init", "--trust-boundary", "isolated"]),
                            ("budgets", ["budgets", "init", "--agent", "default"]),
                            ("firewall", ["firewall", "enable", "--mode", "block", "--json"]),
                            ("tools-init", ["tools", "init"])):
            result = self.command(backend + "-" + label, [self.c["node"]["path"], self.cli, *args], workspace, env)
            group["evidence"].append(result)
            self.check(group, label + " exit (setup only)", result["exitCode"] == 0)
        tools_path = workspace / ".amc/tools.yaml"
        self.guard()
        put_bytes(originals / "initial-tools-policy.bytes", bytes_at(tools_path))
        policy = {"tools": {"version": 1, "denyByDefault": True, "allowedTools": [{
                  "name": "fs.read", "actionClass": "READ_ONLY", "allow": {"paths": ["./workspace/allowed/**"]},
                  "deny": {"paths": ["**/.amc/**", "**/.git/**"]}, "requireExecTicket": False}]}}
        put(tools_path, policy, exclusive=False)
        tools_sha = digest(bytes_at(tools_path))
        for label, args in (("tools-sign", ["tools", "sign", "--json"]), ("tools-verify", ["tools", "verify"])):
            result = self.command(backend + "-" + label, [self.c["node"]["path"], self.cli, *args], workspace, env)
            group["evidence"].append(result)
            self.check(group, label + " exit (setup only)", result["exitCode"] == 0)
        monitor = digest(bytes_at(workspace / ".amc/keys/monitor_ed25519.pub"))
        env["AMC_EXPECTED_MONITOR_FINGERPRINT"] = monitor
        group["monitor"] = {"sha256": monitor, "source": "same owned workspace before native capture", "assurance": LOCAL_TRUST}
        # Only the capture worker gets the synthetic provider environment variable.
        capture_env = {**env, "OPENAI_API_KEY": "owned-scripted-provider-not-a-real-credential"}
        capture = self.worker_case(backend + "-capture", "capture", workspace, capture_env,
                                   {"toolsPolicySha256": tools_sha})
        group["evidence"].append(capture)
        self.check(group, "governed SDK fixture verdict", capture["exitCode"] == 0 and capture["report"].get("verdict") == "passed")
        subjects = [{k: v for k, v in subject.items() if k != "turn"}
                    for subject in capture["report"]["subjects"]]
        self.check(group, "two distinct recorded native sessions", len(subjects) == 2 and
                   len({s["sessionId"] for s in subjects}) == 2)
        for subject in subjects:
            result = self.public_cli(backend + "-cold-" + subject["name"],
                     ["agent-loop", "verify", subject["sessionId"], "--json"], workspace, env)
            report = result["report"]
            group["evidence"].append(result)
            self.check(group, "cold native " + subject["name"], result["exitCode"] == 0 and
                       report.get("ok") is True and report.get("ledgerOk") is True and
                       report.get("sessionId") == subject["sessionId"] and
                       report.get("ledgerErrors") == [] and report.get("sessionChainErrors") == [] and
                       report.get("unsignedRowIds") == [] and isinstance(report.get("requests"), list) and
                       len(report["requests"]) == 2 and all(r.get("status") == "reconstructed" for r in report["requests"]) and
                       report.get("trustRoot", {}).get("expectedFingerprint") == monitor)
        self.check(group, "tool policy unchanged", digest(bytes_at(tools_path)) == tools_sha)
        self.finish_group(group)

        def spill(label, command, *flags):
            return self.public_cli(backend + "-" + label, ["spill", command, "--workspace", workspace,
                        "--expect-monitor", monitor, "--json", *flags], workspace, env)

        group = self.group(backend, "inventory-and-origins")
        inv = spill("inventory", "inventory")
        group["evidence"].append(inv)
        inspection = inv["report"].get("inspection", {})
        entries = inspection.get("entries", [])
        self.check(group, "complete selected-store ciphertext inventory", inv["exitCode"] == 0 and
                   inv["report"].get("ok") is True and inspection.get("backend") == backend and
                   inspection.get("historyRead") == "all-available-selected-store-events" and
                   inspection.get("referenceVerification") == "authenticated" and
                   inspection.get("plaintextVerified") is False and inspection.get("contentVerification") == "not-decrypted" and
                   inspection.get("chainVerification") == "not-performed" and len(entries) == len(subjects) and
                   all(e.get("status") == "retained" and e.get("referenceVersion") == 2 for e in entries))
        for subject in subjects:
            selected = [e for e in entries if e.get("sessionIds") == [subject["sessionId"]]]
            self.check(group, "paired origin " + subject["name"], len(selected) == 1 and len(selected[0].get("eventIds", [])) >= 2)
            subject["entry"] = selected[0]
        snapshot = self.snapshot_objects(workspace, entries)
        put(base / "ciphertext-before.json", snapshot)
        group["evidence"].append({"ciphertextSnapshot": str(base / "ciphertext-before.json")})
        self.finish_group(group)

        group = self.group(backend, "bounded-public-reads")
        for subject in subjects:
            expected = bytes_at(absolute(subject["fixturePath"]))
            require(digest(expected) == subject["fixtureSha256"], "Owned fixture changed")
            for index, (offset, limit) in enumerate(((0, 16384), (7, 19), (len(expected) - 5, 17), (len(expected), 1))):
                result = self.cli_range(backend + "-range-" + subject["name"] + "-" + str(index),
                         workspace, env, subject["entry"]["locator"], expected, offset, limit, subject["entry"])
                group["evidence"].append(result)
            self.check(group, "CLI exact ranges " + subject["name"], True)
        ranges = self.worker_case(backend + "-api-ranges", "ranges", workspace, env, {"subjects": subjects})
        group["evidence"].append(ranges)
        self.check(group, "public API full persisted history, exact ranges and refused invalid bounds",
                   ranges["exitCode"] == 0 and ranges["report"].get("verdict") == "passed")
        self.finish_group(group)

        group = self.group(backend, "locked-vault-boundary")
        locked_env = {k: v for k, v in env.items() if k != "AMC_VAULT_PASSPHRASE"}
        privacy = self.worker_case(backend + "-locked-vault", "privacy", workspace, locked_env, {"subjects": subjects})
        group["evidence"].append(privacy)
        self.check(group, "metadata reader grants neither plaintext nor another identity",
                   privacy["exitCode"] == 0 and privacy["report"].get("verdict") == "passed")
        self.finish_group(group)

        group = self.group(backend, "encrypted-export")
        transport = base / "transport"
        export = spill("export", "export", "--out", transport)
        group["evidence"].append(export)
        outcomes = export["report"].get("outcomes", [])
        self.check(group, "encrypted transport completed", export["exitCode"] == 0 and export["report"].get("ok") is True and
                   len(outcomes) == len(entries) and all(o.get("status") == "exported" for o in outcomes))
        allowed_files = {"index.json"}
        for outcome in outcomes:
            name = outcome.get("objectFile", "")
            require(re.fullmatch(r"objects/[0-9a-f]{64}\.blob", name) is not None, "Unexpected transport object filename")
            data = bytes_at(transport / name)
            self.check(group, "transport ciphertext commitment " + name, digest(data) == outcome.get("encodedSha256") and
                       digest(data) == snapshot[outcome["locator"]]["sha256"])
            allowed_files.add(name)
        files = {str(p.relative_to(transport)) for p in transport.rglob("*") if p.is_file()}
        self.check(group, "transport contains only index and named ciphertext", files == allowed_files and
                   all(not p.is_symlink() for p in transport.rglob("*")))
        put(base / "transport-fingerprints.json", {name: digest(bytes_at(transport / name)) for name in sorted(files)})
        self.finish_group(group)

        group = self.group(backend, "refused-overwrite")
        overwrite = spill("restore-overwrite", "restore", "--from", transport)
        group["evidence"].append(overwrite)
        self.check(group, "existing objects not overwritten", overwrite["exitCode"] != 0 and
                   overwrite["report"].get("ok") is False and self.unchanged(snapshot) and
                   len(overwrite["report"].get("outcomes", [])) == len(entries) and
                   all(o.get("status") == "failed" for o in overwrite["report"]["outcomes"]))
        self.finish_group(group)

        group = self.group(backend, "tamper-and-missing")
        selected = subjects[0]
        target = Path(snapshot[selected["entry"]["locator"]]["path"])
        original = originals / "selected-original.blob"
        self.quarantine(target, original)
        original_bytes = bytes_at(original)
        changed = original_bytes[:-1] + bytes([original_bytes[-1] ^ 1])
        try:
            self.guard()
            put_bytes(target, changed)
            put(base / "tamper-mutation.json", {"path": str(target), "beforeSha256": digest(original_bytes),
                                               "mutatedSha256": digest(changed), "mutation": "last ciphertext byte XOR 1"})
            bad = spill("tampered-inventory", "inventory")
            group["evidence"].append(bad)
            self.check(group, "tampered object visibly rejected", bad["exitCode"] != 0 and bad["report"].get("ok") is False and
                       any(e.get("locator") == selected["entry"]["locator"] and e.get("status") == "tampered"
                           for e in bad["report"].get("inspection", {}).get("entries", [])))
            denied = self.public_cli(backend + "-tampered-range", ["session", "spill-read", selected["entry"]["locator"], "--json"], workspace, env)
            group["evidence"].append(denied)
            self.check(group, "tampered CLI read refused", denied["exitCode"] != 0 and denied["report"].get("ok") is False and
                       isinstance(denied["report"].get("error"), str) and "contentBase64" not in denied["report"])
        finally:
            # No restoration at all after unconfirmed worker/process closure or a stop signal.
            self.guard()
            require(digest(bytes_at(target)) == digest(changed), "Unexpected mutation: retain both files for inspection")
            self.quarantine(target, originals / "tampered-observed.blob")
            require(not os.path.lexists(target), "Refuse to overwrite during fixture reset")
            os.rename(original, target)
            put(base / "tamper-reset.json", {"kind": "owned-fixture-reset-not-native-restore", "sha256": digest(bytes_at(target))})
        self.check(group, "exact original recovered after confirmed closure", self.unchanged(snapshot))
        # Keep every original; missing-content is also the precondition for the next native restore.
        for index, entry in enumerate(entries):
            self.quarantine(Path(snapshot[entry["locator"]]["path"]), originals / ("missing-" + str(index) + ".blob"))
        missing = spill("missing-inventory", "inventory")
        group["evidence"].append(missing)
        self.check(group, "missing content never becomes complete", missing["exitCode"] != 0 and missing["report"].get("ok") is False and
                   len(missing["report"].get("inspection", {}).get("entries", [])) == len(entries) and
                   all(e.get("status") == "missing" for e in missing["report"]["inspection"]["entries"]))
        denied = self.public_cli(backend + "-missing-range", ["session", "spill-read", selected["entry"]["locator"], "--json"], workspace, env)
        group["evidence"].append(denied)
        self.check(group, "missing CLI bytes refused", denied["exitCode"] != 0 and denied["report"].get("ok") is False and
                   isinstance(denied["report"].get("error"), str) and "contentBase64" not in denied["report"])
        self.finish_group(group)

        group = self.group(backend, "existing-history-restore")
        restored = spill("restore-missing", "restore", "--from", transport)
        group["evidence"].append(restored)
        self.check(group, "native restore against unchanged authenticated destination history", restored["exitCode"] == 0 and
                   restored["report"].get("ok") is True and
                   restored["report"].get("inspection", {}).get("historySha256") == inspection.get("historySha256") and
                   len(restored["report"].get("outcomes", [])) == len(entries) and
                   all(o.get("status") == "restored" for o in restored["report"]["outcomes"]) and self.unchanged(snapshot))
        for subject in subjects:
            group["evidence"].append(self.cli_range(backend + "-restored-" + subject["name"], workspace, env,
                           subject["entry"]["locator"], bytes_at(absolute(subject["fixturePath"])), origin=subject["entry"]))
        self.check(group, "restored plaintext still matches independently generated fixtures", True)
        self.finish_group(group)

        group = self.group(backend, "reviewed-erasure")
        reason = "Owned installed-spill acceptance fixture only"
        partial = spill("partial-origin", "erase", "--event", selected["entry"]["eventIds"][0], "--reason", reason)
        group["evidence"].append(partial)
        self.check(group, "outside-scope paired origin refused", partial["exitCode"] != 0 and
                   partial["report"].get("error", {}).get("code") == "outside-scope-reference" and
                   partial["report"].get("mutationAttempted") is False and self.unchanged(snapshot))
        flags = ["--session", selected["sessionId"], "--reason", reason]
        planned = spill("erase-plan", "erase", *flags)
        group["evidence"].append(planned)
        plan = planned["report"].get("plan", {})
        self.check(group, "explicit exact-scope plan", planned["exitCode"] == 0 and planned["report"].get("mutationAttempted") is False and
                   plan.get("scope", {}).get("sessionIds") == [selected["sessionId"]] and
                   len(plan.get("selectedObjects", [])) == 1 and
                   plan["selectedObjects"][0].get("locator") == selected["entry"]["locator"] and
                   re.fullmatch(r"[0-9a-f]{64}", plan.get("planSha256", "")) is not None)
        stale = spill("stale-plan", "erase", "--session", selected["sessionId"], "--reason", reason + " changed",
                      "--apply", "--expect-plan", plan["planSha256"])
        group["evidence"].append(stale)
        self.check(group, "stale reason-bound review refused without mutation", stale["exitCode"] != 0 and
                   stale["report"].get("error", {}).get("code") == "stale-plan" and
                   stale["report"].get("mutationAttempted") is False and self.unchanged(snapshot))
        # Fresh report is exposed for SEPARATE review; the runner never creates its own approval.
        fresh = spill("erase-review", "erase", *flags)
        group["evidence"].append(fresh)
        require(fresh["exitCode"] == 0 and fresh["report"].get("ok") is True, "Fresh review unavailable")
        approval = base / "erase-approval.json"
        require(not os.path.lexists(approval), "Pre-existing approval is not a separate review")
        request = {"schemaVersion": 1, "nonce": uuid.uuid4().hex, "source": SOURCE,
                   "backend": backend, "workspace": str(workspace), "sessionId": selected["sessionId"],
                   "reason": reason, "planSha256": fresh["report"]["plan"]["planSha256"],
                   "decision": "apply-owned-fixture-only",
                   "statement": "I reviewed this exact owned-fixture erasure plan."}
        put(base / "erase-review-request.json", {"requiredApproval": request, "cliReview": fresh,
              "approvalPath": str(approval), "timeoutSeconds": self.c["reviewTimeoutSeconds"],
              "identityAssurance": "external-file assertion only; human identity is not authenticated"})
        group["reviewRequest"] = str(base / "erase-review-request.json")
        self.save()
        print("Separate erasure review required: " + group["reviewRequest"], flush=True)
        deadline = time.monotonic() + self.c["reviewTimeoutSeconds"]
        while not os.path.lexists(approval) and time.monotonic() < deadline:
            self.guard()
            time.sleep(0.2)
        if not os.path.lexists(approval):
            group["blockers"].append("ERASURE_REVIEW_NOT_SUPPLIED: no apply was attempted; consumer is retained, not resumable/reused.")
            self.finish_group(group)
            return
        plain(approval, private=True)
        approval_bytes = bytes_at(approval, 16384)
        require(json.loads(approval_bytes) == request, "Approval must exactly match the separately reviewed request")
        put_bytes(base / "erase-approval-retained.json", approval_bytes)
        applied = spill("erase-apply", "erase", *flags, "--apply", "--expect-plan", request["planSha256"])
        group["evidence"].append(applied)
        self.check(group, "reviewed native erase completed", applied["exitCode"] == 0 and applied["report"].get("ok") is True and
                   applied["report"].get("planSha256") == request["planSha256"] and
                   applied["report"].get("auditStore") == "workspace-sqlite-operations-ledger" and
                   len(applied["report"].get("outcomes", [])) == 1 and applied["report"]["outcomes"][0].get("status") == "removed")
        audit_ids = applied["report"].get("auditEventIds")
        self.check(group, "native signed audit identifiers supplied", isinstance(audit_ids, list) and len(audit_ids) == 2 and len(set(audit_ids)) == 2)
        audit = self.worker_case(backend + "-erase-audit", "audit", workspace, env, {"auditEventIds": audit_ids, "subjects": subjects})
        group["evidence"].append(audit)
        self.check(group, "actual operation audit records retained", audit["exitCode"] == 0 and audit["report"].get("verdict") == "passed")
        after = spill("after-erase-inventory", "inventory")
        group["evidence"].append(after)
        statuses = {e["locator"]: e["status"] for e in after["report"].get("inspection", {}).get("entries", [])}
        other = subjects[1]
        self.check(group, "only selected origin removed and gap remains visible", after["exitCode"] != 0 and
                   after["report"].get("ok") is False and statuses.get(selected["entry"]["locator"]) == "missing" and
                   statuses.get(other["entry"]["locator"]) == "retained" and not os.path.lexists(target) and
                   digest(bytes_at(Path(snapshot[other["entry"]["locator"]]["path"]))) == snapshot[other["entry"]["locator"]]["sha256"])
        group["evidence"].append(self.cli_range(backend + "-other-origin-preserved", workspace, env,
                    other["entry"]["locator"], bytes_at(absolute(other["fixturePath"])), origin=other["entry"]))
        self.check(group, "export and quarantined originals intentionally remain outside erasure scope",
                   all(digest(bytes_at(transport / name)) == sha for name, sha in read_json(base / "transport-fingerprints.json").items()) and
                   (originals / "missing-0.blob").exists())
        for subject in subjects:
            cold = self.public_cli(backend + "-post-erase-cold-" + subject["name"],
                     ["agent-loop", "verify", subject["sessionId"], "--json"], workspace, env)
            group["evidence"].append(cold)
            report = cold["report"]
            self.check(group, "post-erasure cold session " + subject["name"], cold["exitCode"] == 0 and
                       report.get("ok") is True and report.get("ledgerOk") is True and report.get("sessionId") == subject["sessionId"] and
                       report.get("ledgerErrors") == [] and report.get("sessionChainErrors") == [] and report.get("unsignedRowIds") == [] and
                       len(report.get("requests", [])) == 2 and all(r.get("status") == "reconstructed" for r in report["requests"]))
        self.finish_group(group)

    def execute(self):
        try:
            self.install()
            for backend in self.c["backends"]:
                self.guard()
                try:
                    self.variant(backend)
                except Exception as error:
                    self.state["failures"].append({"backend": backend, "error": str(error), "traceback": traceback.format_exc()})
                    self.save()
                    if not self.closed or self.supervisor.requested_signal is not None:
                        break
        except Exception as error:
            self.state["failures"].append({"phase": "execution", "error": str(error), "traceback": traceback.format_exc()})
        finally:
            expected = {(None, "installed-boundary")} | {(b, g) for b in self.c["backends"] for g in GROUPS[1:]}
            actual = {(g["backend"], g["name"]) for g in self.state["groups"]}
            for backend, name in sorted(expected - actual, key=lambda p: str(p)):
                self.state["groups"].append({"backend": backend, "name": name, "verdict": "unknown", "checks": [],
                                              "evidence": [], "blockers": ["Not reached; no result inferred"]})
            self.state["qualified"] = (self.closed and self.state["active"] is None and
                not self.state["failures"] and self.supervisor.requested_signal is None and
                bool(self.state["commands"]) and
                all(c.get("cleanup", {}).get("confirmedClosed") is True for c in self.state["commands"]) and
                all(g["verdict"] == "passed" for g in self.state["groups"]))
            self.state["status"] = "qualified-for-declared-local-scope" if self.state["qualified"] else "unqualified"
            self.state["allObservedProcessesClosed"] = self.closed and self.state["active"] is None
            self.state["finishedAtUnixSeconds"] = time.time()
            self.save()
        return 0 if self.state["qualified"] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--execute", action="store_true", help="Explicitly authorize this reviewed finite fixture lane")
    args = parser.parse_args()
    if not args.execute:
        parser.error("No execution or files created without --execute")
    os.umask(0o077)
    config_path = absolute(args.config)
    plain(config_path, private=True)
    config_bytes = bytes_at(config_path, 65536)
    config = json.loads(config_bytes)
    root = validate(config)
    require(config_path != root and root not in config_path.parents, "Configuration must be outside the run")
    return Lane(config, config_bytes, root).execute()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Preflight/init failures are nonzero and printed intact; an existing root is never adopted.
        traceback.print_exc()
        sys.exit(1)
