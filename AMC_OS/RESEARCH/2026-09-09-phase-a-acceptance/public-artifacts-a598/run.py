"""Retain current public artifacts from the independently prepared a598 clone."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal

ROOT = Path('/Users/sid/AgentMaturityCompass')
RECORD = Path(__file__).resolve().parent
CLONE = Path('/private/tmp/amc-a5987643-package-01/checkout')
BASE = Path('/private/tmp/amc-a5987643-public-artifacts-01')
SOURCE = 'a5987643ef6c26b01f687226fbc6a6709fc182cb'
SUPERVISOR = RECORD.parent / 'attempt-3/runner.py'
spec = importlib.util.spec_from_file_location('artifact_supervisor', SUPERVISOR)
sup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sup)
sup.RECORD = RECORD
signal.signal(signal.SIGTERM, sup.interrupted)
signal.signal(signal.SIGINT, sup.interrupted)
os.umask(0o077)
BASE.mkdir()
for name in ('home', 'tmp'):
    (BASE / name).mkdir()
for name in ('user.npmrc', 'global.npmrc'):
    (BASE / name).write_text('')
env = dict(PATH='/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
           HOME=str(BASE / 'home'), TMPDIR=str(BASE / 'tmp'), CI='1', LANG='en_US.UTF-8',
           GITHUB_SHA=SOURCE, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null',
           GIT_TERMINAL_PROMPT='0', npm_config_userconfig=str(BASE / 'user.npmrc'),
           npm_config_globalconfig=str(BASE / 'global.npmrc'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
provenance_path = RECORD.parent / 'installed-candidate-a598/source.json'
provenance = json.loads(provenance_path.read_text())
state = dict(source=SOURCE, clone=str(CLONE), output=str(BASE), commands=[], status='running',
             environment=provenance['environment'], helperSha256=sha(Path(__file__)),
             supervisorSha256=sha(SUPERVISOR), preparationReceipt=str(provenance_path),
             preparationReceiptSha256=sha(provenance_path), startedAt=sup.utc())
sup.write_json(RECORD / 'source.json', state, exclusive=True)
save = lambda: sup.write_json(RECORD / 'source.json', state)

def admit():
    if sup.metadata(['git', 'rev-parse', 'HEAD'], CLONE, env) != SOURCE:
        raise RuntimeError('Candidate source pin changed')
    if sup.metadata(['git', 'status', '--porcelain', '--untracked-files=no'], CLONE, env):
        raise RuntimeError('Tracked source or index is dirty')
    if any(line and line[0] != 'H' for line in sup.metadata(['git', 'ls-files', '-v'], CLONE, env).splitlines()):
        raise RuntimeError('Nonstandard source index flags')

try:
    if provenance['source'] != SOURCE or provenance['clone'] != str(CLONE) or provenance['status'] != 'private-artifact-and-keyless-smoke-passed':
        raise RuntimeError('Fresh clone/build provenance mismatch')
    admit()
    state['sourceCleanBefore'] = True
    for label, args, timeout in [
        ('publisher', [sup.NODE, 'scripts/update-native-task-openapi.mjs', '--check'], 120),
        ('counts', [sup.NODE, 'scripts/gen-counts.mjs', '--check'], 120),
        ('pages', [sup.NODE, 'scripts/build-pages-site.mjs', '--out', str(BASE / 'pages')], 300),
    ]:
        code = sup.supervised(label, args, CLONE, env, timeout, state, save)
        if code != 0:
            raise RuntimeError(f'{label} exited {code}')
        admit()
    state['status'] = 'generation-and-consistency-passed-inspection-pending'
    state['sourceCleanAfter'] = True
except BaseException as exc:
    state['status'] = 'failed'
    state['error'] = f'{type(exc).__name__}: {exc}'
finally:
    state['endedAt'] = sup.utc()
    state['allObservedCommandProcessesClosed'] = all(c['cleanup']['confirmedClosed'] for c in state['commands'])
    save()
print(json.dumps({k: state.get(k) for k in ('status', 'error', 'allObservedCommandProcessesClosed')}))
raise SystemExit(0 if state['status'] == 'generation-and-consistency-passed-inspection-pending' else 1)
