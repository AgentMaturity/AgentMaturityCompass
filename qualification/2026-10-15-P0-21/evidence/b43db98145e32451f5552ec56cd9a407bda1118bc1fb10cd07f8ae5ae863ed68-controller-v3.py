"""Prepared only: one hash-released P0-21 source-mode B/M/R control per invocation."""
from pathlib import Path
import argparse
import collections
import errno
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

BASE = Path('/private/tmp/p0-21-causal-qualification-20261015')
ROOT = Path('/Users/sid/.codex/worktrees/p0-21-qualification/AgentMaturityCompass')
COPY = BASE / 'closure'
ACTIVE = BASE / 'ACTIVE'
NODE = Path('/opt/homebrew/Cellar/node@22/22.23.3_2/bin/node')
LATE = [r'Unhandled Errors?', r'Unhandled Rejection', r'uncaught exception',
        r'Error during teardown', r'Tests modified the repository workspace',
        r'Hook timed out', r'Error:.*global.?teardown', r'ELIFECYCLE',
        r'error during close', r'close timed out', r'error during global teardown',
        r'Tests closed successfully but something prevents']

class Stop(Exception):
    pass

def stamp():
    return datetime.now(timezone.utc).isoformat()

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def read(path):
    return json.loads(Path(path).read_text())

def require(ok, message):
    if not ok:
        raise Stop(message)

def write_new(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')

def pin(path):
    path = Path(path)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}

def native_now(path):
    out = pin(path)
    s = Path(path).stat()
    out.update(device=s.st_dev, inode=s.st_ino, nlink=s.st_nlink, mode=s.st_mode & 0o7777)
    return out

def file_map(directory):
    result = {}
    for parent, directories, files in os.walk(directory, followlinks=False):
        if Path(parent) == directory:
            directories[:] = [name for name in directories if name != 'node_modules']
        for name in directories:
            require(not (Path(parent) / name).is_symlink(), 'Unexpected private directory symlink')
        for name in files:
            path = Path(parent) / name
            require(not path.is_symlink(), 'Unexpected private file symlink: ' + str(path))
            result[str(path.relative_to(directory))] = digest(path)
    return result

def check_inputs(expected_source):
    preservation = read(BASE / 'inputs/preservation.json')
    setup = read(BASE / 'setup-v3.json')
    own_changed = [p['path'] for p in setup['frozenOwnInputs']
                   if not Path(p['path']).is_file() or digest(p['path']) != p['sha256']]
    require(not own_changed, 'Frozen controller/proposal/observer/input changed: ' + str(own_changed))
    source = read(BASE / 'inputs/source-manifest.json')
    compiled = read(BASE / 'inputs/compiled-manifest.json')
    require(len(source) == 7945 and len(compiled) == 4529, 'Unexpected fixed manifest cardinality')
    require(not (COPY / '.git').exists(), 'The filesystem copy must not acquire .git')
    link = preservation['nodeModulesLink']
    require((COPY / 'node_modules').is_symlink(), 'Missing explicit borrowed dependency symlink')
    require(os.readlink(COPY / 'node_modules') == link['target'], 'Resolver link changed')
    require(str((COPY / 'node_modules').resolve()) == link['resolved'], 'Resolver target changed')
    root_changed = [rel for rel, value in (source | compiled).items()
                    if not (ROOT / rel).is_file() or digest(ROOT / rel) != value]
    actual_dist = {str(p.relative_to(ROOT)) for p in (ROOT / 'dist').rglob('*') if p.is_file()}
    require(actual_dist == set(compiled), 'Parent compiled file membership changed')
    private = file_map(COPY)
    expected = expected_source | compiled
    private_changed = [rel for rel in sorted(set(private) | set(expected)) if private.get(rel) != expected.get(rel)]
    external_changed = [p['path'] for p in preservation['immutableInputs']
                        if not Path(p['path']).is_file() or digest(p['path']) != p['sha256']]
    current_native = native_now(preservation['borrowedNative']['path'])
    require(not root_changed and not private_changed and not external_changed,
            'Input changes: ' + json.dumps({'parent': root_changed, 'private': private_changed,
                                           'external': external_changed}))
    require(current_native == preservation['borrowedNative'], 'Borrowed native bytes/identity changed')
    return {'capturedUtc': stamp(), 'parentTrackedChecked': len(source),
            'parentCompiledChecked': len(compiled), 'privateFilesChecked': len(private),
            'parentDelta': root_changed, 'privateUnexpectedDelta': private_changed,
            'immutableExternalDelta': external_changed, 'native': current_native,
            'expectedSourceDeviations': [rel for rel in source if source[rel] != expected_source[rel]],
            'privateHashMapSha256': hashlib.sha256(json.dumps(private, sort_keys=True).encode()).hexdigest(),
            'processBoundary': 'File bytes only; dependency/cache universe and detached descendants are not proven absent.'}

