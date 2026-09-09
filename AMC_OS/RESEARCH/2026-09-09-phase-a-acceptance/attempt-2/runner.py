"""Author-only supervisor for the integrated candidate's isolated release gate."""
import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import signal
import subprocess
import sys
import tempfile
import time

RECORD = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('/Users/sid/AgentMaturityCompass')
NODE = '/opt/homebrew/opt/node@22/bin/node'
PNPM = '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs'
POLL_SECONDS = 0.2
CLEANUP_SECONDS = 20
MAX_OBSERVED_PROCESSES = 10000
requested_signal = None


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def interrupted(signum, _frame):
    # Do not raise through finally. Polling observes the first signal and cleans
    # up; repeated signals cannot bypass cleanup or receipt finalization.
    global requested_signal
    if requested_signal is None:
        requested_signal = signum


def write_json(path, value, exclusive=False):
    with path.open('x' if exclusive else 'w') as handle:
        handle.write(json.dumps(value, indent=2) + '\n')
        handle.flush()
        os.fsync(handle.fileno())


def process_snapshot():
    # No command lines/environments: do not inspect unrelated process secrets.
    result = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,pgid=,uid=,lstart='],
                            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'},
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=2, check=True, text=True)
    rows = {}
    for line in result.stdout.splitlines():
        parts = line.split(None, 4)
        if len(parts) != 5:
            raise RuntimeError('Process identity snapshot has an unsupported format')
        pid, ppid, pgid, uid = map(int, parts[:4])
        rows[pid] = dict(pid=pid, ppid=ppid, pgid=pgid, uid=uid,
                         started=' '.join(parts[4].split()))
    return rows


def identity(row):
    return (row['pid'], row['uid'], row['started'])


class OwnedDescendants:
    """Retain observed ancestry across reparenting; never use a stale PID alone."""
    def __init__(self, proc):
        self.proc, self.root_identity = proc, None
        self.known, self.groups, self.sent = {}, set(), set()
        self.observations, self.errors, self.actions = 0, [], []

    def observe(self):
        # Capture even a fast-exiting direct child before reaping its zombie:
        # its PID cannot be recycled while it remains our unreaped child.
        if self.root_identity is not None:
            self.proc.poll()
        snapshot = process_snapshot()
        self.observations += 1
        root = snapshot.get(self.proc.pid)
        if self.root_identity is None and root is not None:
            if root['ppid'] != os.getpid() or root['pgid'] != self.proc.pid or root['uid'] != os.getuid():
                raise RuntimeError('Spawned command identity does not match its owned session')
            self.root_identity = identity(root)
            self.known[self.root_identity] = {**root, 'firstObservedAt': utc(), 'via': 'spawned-child'}
        while True:
            live = {pid: row for pid, row in snapshot.items() if identity(row) in self.known}
            self.groups.update(row['pgid'] for row in live.values() if row['pid'] == row['pgid'])
            anchored = {row['pgid'] for row in live.values() if row['pgid'] in self.groups}
            additions = [(row, 'observed-parent' if row['ppid'] in live else 'live-owned-group')
                         for row in snapshot.values() if identity(row) not in self.known
                         and (row['ppid'] in live or row['pgid'] in anchored)]
            if not additions:
                return snapshot
            if len(self.known) + len(additions) > MAX_OBSERVED_PROCESSES:
                raise RuntimeError('Owned process tracking bound exceeded; qualification refused')
            for row, via in additions:
                self.known[identity(row)] = {**row, 'firstObservedAt': utc(), 'via': via}

    def remaining(self, snapshot):
        live = [row for row in snapshot.values() if identity(row) in self.known]
        ambiguous = [row for row in snapshot.values()
                     if row['pgid'] in self.groups and identity(row) not in self.known]
        return live, ambiguous

    def signal_owned(self, sig, deadline):
        live, _ = self.remaining(self.observe())
        # Freeze the ordinary gate scheduler first. Detached groups are separate
        # owned groups discovered from its live ancestry, not the pnpm PGID.
        groups = sorted({row['pgid'] for row in live}, key=lambda pgid: (pgid != self.proc.pid, pgid))
        for pgid in groups:
            if time.monotonic() >= deadline:
                return
            fresh = self.observe()
            members = [row for row in fresh.values() if row['pgid'] == pgid]
            if pgid not in self.groups or not members or any(identity(row) not in self.known for row in members):
                continue
            key = (sig, pgid, tuple(sorted(identity(row) for row in members)))
            if key in self.sent:
                continue
            self.sent.add(key)
            action = dict(signal=sig.name, pgid=pgid, members=members, at=utc())
            try:
                os.killpg(pgid, sig)
                action['outcome'] = 'sent'
            except ProcessLookupError:
                action['outcome'] = 'already-absent'
            except OSError as exc:
                action['outcome'] = 'refused-or-failed'
                action['error'] = f'{type(exc).__name__}: {exc}'
                self.errors.append(action['error'])
            self.actions.append(action)

    def cleanup(self):
        deadline = time.monotonic() + CLEANUP_SECONDS
        closed, live, ambiguous = False, [], []
        try:
            self.signal_owned(signal.SIGSTOP, min(deadline, time.monotonic() + 2))
            for sig, grace in ((signal.SIGTERM, 8), (signal.SIGKILL, 8)):
                phase_end = min(deadline, time.monotonic() + grace)
                while time.monotonic() < phase_end:
                    self.signal_owned(sig, deadline)
                    if sig == signal.SIGTERM:
                        self.signal_owned(signal.SIGCONT, deadline)
                    live, ambiguous = self.remaining(self.observe())
                    if not live and not ambiguous:
                        time.sleep(POLL_SECONDS)
                        live, ambiguous = self.remaining(self.observe())
                        closed = self.root_identity is not None and not live and not ambiguous
                        if closed:
                            break
                    time.sleep(POLL_SECONDS)
                if closed:
                    break
        except BaseException as exc:
            self.errors.append(f'{type(exc).__name__}: {exc}')
        self.proc.poll()
        return dict(confirmedClosed=closed and self.proc.returncode is not None and not self.errors,
                    scope='observed-owned-descendant-identities-and-owned-groups',
                    rootIdentity=self.root_identity, rootReaped=self.proc.returncode is not None,
                    observations=self.observations, ownedProcesses=list(self.known.values()),
                    ownedGroups=sorted(self.groups), remainingOwned=live, ambiguousGroupMembers=ambiguous,
                    signals=self.actions, errors=self.errors,
                    trackingBoundary='Sampled ancestry/live-group membership, not kernel containment. '
                    'Unobserved daemon reparenting, same-second PID reuse and the final identity-check/signal race remain possible.')


