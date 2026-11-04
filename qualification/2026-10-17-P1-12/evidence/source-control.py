"""One explicitly invoked apply or restore in the root-owned retained fresh checkout."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import stat
import sys

B = Path('/private/tmp/p1-12-compiled-guard-qualification-20261017')
N = Path('/private/tmp/p1-39-post-typecheck-20261016')
S = Path('/Users/sid/.codex/worktrees/p2-07-scim-qualification/AgentMaturityCompass')
mode, number = sys.argv[1:]
assert mode in ('apply', 'restore') and number in ('1', '2', '3')
assert not (N / 'ACTIVE.json').exists() and not (N / 'HALTED.json').exists()
binding = json.loads((B / 'fresh-source-binding.json').read_text())
q = Path(binding['freshRoot'])
assert q.name == 'checkout' and q.parent.name.startswith('amc-clean-source-')
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=q).decode().strip() == binding['sourceCommit']
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=S).decode().strip() == binding['sourceCommit']
assert subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=q) == b''
controls_path = B / 'contract-review/controls.json'
assert hashlib.sha256(controls_path.read_bytes()).hexdigest() == '77004cfb385395daca564a826acd68a62caf5de4b5eec3b0bca6e919dd2a3226'
control = json.loads(controls_path.read_text())['controls'][int(number) - 1]
target = q / control['targetRel']
physical = target.lstat()
assert stat.S_ISREG(physical.st_mode) and physical.st_nlink == 1 and target.resolve() == target
assert (S / control['targetRel']).stat().st_ino != physical.st_ino
sha = lambda data: hashlib.sha256(data).hexdigest()
original = B / ('m' + number + '-original.ts')

if mode == 'apply':
    assert subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=q) == b''
    for row in binding['boundPaths']:
        for root in (S, q):
            data = (root / row['relativePath']).read_bytes()
            assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
    before = target.read_bytes()
    assert sha(before) == control['sourceSha256']
    assert before == (S / control['targetRel']).read_bytes()
    assert before.count(control['before'].encode()) == 1
    mutant = before.replace(control['before'].encode(), control['replacement'].encode(), 1)
    assert sha(mutant) == control['proposedSha256ComputedOnly']
    with original.open('xb') as handle:
        handle.write(before)
    target.write_bytes(mutant)
    assert target.read_bytes() == mutant
    patch = subprocess.check_output(['git', 'diff', '--', control['targetRel']], cwd=q)
    with (B / ('m' + number + '.patch')).open('xb') as handle:
        handle.write(patch)
    record = {'operator': control['id'], 'sourceBefore': sha(before), 'mutant': sha(mutant),
              'patchSha256': sha(patch), 'patchCapturedFromLiveMutant': True}
else:
    outcome = json.loads((B / ('p112-m' + number + '-outcome.json')).read_text())
    assert outcome['phase'] == 'p112-m' + number and outcome['command']['exit'] == 1
    assert outcome['tests']['total'] == 35 and outcome['tests']['failed'] > 0
    assert not outcome['unhandledErrors'] and not outcome['lateDiagnostics']
    assert outcome['groupAbsentByESRCH'] and not outcome['signalsOtherThanZeroSent']
    assert outcome['rawObserverOrderedJoin']
    classification = json.loads((B / ('m' + number + '-classification.json')).read_text())
    assert classification['phase'] == 'p112-m' + number and classification['rootAllFailuresRead']
    assert classification['sourceCommit'] == binding['sourceCommit'] and classification['operator'] == control['id']
    assert classification['outcomeSha256'] == sha((B / ('p112-m' + number + '-outcome.json')).read_bytes())
    assert classification['noHookOrEnvironmentFailure']
    assert all(task['kind'] == 'test' for task in outcome['taskErrors'])
    applied = json.loads((B / ('m' + number + '-apply.json')).read_text())
    assert sha(target.read_bytes()) == applied['mutant']
    before = original.read_bytes()
    assert sha(before) == control['sourceSha256']
    target.write_bytes(before)
    assert target.read_bytes() == before == (S / control['targetRel']).read_bytes()
    assert subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=q) == b''
    for row in binding['boundPaths']:
        for root in (S, q):
            data = (root / row['relativePath']).read_bytes()
            assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
    record = {'operator': control['id'], 'restored': sha(before), 'byteExact': True, 'checkoutClean': True}
record.update({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'target': str(target),
               'sourceCommit': binding['sourceCommit'], 'mode': mode,
               'compiledMutation': False, 'nativeMutation': False, 'automaticRestoreOrRetry': False,
               'targetPhysicalPath': str(target.resolve()), 'targetInode': physical.st_ino, 'targetNlink': physical.st_nlink,
               'regularSingleLinkCheckedBeforeWrite': True})
with (B / ('m' + number + '-' + mode + '.json')).open('x') as handle:
    json.dump(record, handle, indent=2)
    handle.write('\n')
print(json.dumps(record))