def group_probe(pgid):
    try:
        os.killpg(pgid, 0)
    except OSError as error:
        return {'capturedUtc': stamp(), 'pgid': pgid, 'signal': 0,
                'absentByESRCH': error.errno == errno.ESRCH, 'errno': error.errno,
                'detail': str(error)}
    return {'capturedUtc': stamp(), 'pgid': pgid, 'signal': 0, 'absentByESRCH': False,
            'errno': None, 'detail': 'Owned process group still exists'}

def classify(raw_path, observer_path, log_path, process_exit, stage):
    raw = read(raw_path)
    observed = read(observer_path)
    identities = read(BASE / 'inputs/case-identities.json')
    wanted = {(r['file'], r['fullName']) for r in identities}
    corpus = set(read(BASE / 'proposal.json')['corpus'])
    require(len(wanted) == 37 and len(identities) == 37, 'Nonunique fixed case identities')
    require(observed['testCount'] == 37 and observed['unhandledErrors'] == [], 'Observer incomplete/unhandled errors')
    require(observed['cwd'] == str(COPY), 'Observer cwd is not the owned copy')
    require(observed['reason'] in ['passed', 'failed'], 'Observer run interrupted or unrecognized')
    require({str(Path(p).relative_to(COPY)) for p in observed['files']} == corpus, 'Observer file mismatch')
    obs_tests = {}
    current_file = None
    for task in observed['tasks']:
        require(all(value == 'pass' for value in task['hooks'].values()), 'A hook did not pass')
        if task['kind'] == 'file':
            current_file = str(Path(task['filepath']).relative_to(COPY))
        if task['kind'] != 'test':
            require(task['errors'] == [], 'Non-body file/suite error')
            continue
        key = (current_file, task['fullName'])
        require(key not in obs_tests, 'Duplicate observer test identity')
        require(task['state'] in ['pass', 'fail'], 'Observer pending/skipped/unknown test')
        obs_tests[key] = task
    require(set(obs_tests) == wanted, 'Observer case membership differs')
    raw_tests = {}
    failures = []
    for file in raw['testResults']:
        rel = str(Path(file['name']).relative_to(COPY))
        require(rel in corpus and file.get('message', '') == '', 'File/setup diagnostic in raw report')
        for test in file['assertionResults']:
            key = (rel, test['fullName'])
            require(key not in raw_tests, 'Duplicate raw case identity')
            require(test['status'] in ['passed', 'failed'], 'Raw pending/skipped/unknown case')
            raw_tests[key] = test
    require(set(raw_tests) == wanted, 'Raw case membership differs')
    require(raw['numTotalTests'] == 37 and raw['numPendingTests'] == 0
            and raw['numTodoTests'] == 0 and raw['numPendingTestSuites'] == 0, 'Incomplete raw test count')
    for key in sorted(wanted):
        raw_test = raw_tests[key]
        obs = obs_tests[key]
        require((obs['state'] == 'pass') == (raw_test['status'] == 'passed'), 'Raw/observer state mismatch')
        if raw_test['status'] == 'passed':
            require(obs['errors'] == [] and raw_test['failureMessages'] == [], 'Passed case has errors')
            continue
        errors = obs['errors']
        require(errors and raw_test['failureMessages'], 'Failed case lacks serialized errors')
        require(all(error.get('name') == 'AssertionError' for error in errors), 'Failed case is not solely a body AssertionError')
        messages = '\n'.join(raw_test['failureMessages'])
        ansi = re.compile(r'\x1b\[[0-9;]*m')
        plain = ansi.sub('', messages).replace('\r\n', '\n')
        for error in errors:
            message = ansi.sub('', str(error.get('message', ''))).replace('\r\n', '\n')
            require(message and message in plain, 'Raw/observer AssertionError message mismatch')
            require('tests/setup/' not in str(error.get('stack', '')), 'Setup/hook stack cannot qualify a body failure')
        failures.append({'file': key[0], 'fullName': key[1], 'rawFailureMessages': raw_test['failureMessages'],
                         'observerErrors': errors})
    log = Path(log_path).read_text(errors='replace')
    late = [pattern for pattern in LATE if re.search(pattern, log, flags=re.IGNORECASE)]
    require(not late, 'Known late/unhandled/teardown diagnostic: ' + str(late))
    require(raw['numFailedTests'] == len(failures) and raw['numPassedTests'] == 37 - len(failures), 'Counter disagreement')
    if failures:
        require(stage == 'mutant' and process_exit == 1 and raw['success'] is False
                and observed['reason'] == 'failed', 'Non-mutant failure or inconsistent process result')
        verdict = 'body-assertion-failures-observed'
    else:
        require(process_exit == 0 and raw['success'] is True and raw['numFailedTestSuites'] == 0
                and observed['reason'] == 'passed', 'Success counters do not prove successful execution')
        verdict = 'survivor' if stage == 'mutant' else 'passed'
    return {'classification': verdict, 'total': 37, 'passed': 37 - len(failures),
            'failed': len(failures), 'pending': 0, 'todo': 0, 'failures': failures,
            'attribution': 'Exact failure bodies retained for root review; nonzero alone is not a causal kill.'}

