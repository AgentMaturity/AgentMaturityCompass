"""Build and retain one private candidate artifact from a new independent clone."""
import importlib.util
import json
import os
import pathlib
import platform
import signal
import hashlib
import tarfile
import re

ROOT = pathlib.Path('/Users/sid/AgentMaturityCompass')
RECORD = pathlib.Path(__file__).resolve().parent
SOURCE = 'a5987643ef6c26b01f687226fbc6a6709fc182cb'
BASE = pathlib.Path('/private/tmp/amc-a5987643-package-01')
SUPERVISOR = RECORD.parent / 'attempt-3/runner.py'
spec = importlib.util.spec_from_file_location('amc_package_supervisor', SUPERVISOR)
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

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()

state = dict(source=SOURCE, clone=str(clone), environment=dict(os=platform.system(),
             release=platform.release(), arch=platform.machine()), commands=[], status='running',
             startedAt=sup.utc(), helperSha256=digest(pathlib.Path(__file__)),
             supervisorSha256=digest(SUPERVISOR),
             boundary='Private source build, retained tarball and keyless installed smoke; no publish/deploy or live provider')
sup.write_json(RECORD / 'source.json', state, exclusive=True)
save = lambda: sup.write_json(RECORD / 'source.json', state)
try:
    state['environment']['node'] = sup.metadata([sup.NODE, '--version'], ROOT, env)
    state['environment']['pnpm'] = sup.metadata([sup.NODE, sup.PNPM, '--version'], ROOT, env)
    if state['environment']['node'] != 'v22.22.0':
        raise RuntimeError('Prepared Node pin changed')
    state['executables'] = {}
    for label, path in [('node', pathlib.Path(sup.NODE)), ('pnpm', pathlib.Path(sup.PNPM)),
                        ('npm', pathlib.Path(sup.metadata(['which', 'npm'], ROOT, env)))]:
        path = path.resolve(strict=True)
        state['executables'][label] = dict(path=str(path), sha256=digest(path))
    for label, args, cwd, timeout in [
        ('clone', ['git', 'clone', '--quiet', '--no-local', '--no-hardlinks', '--no-checkout', str(ROOT), str(clone)], BASE, 300),
        ('checkout', ['git', '-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', SOURCE], clone, 120),
        ('install', [sup.NODE, sup.PNPM, 'install', '--frozen-lockfile'], clone, 900),
        ('packed-install', [sup.NODE, 'scripts/packed-install-check.mjs', '--keep'], clone, 1800),
    ]:
        if label in ['install', 'packed-install']:
            if sup.metadata(['git', 'status', '--porcelain'], clone, env):
                raise RuntimeError('Source must be clean before install/build')
            if sup.metadata(['git', 'rev-parse', 'HEAD'], clone, env) != SOURCE:
                raise RuntimeError('Source pin changed')
        code = sup.supervised(label, args, cwd, env, timeout, state, save)
        if code != 0:
            raise RuntimeError(f'{label} exited {code}')
    kept = re.findall(r'^kept: (.+)$', (RECORD / 'packed-install.log').read_text(), re.M)
    if len(kept) != 1:
        raise RuntimeError('One explicit retained package workspace is required')
    work = pathlib.Path(kept[0]).resolve(strict=True)
    if not work.is_relative_to(temporary.resolve()):
        raise RuntimeError('Retained package directory escaped owned TMPDIR')
    artifacts = list(work.glob('*.tgz'))
    if len(artifacts) != 1 or artifacts[0].is_symlink():
        raise RuntimeError('Expected one regular retained tarball')
    artifact = artifacts[0]
    with tarfile.open(artifact, 'r:gz') as archive:
        members = [m for m in archive.getmembers() if m.name == 'package/dist/cli.js']
        if len(members) != 1 or not members[0].isfile() or members[0].size > 64 * 1024 * 1024:
            raise RuntimeError('Expected one bounded regular packaged CLI')
        cli = archive.extractfile(members[0]).read()
    installed = work / 'consumer/node_modules/agent-maturity-compass/dist/cli.js'
    if digest(installed) != hashlib.sha256(cli).hexdigest():
        raise RuntimeError('Installed CLI differs from the retained archive')
    state['artifact'] = dict(path=str(artifact), sha256=digest(artifact), bytes=artifact.stat().st_size,
                             cliSha256=hashlib.sha256(cli).hexdigest(), installedCli=str(installed),
                             retainedWorkspace=str(work), format='private-npm-tarball')
    state['trackedDeltaAfter'] = sup.metadata(['git', 'diff', '--stat'], clone, env)
    state['finalHead'] = sup.metadata(['git', 'rev-parse', 'HEAD'], clone, env)
    if state['trackedDeltaAfter'] or state['finalHead'] != SOURCE:
        raise RuntimeError('Candidate source changed during artifact build')
    state['status'] = 'private-artifact-and-keyless-smoke-passed'
    state['skips'] = ['Real-provider smoke: AMC_PACKED_SMOKE_PROVIDER intentionally absent']
except BaseException as exc:
    state['status'] = 'failed'
    state['error'] = f'{type(exc).__name__}: {exc}'
finally:
    state['endedAt'] = sup.utc()
    state['allObservedCommandProcessesClosed'] = all(c['cleanup']['confirmedClosed'] for c in state['commands'])
    save()
print(json.dumps({k:state.get(k) for k in ['status', 'artifact', 'error', 'allObservedCommandProcessesClosed']}))
raise SystemExit(0 if state['status'] == 'private-artifact-and-keyless-smoke-passed' else 1)
