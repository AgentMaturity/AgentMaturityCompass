"""UNEXECUTED private process wrapper; no P1-01 directories are prepared by authoring it.

Usage: python3 THIS.py [--observe] PHASE 22 CWD COMMAND [ARG ...]
Root must first prepare the assigned repository, BASE and BASE/home.
Observed commands must be direct Node/Vitest invocations with their full original
argv, the frozen reporter below, and one explicit --outputFile[.json] path below
BASE (outside home/store). No command arguments or test deadlines are rewritten.
Vitest keeps its own producer-write semantics. After normal exit and owned-group
absence, raw.json is an exclusive, byte-identical snapshot of that fresh producer.
The frozen reporter uses its disclosed legacy P021 environment key and writes wx.
The wrapper inherits environment, overriding HOME, Node PATH, GIT_NO_LAZY_FETCH
and, only when observed, that reporter output key. It is not an isolation layer.
There is no outer wait timeout, terminating signal, retry or source restoration.
Only the owned PGID is probed; detached descendants are not universally excluded.
"""
from pathlib import Path
import datetime
import errno
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time

BASE = Path('/private/tmp/p1-01-qualification-20261015')
ROOT = Path('/Users/sid/.codex/worktrees/p1-01-qualification/AgentMaturityCompass')
REPORTER = Path('/private/tmp/p0-21-qualification-20261015/observer-reporter.mjs')
REPORTER_SHA = '4eddb7dd8e92bd4522c4b6a763f84630105dfc008efae6429786ccd2a229f447'
ACTIVE, HALTED = BASE / 'ACTIVE.json', BASE / 'HALTED.json'
JOURNAL = Path('/private/tmp/p1-01-commands-20261015.jsonl')


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def write_new(path, value):
    with Path(path).open('x') as out:
        os.fchmod(out.fileno(), 0o600)
        json.dump(value, out)
        out.write('\n')


def pin(path):
    data = Path(path).read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def probe(pgid):
    try:
        os.killpg(pgid, 0)
    except OSError as error:
        return {'capturedUtc': stamp(), 'pgid': pgid, 'signal': 0,
                'absentByESRCH': error.errno == errno.ESRCH, 'errno': error.errno}
    return {'capturedUtc': stamp(), 'pgid': pgid, 'signal': 0,
            'absentByESRCH': False, 'errno': None}


def producer_path(argv, directory):
    values = []
    for index, arg in enumerate(argv):
        if arg in ['--outputFile', '--outputFile.json']:
            require(index + 1 < len(argv), 'Missing JSON producer argument')
            values.append(argv[index + 1])
        elif arg.startswith(('--outputFile=', '--outputFile.json=')):
            values.append(arg.split('=', 1)[1])
    require(len(values) == 1, 'Observed argv requires one explicit JSON producer path')
    path = Path(values[0])
    require(path.is_absolute(), 'JSON producer path must be absolute')
    path = path.resolve()
    require(path.is_relative_to(BASE.resolve()) and
            not any(path == root or root in path.parents for root in [BASE / 'home', BASE / 'store'])
            and path not in [ACTIVE, HALTED, JOURNAL]
            and path not in [directory / n for n in ['raw.json', 'observer.json', 'command.json',
                                                    'stdout-stderr.log', 'owned-process.json',
                                                    'owned-group-after-exit.json']],
            'JSON producer must be a distinct owned BASE path outside home/store')
    require(not path.exists() and not path.is_symlink(), 'JSON producer already exists')
    require(path.parent.is_dir() or path.parent == directory, 'Prepare the JSON producer parent first')
    return path


