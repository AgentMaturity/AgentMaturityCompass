"""Resolve the remaining vendored YAML dependency; no build/test acceptance."""
import importlib.util
import json
import os
import pathlib
import platform
import signal
import hashlib

ROOT = pathlib.Path('/Users/sid/AgentMaturityCompass')
RECORD = pathlib.Path(__file__).resolve().parent
SOURCE = 'c16492c10592112fe610bd2e59f216f8f7f310b4'
BASE = pathlib.Path('/private/tmp/amc-c164-vendor-yaml-01')
SUPERVISOR = RECORD.parent / 'attempt-2/runner.py'
spec = importlib.util.spec_from_file_location('amc_dependency_supervisor', SUPERVISOR)
sup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sup)
sup.RECORD = RECORD
signal.signal(signal.SIGTERM, sup.interrupted)
signal.signal(signal.SIGINT, sup.interrupted)
os.umask(0o077)
BASE.mkdir()
home, temporary, clone = BASE / 'home', BASE / 'tmp', BASE / 'checkout'
home.mkdir()
temporary.mkdir()
for name in ['.npmrc', '.npmrc-global']:
    (home / name).write_text('')
env = dict(PATH='/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
           HOME=str(home), TMPDIR=str(temporary), CI='1', LANG='en_US.UTF-8',
           GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL='/dev/null', GIT_TERMINAL_PROMPT='0',
           npm_config_userconfig=str(home / '.npmrc'), npm_config_globalconfig=str(home / '.npmrc-global'),
           npm_config_cache=str(home / '.npm'), npm_config_global='false')
state = dict(source=SOURCE, clone=str(clone), environment=dict(os=platform.system(),
             release=platform.release(), arch=platform.machine()), commands=[], status='running',
             startedAt=sup.utc(), helperSha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
             supervisorSha256=hashlib.sha256(SUPERVISOR.read_bytes()).hexdigest(),
             boundary='Private lockfile resolution only; no install, build, test or acceptance')
sup.write_json(RECORD / 'source.json', state, exclusive=True)
save = lambda: sup.write_json(RECORD / 'source.json', state)
try:
    state['environment']['node'] = sup.metadata([sup.NODE, '--version'], ROOT, env)
    for label, args, cwd, timeout in [
        ('clone', ['git', 'clone', '--quiet', '--no-local', '--no-hardlinks', '--no-checkout', str(ROOT), str(clone)], BASE, 300),
        ('checkout', ['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', SOURCE], clone, 120),
        ('resolution', [sup.NODE, sup.PNPM, '--filter', '@amc/cordis-plugin-include', 'update', 'js-yaml@^4.3.2', '--lockfile-only', '--ignore-scripts'], clone, 300),
    ]:
        code = sup.supervised(label, args, cwd, env, timeout, state, save)
        if code != 0:
            raise RuntimeError(f'{label} exited {code}')
    state['changedPaths'] = sup.metadata(['git', 'diff', '--name-only'], clone, env).splitlines()
    expected = ['pnpm-lock.yaml', 'vendor/include/package.json']
    if state['changedPaths'] != expected:
        raise RuntimeError('Unexpected preparation delta; copy refused')
    diff = sup.metadata(['git', 'diff', '--', *expected], clone, env)
    (RECORD / 'lockfile.diff').write_text(diff + '\n')
    state['status'] = 'prepared-awaiting-root-diff-review'
except BaseException as exc:
    state['status'] = 'failed'
    state['error'] = f'{type(exc).__name__}: {exc}'
finally:
    state['endedAt'] = sup.utc()
    state['allObservedCommandProcessesClosed'] = all(c['cleanup']['confirmedClosed'] for c in state['commands'])
    save()
print(json.dumps({k:state.get(k) for k in ['status', 'changedPaths', 'error', 'allObservedCommandProcessesClosed']}))
raise SystemExit(0 if state['status'] == 'prepared-awaiting-root-diff-review' else 1)
