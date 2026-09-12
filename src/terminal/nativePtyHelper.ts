/**
 * Executed ONLY as the command inside the Linux Bubblewrap namespace. Keeping
 * the helper in a TS string includes it in dist without a package copy step.
 * Python's stdlib allocates a real PTY; the outer pipes carry framed control,
 * not the shell's terminal. No host-side shell/helper is used as a fallback.
 * Requires Python 3.11+ and Linux devpts. This source is not platform evidence.
 */
export const NATIVE_PTY_HELPER = String.raw`
import base64
import errno
import fcntl
import json
import os
import select
import signal
import struct
import sys
import termios
import time

MAX_FRAME = 65536
MAX_INPUT = 16384
MAX_PENDING = 262144

def emit(value):
    payload = (json.dumps(value, separators=(",", ":")) + "\n").encode("ascii")
    while payload:
        written = os.write(1, payload)
        if written <= 0:
            raise RuntimeError("closed output")
        payload = payload[written:]

def dimensions(cols, rows):
    if type(cols) is not int or type(rows) is not int or not 1 <= cols <= 1000 or not 1 <= rows <= 1000:
        raise ValueError("Invalid terminal dimensions.")
    return struct.pack("HHHH", rows, cols, 0, 0)

def main():
    if sys.version_info < (3, 11) or sys.platform != "linux":
        raise RuntimeError("The confined PTY helper requires Linux and Python 3.11+.")
    cols, rows = int(sys.argv[1]), int(sys.argv[2])
    master, slave = os.openpty()
    if not os.isatty(master) or not os.isatty(slave):
        raise RuntimeError("A real PTY could not be allocated.")
    fcntl.ioctl(slave, termios.TIOCSWINSZ, dimensions(cols, rows))
    pid = os.fork()
    if pid == 0:
        try:
            os.close(master)
            os.login_tty(slave)
            os.closerange(3, 65536)
            os.execve("/bin/sh", ["/bin/sh", "-i"], {
                "PATH": "/usr/bin:/bin", "HOME": "/tmp", "TMPDIR": "/tmp",
                "LANG": "C.UTF-8", "TERM": "xterm-256color", "PS1": "$ "
            })
        except BaseException:
            os.write(2, b"AMC confined shell failed to start.\r\n")
            os._exit(127)
    os.close(slave)
    os.set_blocking(master, False)
    os.set_blocking(0, False)
    emit({"type": "ready", "protocol": 1, "kind": "pty"})
    incoming = bytearray()
    pending = []
    pending_bytes = 0
    child_status = None
    drain_until = None
    master_open = True
    last_id = 0
    try:
        while True:
            if child_status is None:
                waited, status = os.waitpid(pid, os.WNOHANG)
                if waited == pid:
                    child_status = status
                    drain_until = time.monotonic() + 0.25
            if child_status is not None and (not master_open or time.monotonic() >= drain_until):
                break
            readable = [0] + ([master] if master_open else [])
            writable = [master] if master_open and pending and child_status is None else []
            readers, writers, _ = select.select(readable, writable, [], 0.05)
            if 0 in readers:
                chunk = os.read(0, MAX_FRAME)
                if not chunk:
                    # Exiting the namespace's initial command also tears down
                    # its remaining descendants via Bubblewrap's PID-1 reaper.
                    return 143
                incoming.extend(chunk)
                while b"\n" in incoming:
                    line, _, rest = incoming.partition(b"\n")
                    incoming = bytearray(rest)
                    if len(line) > MAX_FRAME:
                        raise ValueError("Terminal control frame is too large.")
                    frame = json.loads(line)
                    if type(frame) is not dict:
                        raise ValueError("Invalid terminal control frame.")
                    seq = frame.get("id")
                    if type(seq) is not int or seq <= last_id:
                        raise ValueError("Invalid terminal control sequence.")
                    last_id = seq
                    if frame.get("op") == "input":
                        data = base64.b64decode(frame.get("data", ""), validate=True)
                        if not data or len(data) > MAX_INPUT or pending_bytes + len(data) > MAX_PENDING:
                            raise ValueError("Terminal input budget exceeded.")
                        if child_status is not None or not master_open:
                            raise ValueError("The terminal has exited.")
                        pending.append([seq, data])
                        pending_bytes += len(data)
                    elif frame.get("op") == "resize":
                        if not master_open:
                            raise ValueError("The terminal has exited.")
                        fcntl.ioctl(master, termios.TIOCSWINSZ, dimensions(frame.get("cols"), frame.get("rows")))
                        emit({"type": "ack", "id": seq})
                    else:
                        raise ValueError("Unknown terminal operation.")
                if len(incoming) > MAX_FRAME:
                    raise ValueError("Terminal control frame is too large.")
            if master in writers:
                seq, data = pending[0]
                try:
                    written = os.write(master, data)
                except BlockingIOError:
                    written = 0
                pending_bytes -= written
                if written == len(data):
                    pending.pop(0)
                    emit({"type": "ack", "id": seq})
                elif written:
                    pending[0][1] = data[written:]
            if master_open and master in readers:
                try:
                    data = os.read(master, 32768)
                except BlockingIOError:
                    continue
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    data = b""
                if data:
                    emit({"type": "data", "data": base64.b64encode(data).decode("ascii")})
                else:
                    master_open = False
        code = os.WEXITSTATUS(child_status) if os.WIFEXITED(child_status) else None
        sig = os.WTERMSIG(child_status) if os.WIFSIGNALED(child_status) else None
        emit({"type": "exit", "code": code, "signal": sig, "outputComplete": not master_open})
        return code if code is not None else 128 + (sig or 0)
    finally:
        os.close(master)

try:
    sys.exit(main())
except Exception:
    # Do not expose arbitrary exceptions, host paths, or control/input payloads.
    try:
        emit({"type": "error", "message": "Confined PTY helper or control protocol failed."})
    finally:
        sys.exit(125)
`;