def run_phase(control, stage, expected_source):
    require(not ACTIVE.exists() and not (BASE / 'HALTED.json').exists(), 'Active/halting marker forbids runtime')
    directory = BASE / 'phases' / (control + '--' + stage)
    directory.mkdir(mode=0o700)
    before = check_inputs(expected_source)
    write_new(directory / 'inputs-before.json', before)
    observer = directory / 'observer.json'
    raw = directory / 'raw.json'
    log = directory / 'stdout-stderr.log'
    proposal = read(BASE / 'proposal.json')
    argv = [str(NODE), str(ROOT / 'node_modules/vitest/vitest.mjs'), 'run', *proposal['corpus'],
            '--cache=false', '--maxWorkers=1', '--no-file-parallelism',
            '--reporter=default', '--reporter=json',
            '--reporter=' + str(BASE / 'driver/observer-reporter.mjs'), '--outputFile.json=' + str(raw)]
    env = {'PATH': str(NODE.parent) + ':/usr/bin:/bin:/usr/sbin:/sbin',
           'HOME': str(BASE / 'home'), 'TMPDIR': str(BASE / 'tmp'), 'NODE_ENV': 'test',
           'NO_COLOR': '1', 'GIT_NO_LAZY_FETCH': '1', 'AMC_P021_RUNTIME_OBSERVER_PATH': str(observer)}
    write_new(ACTIVE, {'phase': directory.name, 'startedUtc': stamp(), 'state': 'launching',
                       'note': 'This marker persists on any uncertainty. No automatic process signal or source restoration.'})
    started = time.monotonic()
    with log.open('x') as streams:
        child = subprocess.Popen(argv, cwd=COPY, env=env, stdout=streams, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        try:
            observed_pgid = os.getpgid(child.pid)
        except ProcessLookupError:
            observed_pgid = None
        process = {'startedUtc': stamp(), 'pid': child.pid, 'sessionLeaderExpected': child.pid,
                   'observedPgidAfterLaunch': observed_pgid, 'ownedPgid': child.pid, 'cwd': str(COPY),
                   'argv': argv, 'environmentKeys': sorted(env), 'environmentPolicy': 'Explicit small allowlist; no OS or universal network isolation.',
                   'borrowedDependencies': str(ROOT / 'node_modules'), 'node': pin(NODE)}
        write_new(directory / 'owned-process.json', process)
        try:
            code = child.wait(timeout=90)
        except subprocess.TimeoutExpired:
            write_new(directory / 'timeout.json', {'capturedUtc': stamp(), 'pid': child.pid, 'pgid': child.pid,
                      'timeoutSeconds': 90, 'action': 'No signal, no further wait, no restoration; ACTIVE persists.',
                      'outputFilesMayStillChange': True})
            raise Stop('90-second wait expired; owned process/output lifecycle remains unresolved')
    probe_started = time.monotonic()
    probe_deadline = probe_started + 5.0
    probes = []
    while True:
        probe = group_probe(child.pid)
        probes.append(probe)
        if probe['absentByESRCH']:
            break
        remaining = probe_deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(0.05, remaining))
    write_new(directory / 'owned-group-after-exit.json',
              {'observations': probes, 'lastProbe': probe, 'maxPollingSeconds': 5,
               'pollIntervalSeconds': 0.05, 'signalsOtherThanZeroSent': False})
    write_new(directory / 'command.json', process | {'exit': code, 'endedUtc': stamp(),
              'durationMs': round((time.monotonic() - started) * 1000),
              'groupAbsentByESRCH': probe['absentByESRCH'], 'ownedGroupProbes': probes,
              'groupPollingDurationMs': round((time.monotonic() - probe_started) * 1000)})
    require(probe['absentByESRCH'], 'Owned group remains or is uncertain; no restoration/new runtime')
    require(observed_pgid in [None, child.pid], 'Observed process group was not owned session')
    result = classify(raw, observer, log, code, stage)
    require(read(observer)['pid'] == child.pid, 'Observer PID does not match actual owned Node process')
    write_new(directory / 'inputs-after.json', check_inputs(expected_source))
    write_new(directory / 'classification.json', result)
    write_new(directory / 'artifacts.json', [pin(p) for p in sorted(directory.iterdir()) if p.is_file()])
    ACTIVE.unlink()
    print(json.dumps({'phase': directory.name, 'exit': code, **{k: result[k] for k in ['classification', 'total', 'passed', 'failed', 'pending', 'todo']}}), flush=True)
    return result

