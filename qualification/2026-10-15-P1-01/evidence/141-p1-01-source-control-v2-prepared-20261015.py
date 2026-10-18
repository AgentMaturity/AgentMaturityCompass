"""Inert P1-01 source-control driver. Root must review before executing.

Copies frozen tracked/compiled inputs into a fresh private tree. Only its receipt
source is mutated; committed schema bytes are never regenerated. Each real child
must exit normally and its owned process group must be absent before any change.
Unexpected results retain ACTIVE/HALTED and all bytes, without restoration.
"""
from pathlib import Path
import datetime
import errno
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

PARENT = Path('/Users/sid/.codex/worktrees/p1-01-qualification/AgentMaturityCompass')
BASE = Path('/private/tmp/p1-01-source-control-20261015')
INPUT = Path('/private/tmp/p1-01-qualification-20261015')
NODE = '/opt/homebrew/opt/node@22/bin/node'
PROBE_SHA = '0b09ff2ad62cd487bd1cd997024f2464e89de8c4130d400d181fe3658bc093ab'
OWNED_BASE = False
SOURCE = 'src/contracts/v1/receipt.ts'
ANCHOR = 'z.strictObject({ ...v2Fields, state: z.enum(["requested", "authorized", "started", "outcome_unknown"]) })'


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_new(path, value):
    with Path(path).open('x') as out:
        json.dump(value, out, indent=2)
        out.write('\n')


def verify(root, rows, exceptions=()):
    differences = []
    for row in rows:
        path = root / row['path']
        same = path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256']
        same = same and (path.stat().st_mode & 0o777) == row['mode']
        if not same:
            differences.append(row['path'])
    require(set(differences) <= set(exceptions), 'Unexpected file differences: ' + repr(differences))
    return differences


def child(phase, argv, expected, root):
    if len(argv) > 2 and argv[2] == 'receipt':
        require(digest(argv[1]) == PROBE_SHA, 'Probe changed before child')
    directory = BASE / phase
    directory.mkdir(mode=0o700)
    started = time.monotonic()
    with (directory / 'stdout.log').open('x') as out, (directory / 'stderr.log').open('x') as err:
        proc = subprocess.Popen(argv, cwd=root, stdout=out, stderr=err, start_new_session=True)
        try:
            pgid = os.getpgid(proc.pid)
        except ProcessLookupError:
            pgid = None
        write_new(directory / 'launch.json', {'utc': stamp(), 'pid': proc.pid, 'ownedPgid': proc.pid,
                  'observedPgid': pgid, 'cwd': str(root), 'argv': argv,
                  'environment': 'Inherited from root wrapper; private HOME and Node22 PATH; no isolation claim.'})
        code = proc.wait()
    deadline = time.monotonic() + 5
    probes = []
    while True:
        absent, number = False, None
        try:
            os.killpg(proc.pid, 0)
        except OSError as error:
            number, absent = error.errno, error.errno == errno.ESRCH
        probes.append({'utc': stamp(), 'signal': 0, 'errno': number, 'absentByESRCH': absent})
        if absent or time.monotonic() >= deadline:
            break
        time.sleep(min(.05, max(0, deadline - time.monotonic())))
    result = {'phase': phase, 'argv': argv, 'cwd': str(root), 'pid': proc.pid, 'exit': code,
              'expectedExit': expected, 'durationMs': round((time.monotonic() - started) * 1000),
              'ownedGroupProbes': probes, 'signalsOtherThanZeroSent': False}
    write_new(directory / 'result.json', result)
    require(pgid in (None, proc.pid) and absent and code == expected, 'Child result uncertain/unexpected: ' + phase)
    return result


