"""Read-only root snapshot; it does not restore files or claim continuous isolation."""
from pathlib import Path
import datetime
import hashlib
import json
import stat
import subprocess
import sys

B = Path('/private/tmp/p1-11-decisive-qualification-20261017')
label = sys.argv[1]
assert label in ('after-m2', 'after-m3', 'final')
x = json.loads((B / 'fresh-source-binding.json').read_text())
p = json.loads((B / 'protected-inputs.json').read_text())
s, q = Path(x['sourceRoot']), Path(x['freshRoot'])
for row in x['boundPaths']:
    for root in (s, q):
        data = (root / row['relativePath']).read_bytes()
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['relativePath']
for row in p['inputs']:
    data = Path(row['path']).read_bytes()
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
for row in {row['path']: row for row in [*p['nativePins'], *x['nativePins']]}.values():
    f = Path(row['path'])
    st, data = f.stat(), f.read_bytes()
    assert str(f.resolve()) == row['physicalPath']
    assert (st.st_dev, st.st_ino, st.st_nlink) == (row['dev'], row['inode'], 1)
    assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
for root in (s, q):
    assert subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=root) == b''
    assert subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=root) == b''
r = Path('/Users/sid/.codex/worktrees/p1-09-implementation/AgentMaturityCompass')
assert subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=r).decode() == p['heldRStatus']
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=r).decode().strip() == p['heldRHead']
assert subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=r) == b''
t = q / 'src/catalog/evidence/admission.ts'
st = t.lstat()
assert stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and t.resolve() == t
assert (s / 'src/catalog/evidence/admission.ts').stat().st_ino != st.st_ino
out = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'label': label,
       'boundPathsEachRoot': len(x['boundPaths']), 'protectedInputs': len(p['inputs']),
       'allSourceFreshBytesExact': True, 'nativePhysicalPinsExact': True,
       'heldRHead18RowsAndEmptyIndexExact': True, 'bothTreesClean': True, 'bothIndexesEmpty': True,
       'targetRegularSingleLink': True, 'targetInode': st.st_ino,
       'boundary': 'Current read-only snapshot only. No claim of continuous isolation or an unrecorded earlier physical check.'}
with (B / ('preservation-' + label + '.json')).open('x') as handle:
    json.dump(out, handle, indent=2)
    handle.write('\n')
print(json.dumps(out))
