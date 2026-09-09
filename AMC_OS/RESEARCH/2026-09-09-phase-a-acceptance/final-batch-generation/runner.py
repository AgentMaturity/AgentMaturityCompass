"""Prepare generated inventory only in a fresh clone at an explicit candidate."""
import datetime
import json
import os
import pathlib
import platform
import signal
import subprocess
import tempfile
import time
import sys
import re
import hashlib

record = pathlib.Path(__file__).resolve().parent
root = pathlib.Path('/Users/sid/AgentMaturityCompass')
if (record / 'source.json').exists():
    raise SystemExit('Refusing to overwrite an earlier attempt')
if len(sys.argv) != 2 or not re.fullmatch(r'[a-f0-9]{40}', sys.argv[1]):
    raise SystemExit('Usage: runner.py <exact committed source SHA>')
node = '/opt/homebrew/opt/node@22/bin/node'
pnpm = '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs'
source = subprocess.check_output(['git', 'rev-parse', sys.argv[1] + '^{commit}'], cwd=root, text=True).strip()
if source != sys.argv[1]:
    raise SystemExit('Source pin mismatch')
base = pathlib.Path(tempfile.mkdtemp(prefix='amc-phase-a-acceptance-20260909-', dir='/private/tmp'))
clone = base / 'checkout'
home = base / 'home'
home.mkdir()
env = {k: v for k, v in os.environ.items() if k.upper() in {
    'PATH', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG'
} or k.startswith('LC_')}
env.update({
    'PATH': str(pathlib.Path(node).parent) + ':' + env.get('PATH', ''),
    'HOME': str(home), 'CI': '1',
    'npm_config_userconfig': str(home / '.npmrc'),
    'npm_config_globalconfig': str(home / '.npmrc-global'),
    'npm_config_cache': str(home / '.npm'), 'npm_config_global': 'false',
    'XDG_CONFIG_HOME': str(home / '.config'), 'XDG_CACHE_HOME': str(home / '.cache'),
    'XDG_DATA_HOME': str(home / '.local/share'),
})
for name in ['.npmrc', '.npmrc-global']:
    (home / name).write_text('')
subprocess.run(['git', 'clone', '--quiet', '--no-hardlinks', str(root), str(clone)], check=True, env=env)
subprocess.run(['git', 'checkout', '--quiet', '--detach', source], cwd=clone, check=True, env=env)
state = {
    'source': source, 'clone': str(clone), 'home': str(home), 'env': env,
    'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'environment': {'os': platform.system(), 'release': platform.release(), 'arch': platform.machine(),
                    'node': subprocess.check_output([node, '--version'], text=True).strip()},
    'cleanBeforeInstall': subprocess.check_output(['git', 'status', '--porcelain'], cwd=clone, text=True) == '',
    'commands': [], 'status': 'running',
    'runnerSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'boundary': 'Generated inventory preparation only; not final candidate acceptance',
}

def save():
    (record / 'source.json').write_text(json.dumps(state, indent=2) + '\n')

save()
for label, args, timeout in [
    ('install', [node, pnpm, 'install', '--frozen-lockfile'], 900),
    ('build', [node, pnpm, 'run', 'build'], 900),
    ('counts', [node, 'scripts/gen-counts.mjs', '--write'], 180),
]:
    started = time.monotonic()
    with (record / (label + '.log')).open('w') as log:
        proc = subprocess.Popen(args, cwd=clone, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        state['active'] = {'label': label, 'pid': proc.pid, 'command': args}
        save()
        try:
            code = proc.wait(timeout=timeout)
        except BaseException:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=10)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait()
            state['status'] = 'interrupted'
            state['active'] = None
            save()
            raise
    state['commands'].append({'label': label, 'command': args, 'exitCode': code,
                              'elapsedSeconds': time.monotonic() - started, 'processReaped': True})
    state['active'] = None
    save()
    print(json.dumps({'source': source, 'step': label, 'exitCode': code, 'clone': str(clone)}), flush=True)
    if code != 0:
        state['status'] = 'failed'
        break
else:
    state['status'] = 'completed'
state['endedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
state['trackedDeltaAfter'] = subprocess.check_output(['git', 'diff', '--stat'], cwd=clone, text=True)
save()
raise SystemExit(0 if state['status'] == 'completed' else 1)