def main():
    args = sys.argv[1:]
    observed = bool(args and args[0] == '--observe')
    if observed:
        args = args[1:]
    require(len(args) >= 4, 'Expected PHASE 22 CWD COMMAND [ARG ...]')
    phase, major, cwd, *cmd = args
    require(re.fullmatch('[a-z0-9][a-z0-9-]*', phase) and major == '22', 'Invalid phase or Node major')
    require(Path(cwd).is_absolute() and Path(cwd).resolve() == ROOT.resolve() and ROOT.is_dir() and
            BASE.is_dir() and (BASE / 'home').is_dir(), 'Root must prepare assigned repository, BASE and HOME first')
    require(not ACTIVE.exists() and not HALTED.exists(), 'ACTIVE/HALTED forbids another command')
    directory = BASE / ('command-' + phase)
    require(not directory.exists(), 'Command phase already exists; no retry or overwrite')
    raw_producer = None
    if observed:
        require(pin(REPORTER)['sha256'] == REPORTER_SHA, 'Frozen reporter changed')
        require(len(cmd) >= 3 and cmd[2] == 'run' and
                Path(cmd[0]).resolve() == Path('/opt/homebrew/opt/node@22/bin/node').resolve() and
                (Path(cwd) / cmd[1]).resolve() == (ROOT / 'node_modules/vitest/vitest.mjs').resolve(),
                'Observed command must invoke the pinned Node/Vitest directly')
        require(cmd.count('--reporter=' + str(REPORTER)) == 1 and
                cmd.count('--reporter=json') == 1, 'Pass the full original reporter argv explicitly')
        raw_producer = producer_path(cmd, directory)
    env = dict(os.environ)
    env['PATH'] = '/opt/homebrew/opt/node@22/bin:' + env.get('PATH', '')
    env['HOME'], env['GIT_NO_LAZY_FETCH'] = str(BASE / 'home'), '1'
    if observed:
        env['AMC_P021_RUNTIME_OBSERVER_PATH'] = str(directory / 'observer.json')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=cwd, env=env, text=True).strip()
    intent = {'phase': phase, 'directory': str(directory), 'startedUtc': stamp(),
              'state': 'launching; retained on uncertainty; no automatic retry/restoration'}
    with ACTIVE.open('x') as out:
        json.dump(intent, out)
        out.write('\n')
    try:
        directory.mkdir(mode=0o700)
        log = directory / 'stdout-stderr.log'
        started = time.monotonic()
        with log.open('x') as streams:
            os.fchmod(streams.fileno(), 0o600)
            child = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=streams,
                                     stderr=subprocess.STDOUT, start_new_session=True)
            try:
                pgid = os.getpgid(child.pid)
            except ProcessLookupError:
                pgid = None
            owned = {'pid': child.pid, 'ownedPgid': child.pid, 'observedPgidAfterLaunch': pgid,
                     'cwd': cwd, 'argv': cmd, 'startedUtc': intent['startedUtc'],
                     'environmentPolicy': 'Inherited environment; private HOME and Node22 PATH; no isolation claim.',
                     'overriddenEnvironmentKeys': ['PATH', 'HOME', 'GIT_NO_LAZY_FETCH'] +
                         (['AMC_P021_RUNTIME_OBSERVER_PATH'] if observed else [])}
            write_new(directory / 'owned-process.json', owned)
            code = child.wait()  # No added outer deadline; preserve original test/helper timeouts.
        process_ms = round((time.monotonic() - started) * 1000)
        deadline, probes = time.monotonic() + 5.0, []
        while True:
            probes.append(probe(child.pid))
            if probes[-1]['absentByESRCH'] or time.monotonic() >= deadline:
                break
            time.sleep(min(0.05, max(0, deadline - time.monotonic())))
        write_new(directory / 'owned-group-after-exit.json',
                  {'exit': code, 'processDurationMs': process_ms, 'observations': probes,
                   'maxPollingSeconds': 5, 'pollIntervalSeconds': 0.05,
                   'signalsOtherThanZeroSent': False})
        require(code in [0, 1] and pgid in [None, child.pid] and probes[-1]['absentByESRCH'],
                'Normal exit0/1 and owned-group absence were not established; stop')
        artifacts = {}
        if observed:
            require(raw_producer.is_file() and not raw_producer.is_symlink(), 'Missing regular raw producer')
            data = raw_producer.read_bytes()
            require(data, 'Empty raw producer')
            observer = json.loads((directory / 'observer.json').read_text())
            require(observer['pid'] == child.pid and observer['cwd'] == cwd, 'Observer PID/cwd differs')
            with (directory / 'raw.json').open('xb') as out:
                os.fchmod(out.fileno(), 0o600)
                out.write(data)
            artifacts = {'rawProducer': pin(raw_producer), 'rawSnapshot': pin(directory / 'raw.json'),
                         'observer': pin(directory / 'observer.json'), 'reporter': pin(REPORTER)}
            require(artifacts['rawProducer']['sha256'] == artifacts['rawSnapshot']['sha256'], 'Raw snapshot mismatch')
        final_head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=cwd, env=env, text=True).strip()
        require(final_head == head, 'Source HEAD changed during command')
        row = {'phase': phase, 'major': major, 'cwd': cwd, 'cmd': shlex.join(cmd), 'exit': code,
               'durationMs': process_ms, 'startedUtc': intent['startedUtc'], 'endedUtc': stamp(),
               'log': str(log), 'head': head, 'headAfter': final_head, 'ownedProcess': owned,
               'groupAbsentByESRCH': True, 'signalsOtherThanZeroSent': False, 'observed': observed,
               'artifacts': artifacts, 'boundary': 'Process metadata only; raw/observer/late diagnostics require review. No universal descendant or filesystem-isolation proof.'}
        write_new(directory / 'command.json', row)
        with JOURNAL.open('a') as out:
            out.write(json.dumps(row) + '\n')
        require(json.loads(ACTIVE.read_text()) == intent, 'Owned ACTIVE marker changed')
        ACTIVE.unlink()  # Only this normally completed wrapper's private marker.
        print(json.dumps(row), flush=True)
        return code
    except BaseException as error:
        if not HALTED.exists():
            write_new(HALTED, {'phase': phase, 'capturedUtc': stamp(), 'errorType': type(error).__name__,
                              'message': str(error), 'boundary': 'ACTIVE and owned artifacts retained; no signals, retries, cleanup or restoration.'})
        raise


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BaseException as error:
        if isinstance(error, SystemExit):
            raise
        print('P101 wrapper incomplete: ' + str(error), file=sys.stderr, flush=True)
        sys.exit(70)