def release_check(path, control):
    setup = read(BASE / 'setup-v3.json')
    release = read(path)
    require(release.get('authorization') == 'START_P021_CAUSAL_' + control, 'Exact root START token missing')
    expected = {'setupSha256': digest(BASE / 'setup-v3.json'), 'controllerSha256': digest(Path(__file__)),
                'proposalSha256': digest(BASE / 'proposal.json'),
                'sourceManifestSha256': digest(BASE / 'inputs/source-manifest.json'),
                'compiledManifestSha256': digest(BASE / 'inputs/compiled-manifest.json'),
                'preservationSha256': digest(BASE / 'inputs/preservation.json'),
                'observerSha256': digest(BASE / 'driver/observer-reporter.mjs'),
                'setupIndexSha256': digest(BASE / 'setup-index-v3.json'),
                'setupPath': str(BASE / 'setup-v3.json'),
                'setupIndexPath': str(BASE / 'setup-index-v3.json'),
                'controllerPath': str(Path(__file__).resolve()),
                'closureRoot': str(COPY), 'parentRoot': str(ROOT), 'control': control}
    require(all(release.get(k) == v for k, v in expected.items()), 'Release input-hash binding mismatch')
    require(setup['noMutantWritten'] is True and setup['testExecutionPerformed'] is False, 'Unexpected preparation boundary')
    return expected

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['run'])
    parser.add_argument('--control', required=True)
    parser.add_argument('--release', required=True)
    args = parser.parse_args()
    require(not ACTIVE.exists() and not (BASE / 'HALTED.json').exists(), 'Prior unresolved execution forbids all runtime')
    proposal = read(BASE / 'proposal.json')
    choices = [r for r in proposal['recipes'] if r['id'] == args.control]
    require(len(choices) == 1, 'Unknown or duplicate control')
    recipe = choices[0]
    binding = release_check(args.release, args.control)
    start_marker = BASE / ('started--' + args.control + '.json')
    write_new(start_marker, {'startedUtc': stamp(), 'release': pin(args.release), 'binding': binding,
                            'rule': 'This control cannot be run twice in this namespace.'})
    source = read(BASE / 'inputs/source-manifest.json')
    write_new(BASE / ('before--' + args.control + '.json'), check_inputs(source))
    baseline = run_phase(args.control, 'baseline', source)
    original = (COPY / recipe['file']).read_bytes()
    require(hashlib.sha256(original).hexdigest() == recipe['baselineSha256'], 'Baseline target bytes changed')
    mutated = original.decode()
    for anchor in recipe['anchors']:
        require(mutated.count(anchor['find']) == 1, 'Current source anchor is not exact-once')
        mutated = mutated.replace(anchor['find'], anchor['replace'], 1)
    require(hashlib.sha256(mutated.encode()).hexdigest() == recipe['proposedMutantSha256'], 'Candidate mutation digest mismatch')
    require(not ACTIVE.exists(), 'Process uncertainty forbids writing a mutant')
    (COPY / recipe['file']).write_bytes(mutated.encode())
    expected = source | {recipe['file']: recipe['proposedMutantSha256']}
    mutant = run_phase(args.control, 'mutant', expected)
    require(not ACTIVE.exists(), 'Process uncertainty forbids restoration')
    require(digest(COPY / recipe['file']) == recipe['proposedMutantSha256'], 'Mutant target changed unexpectedly')
    (COPY / recipe['file']).write_bytes(original)
    restored = run_phase(args.control, 'restored', source)
    after = check_inputs(source)
    result = {'control': args.control, 'baseline': baseline, 'mutant': mutant, 'restored': restored,
              'finalPreservation': after, 'restoredExactly': True,
              'verdict': 'survivor' if mutant['classification'] == 'survivor' else 'body-assertion-sensitivity-awaiting-root-attribution',
              'limits': ['No compiler, dist edit, import rewrite or original criteria/config/deadline change.',
                         'Only the owned process group was probed after exit; detached descendants are not universally excluded.',
                         'The root observer precedes global teardown; raw process exit and full streams were separately checked.']}
    write_new(BASE / ('result--' + args.control + '.json'), result)
    print(json.dumps({'control': args.control, 'verdict': result['verdict'], 'restoredExactly': True}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        marker = BASE / 'HALTED.json'
        if not marker.exists():
            write_new(marker, {'capturedUtc': stamp(), 'errorType': type(error).__name__, 'message': str(error),
                      'activeMarkerRetained': ACTIVE.exists(), 'automaticRestorationOnException': False,
                      'rule': 'No automatic signal, retry, cleanup, restoration or further runtime. Root must review retained state.'})
        print(json.dumps({'halted': True, 'errorType': type(error).__name__, 'message': str(error),
                          'activeMarkerRetained': ACTIVE.exists()}), flush=True)
        sys.exit(2)
