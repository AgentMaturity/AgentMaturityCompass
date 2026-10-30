#!/usr/bin/env python3
"""Drive `amc agent-loop chat` through a pseudo-terminal for P0-31 (AMC-1533).

Usage: chat-pty.py <script.json>. The script holds argv, cwd, env, timeoutSeconds and steps
[{"expect": text, "send": line or null}]. Each expect must appear after the previous match.
Prints one JSON line: {"ok", "matched", "error"?}. The transcript stays in the caller's logs.
"""
import json, os, pty, select, sys, time

spec = json.load(open(sys.argv[1], encoding="utf-8"))
pid, fd = pty.fork()
if pid == 0:
    os.chdir(spec["cwd"])
    os.execve(spec["argv"][0], spec["argv"], spec["env"])
buffer, position, matched, error = "", 0, [], None
deadline = time.monotonic() + spec.get("timeoutSeconds", 60)
try:
    for step in spec["steps"]:
        while step["expect"] not in buffer[position:]:
            if time.monotonic() > deadline:
                raise TimeoutError("timed out waiting for: " + step["expect"])
            ready, _, _ = select.select([fd], [], [], 0.2)
            if ready:
                try:
                    chunk = os.read(fd, 65536)
                except OSError:
                    chunk = b""
                if not chunk:
                    raise EOFError("chat exited before: " + step["expect"])
                buffer += chunk.decode("utf-8", "replace")
        position = buffer.index(step["expect"], position) + len(step["expect"])
        matched.append(step["expect"])
        if step.get("send") is not None:
            os.write(fd, (step["send"] + "\r").encode())
except Exception as exc:  # reported, never hidden: ok stays false
    error = type(exc).__name__ + ": " + str(exc)
finally:
    end = time.monotonic() + 10
    while time.monotonic() < end:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done:
            break
        ready, _, _ = select.select([fd], [], [], 0.2)
        if ready:
            try:
                buffer += os.read(fd, 65536).decode("utf-8", "replace")
            except OSError:
                pass
    else:
        os.kill(pid, 9)
        os.waitpid(pid, 0)
sys.stderr.write(buffer)
print(json.dumps({"ok": error is None and len(matched) == len(spec["steps"]), "matched": matched, **({"error": error} if error else {})}))