def supervised(label, args, cwd, env, timeout, state, save):
    if requested_signal is not None:
        raise InterruptedError('Signal received before command launch')
    process_snapshot()  # Refuse before launch if identity observation is unavailable.
    if requested_signal is not None:
        raise InterruptedError('Signal received during command preflight')
    started = time.monotonic()
    command = dict(label=label, command=args, startedAt=utc(), timeoutSeconds=timeout,
                   exitCode=None, timedOut=False, interrupted=False, cleanup=None)
    proc, tracker = None, None
    try:
        with (RECORD / (label + '.log')).open('x') as log:
            proc = subprocess.Popen(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            tracker = OwnedDescendants(proc)
            state['active'] = dict(label=label, pid=proc.pid, command=args)
            save()
            while True:
                tracker.observe()
                if requested_signal is not None:
                    command['interrupted'] = True
                    command['signal'] = signal.Signals(requested_signal).name
                    break
                if proc.returncode is not None:
                    break
                if time.monotonic() - started >= timeout:
                    command['timedOut'] = True
                    break
                time.sleep(POLL_SECONDS)
    except BaseException as exc:
        command['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        if tracker is not None:
            command['cleanup'] = tracker.cleanup()
            command['exitCode'] = proc.returncode
        else:
            command['cleanup'] = dict(confirmedClosed=False, reason='No supervised child identity established')
        command['elapsedSeconds'], command['endedAt'] = time.monotonic() - started, utc()
        write_json(RECORD / (label + '-process.json'), command, exclusive=True)
        state['commands'].append(command)
        state['active'] = None if command['cleanup']['confirmedClosed'] else dict(
            label=label, pid=proc.pid if proc else None, state='closure-unconfirmed-inspect-owned-identities')
        save()
    if not command['cleanup']['confirmedClosed']:
        raise RuntimeError(f'{label} process closure unconfirmed; no later gate/check is permitted')
    if 'error' in command:
        raise RuntimeError(command['error'])
    if command['interrupted'] or requested_signal is not None:
        raise InterruptedError('Supervisor received ' + signal.Signals(requested_signal).name)
    if command['timedOut']:
        raise TimeoutError(f'{label} exceeded its bounded runtime')
    return command['exitCode']


def metadata(args, cwd, env):
    """Bounded short git/runtime reads; these do not start detached gate steps."""
    if requested_signal is not None:
        raise InterruptedError('Signal received before metadata command')
    proc = subprocess.Popen(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, text=True)
    try:
        stdout, stderr = proc.communicate(timeout=30)
        if requested_signal is not None:
            raise InterruptedError('Signal received during metadata command')
        if proc.returncode != 0:
            raise RuntimeError(f'Metadata command failed: {args!r}: {stderr}')
        return stdout.strip()
    finally:
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait(timeout=3)


def main():
    if os.name != 'posix' or len(sys.argv) != 2 or not re.fullmatch(r'[a-f0-9]{40}', sys.argv[1]):
        raise SystemExit('Usage: runner.py <exact committed source SHA>; POSIX observation required')
    if (RECORD / 'source.json').exists():
        raise SystemExit('Refusing to overwrite an earlier attempt')
    os.umask(0o077)
    base = pathlib.Path(tempfile.mkdtemp(prefix='amc-phase-a-acceptance-20260909-', dir='/private/tmp'))
    clone, home, temporary = base / 'checkout', base / 'home', base / 'tmp'
    home.mkdir()
    temporary.mkdir()
    env = {'PATH': str(pathlib.Path(NODE).parent) + ':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
           'HOME': str(home), 'TMPDIR': str(temporary), 'CI': '1', 'LANG': 'en_US.UTF-8',
           'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0',
           'npm_config_userconfig': str(home / '.npmrc'), 'npm_config_globalconfig': str(home / '.npmrc-global'),
           'npm_config_cache': str(home / '.npm'), 'npm_config_global': 'false',
           'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_CACHE_HOME': str(home / '.cache'),
           'XDG_DATA_HOME': str(home / '.local/share')}
    for name in ('.npmrc', '.npmrc-global'):
        (home / name).write_text('')
    state = dict(source=sys.argv[1], clone=str(clone), home=str(home), env=env, startedAt=utc(),
                 environment=dict(os=platform.system(), release=platform.release(), arch=platform.machine()),
                 commands=[], status='running', runnerSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                 boundary='Local integrated source/package gate; no human study, platform matrix, live deployment or superiority qualification')
    write_json(RECORD / 'source.json', state, exclusive=True)
    save = lambda: write_json(RECORD / 'source.json', state)
    try:
        source = metadata(['git', 'rev-parse', sys.argv[1] + '^{commit}'], ROOT, env)
        if source != sys.argv[1]:
            raise RuntimeError('Source pin mismatch')
        state['environment']['node'] = metadata([NODE, '--version'], ROOT, env)
        if not state['environment']['node'].startswith('v22.'):
            raise RuntimeError('Node 22 is required')
        if supervised('clone', ['git', 'clone', '--quiet', '--no-local', '--no-hardlinks', '--no-checkout', str(ROOT), str(clone)], base, env, 300, state, save) != 0:
            raise RuntimeError('Fresh clone failed')
        if supervised('checkout', ['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', source], clone, env, 120, state, save) != 0:
            raise RuntimeError('Pinned checkout failed')
        state['cleanBeforeInstall'] = metadata(['git', 'status', '--porcelain'], clone, env) == ''
        if not state['cleanBeforeInstall']:
            raise RuntimeError('Fresh candidate is not clean')
        for label, args, timeout in [
            ('install', [NODE, PNPM, 'install', '--frozen-lockfile'], 900),
            ('release-gate', [NODE, PNPM, 'release:gate', '--out', str(RECORD / 'release-gate.json')], 3600),
            ('clean-source', [NODE, 'scripts/clean-source-check.mjs', '--keep'], 1800),
        ]:
            code = supervised(label, args, clone, env, timeout, state, save)
            print(json.dumps(dict(source=source, step=label, exitCode=code, clone=str(clone))), flush=True)
            if code != 0:
                state['status'] = 'failed'
                break
        else:
            state['status'] = 'completed'
        state['trackedDeltaAfter'] = metadata(['git', 'diff', '--stat'], clone, env)
    except BaseException as exc:
        state['status'] = 'interrupted' if requested_signal is not None else 'failed'
        state['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        state['endedAt'] = utc()
        state['allObservedCommandProcessesClosed'] = all(row['cleanup']['confirmedClosed'] for row in state['commands']) if state['commands'] else None
        if state['allObservedCommandProcessesClosed'] is False:
            state['status'] = 'closure-unconfirmed'
        state['retainedArtifacts'] = 'Private clone, temporary fixtures, logs and per-command process evidence retained; no automatic deletion'
        save()
    return 0 if state['status'] == 'completed' else 1


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    sys.exit(main())
