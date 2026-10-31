from pathlib import Path
import subprocess, os, sys, json, time, datetime, shlex
phase, major, cwd = sys.argv[1:4]
cmd = sys.argv[4:]
assert major == '22'
base = Path('/private/tmp/p0-21-qualification-20261015')
env = dict(os.environ)
env['PATH'] = '/opt/homebrew/opt/node@22/bin:' + env['PATH']
env['HOME'] = str(base / 'home')
env['GIT_NO_LAZY_FETCH'] = '1'
log = Path('/private/tmp/p0-21-' + phase + '-20261015.log')
assert not log.exists(), str(log)
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
with log.open('x') as output:
    result = subprocess.run(cmd, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT)
row = {'phase': phase, 'major': major, 'cwd': cwd, 'cmd': shlex.join(cmd), 'exit': result.returncode,
       'durationMs': round((time.monotonic() - clock) * 1000), 'startedUtc': started, 'log': str(log),
       'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=cwd, text=True).strip()}
with Path('/private/tmp/p0-21-final-commands-20261015.jsonl').open('a') as journal:
    journal.write(json.dumps(row) + '\n')
print(json.dumps(row))
sys.exit(result.returncode)
