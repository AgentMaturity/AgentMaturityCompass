"""Bounded real-terminal driver for scripted native chat contracts (no human input)."""
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time


def main():
    spec = json.load(sys.stdin)
    started = time.monotonic()
    pid, master = pty.fork()
    if pid == 0:
        os.chdir(spec["cwd"])
        os.execvpe(spec["command"][0], spec["command"], spec["env"])
    def interrupted(_signal, _frame):
        raise RuntimeError("PTY driver was interrupted")

    signal.signal(signal.SIGTERM, interrupted)
    output = bytearray()
    cursor = 0
    steps = 0
    status = None
    failure = None
    ansi = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")

    def transcript():
        return output.decode("utf-8", errors="replace").replace("\r", "")

    def plain():
        return ansi.sub("", transcript())

    def read_once():
        if not select.select([master], [], [], 0.05)[0]:
            return
        try:
            chunk = os.read(master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                return
            raise
        output.extend(chunk)
        if len(output) > 2 * 1024 * 1024:
            raise RuntimeError("Terminal output exceeded 2 MiB")

    def wait_for(pattern):
        nonlocal cursor, status
        deadline = time.monotonic() + spec.get("waitSeconds", 20)
        while time.monotonic() < deadline:
            match = re.search(pattern, transcript()[cursor:], re.DOTALL)
            if match:
                cursor += match.end()
                return
            read_once()
            finished, observed = os.waitpid(pid, os.WNOHANG)
            if finished:
                status = observed
                # Drain output after exit before deciding the expected marker is absent.
                read_once()
                match = re.search(pattern, transcript()[cursor:], re.DOTALL)
                if match:
                    cursor += match.end()
                    return
                raise RuntimeError("Terminal exited before expected output: " + pattern)
        raise RuntimeError("Timed out waiting for terminal output: " + pattern)

    try:
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
        for action in spec["actions"]:
            if "waitFor" in action:
                wait_for(action["waitFor"])
            if "resize" in action:
                columns, rows = action["resize"]
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
                os.kill(pid, signal.SIGWINCH)
                steps += 1
            if "send" in action:
                os.write(master, action["send"].encode("utf-8"))
                steps += 1
        deadline = time.monotonic() + spec.get("waitSeconds", 20)
        while status is None and time.monotonic() < deadline:
            read_once()
            finished, observed = os.waitpid(pid, os.WNOHANG)
            if finished:
                status = observed
        if status is None:
            raise RuntimeError("Terminal did not exit after the scripted task")
        read_once()
    except Exception as error:
        failure = str(error)
    finally:
        if status is None:
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            _, status = os.waitpid(pid, 0)
        os.close(master)
    rendered = plain()
    result = {"code": os.waitstatus_to_exitcode(status), "output": rendered, "steps": steps,
              "elapsedMs": round((time.monotonic() - started) * 1000), "failure": failure}
    if spec.get("captureJson"):
        try:
            frame = re.search(r"(?m)^\{", rendered)
            if frame is None:
                raise ValueError("No JSON object frame begins a terminal line")
            value, end = json.JSONDecoder().raw_decode(rendered[frame.start():])
            result["parsedJson"] = value
            # A PTY merges stdout and stderr. Preserve trailing diagnostics;
            # this frame extraction does not assert machine-stdout purity.
            result["jsonDiagnosticTail"] = rendered[frame.start() + end:]
        except ValueError as error:
            failure = "Could not decode the terminal JSON frame: " + str(error)
            result["failure"] = failure
    print(json.dumps(result))
    return 0 if failure is None else 1


if __name__ == "__main__":
    sys.exit(main())