def main():
    global OWNED_BASE
    require(len(sys.argv) == 3, 'Expected PROBE_PATH PROBE_SHA256')
    probe = Path(sys.argv[1])
    require(probe.is_absolute() and digest(probe) == sys.argv[2] == PROBE_SHA, 'Probe pin differs')
    require(not BASE.exists(), 'Private control tree already exists; no retry/overwrite')
    require(digest(INPUT / 'original-tracked-files.json') == '4e9cb8099bb2faab68082a7ee231970f6c2741319dfa36f0f902b238f2b1176a', 'Tracked manifest changed')
    require(digest(INPUT / 'original-dist-files.json') == '2af55d06288b5b6046e7acb8c819dc8b271e3a035190e14e61460c50f59ee1d2', 'Compiled manifest changed')
    tracked = json.loads((INPUT / 'original-tracked-files.json').read_text())
    compiled = json.loads((INPUT / 'original-dist-files.json').read_text())
    rows = tracked + compiled
    verify(PARENT, rows)
    BASE.mkdir(mode=0o700)
    OWNED_BASE = True
    write_new(BASE / 'ACTIVE.json', {'utc': stamp(), 'state': 'preparing; retain on uncertainty'})
    root = BASE / 'copy'
    root.mkdir(mode=0o700)
    physical = []
    for row in rows:
        source, target = PARENT / row['path'], root / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        a, b = source.stat(), target.stat()
        require((a.st_dev, a.st_ino) != (b.st_dev, b.st_ino) and b.st_nlink == 1, 'Copy aliases source')
        physical.append({'path': row['path'], 'parentDev': a.st_dev, 'parentInode': a.st_ino,
                         'copyDev': b.st_dev, 'copyInode': b.st_ino, 'copyNlink': b.st_nlink})
    (root / 'node_modules').symlink_to(PARENT / 'node_modules', target_is_directory=True)
    verify(root, rows)
    write_new(BASE / 'physical-manifest.json', physical)
    native = PARENT / 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    native_before = {'sha256': digest(native), 'inode': native.stat().st_ino, 'nlink': native.stat().st_nlink}
    results = []
    results.append(child('baseline-receipt', [NODE, str(probe), 'receipt', str(root)], 0, root))
    results.append(child('baseline-schemas', [NODE, 'scripts/gen-spec-schemas.mjs', '--check'], 0, root))
    verify(root, rows)
    verify(PARENT, rows)
    target = root / SOURCE
    original = target.read_bytes()
    text = original.decode()
    require(text.count(ANCHOR) == 1, 'Mutation anchor is not unique')
    mutated = text.replace(ANCHOR, ANCHOR + '.passthrough()').encode()
    target.write_bytes(mutated)
    write_new(BASE / 'mutation.json', {'path': SOURCE, 'anchorCount': 1,
              'beforeSha256': hashlib.sha256(original).hexdigest(),
              'afterSha256': hashlib.sha256(mutated).hexdigest(),
              'scope': 'Only requested/authorized/started/outcome_unknown top-level receipt branch becomes permissive.'})
    results.append(child('mutant-compile', [NODE, 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], 0, root))
    allowed = [SOURCE, 'dist/contracts/v1/receipt.js'] + [r['path'] for r in compiled if r['path'].endswith('.d.ts')]
    changed = verify(root, rows, allowed)
    require(SOURCE in changed and 'dist/contracts/v1/receipt.js' in changed, 'Mutation was not compiled')
    require(digest(target) == hashlib.sha256(mutated).hexdigest(), 'Mutated source drifted')
    write_new(BASE / 'mutant-differences.json', changed)
    mutant_pins = []
    for rel in changed:
        retained = BASE / 'mutant-inputs' / rel
        retained.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / rel, retained)
        mutant_pins.append({'path': rel, 'bytes': retained.stat().st_size, 'sha256': digest(retained)})
    write_new(BASE / 'mutant-input-pins.json', mutant_pins)
    verify(PARENT, rows)
    results.append(child('mutant-receipt', [NODE, str(probe), 'receipt', str(root)], 1, root))
    receipt_log = (BASE / 'mutant-receipt/stderr.log').read_text()
    require('AssertionError' in receipt_log and 'receipt V2 must refuse the unrecognized top-level member' in receipt_log,
            'Mutant receipt did not fail at the named rejection assertion')
    results.append(child('mutant-schemas', [NODE, 'scripts/gen-spec-schemas.mjs', '--check'], 1, root))
    schema_log = (BASE / 'mutant-schemas/stderr.log').read_text()
    require('spec/schemas/v1/receipt.schema.json is stale: run npm run gen:schemas' in schema_log,
            'Mutant schema did not detect receipt drift')
    verify(root, rows, allowed)
    require(all(digest(root / row['path']) == row['sha256'] for row in mutant_pins), 'Mutant bytes changed during checks')
    verify(PARENT, rows)
    for rel in changed:
        shutil.copyfile(PARENT / rel, root / rel)
    verify(root, rows)
    results.append(child('restored-receipt', [NODE, str(probe), 'receipt', str(root)], 0, root))
    results.append(child('restored-schemas', [NODE, 'scripts/gen-spec-schemas.mjs', '--check'], 0, root))
    verify(root, rows)
    verify(PARENT, rows)
    native_after = {'sha256': digest(native), 'inode': native.stat().st_ino, 'nlink': native.stat().st_nlink}
    require(native_before == native_after, 'Borrowed native binary changed')
    write_new(BASE / 'result.json', {'utc': stamp(), 'root': str(root), 'parent': str(PARENT),
              'trackedCount': len(tracked), 'compiledCount': len(compiled), 'physicalCopies': len(physical),
              'probe': str(probe), 'probeSha256': sys.argv[2], 'children': results,
              'nativeBefore': native_before, 'nativeAfter': native_after,
              'allOriginalBytesRestored': True, 'parentUnchanged': True,
              'boundary': 'Two narrow receipt/schema sensitivity checks; no full-suite, independent-authority, network or universal descendant-isolation claim.'})
    (BASE / 'ACTIVE.json').unlink()
    print(json.dumps({'complete': True, 'result': str(BASE / 'result.json'), 'childCount': len(results)}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        if OWNED_BASE and not (BASE / 'HALTED.json').exists():
            write_new(BASE / 'HALTED.json', {'utc': stamp(), 'errorType': type(error).__name__,
                      'message': str(error), 'policy': 'Retain ACTIVE and bytes; no automatic retry/restoration/signals.'})
        raise
