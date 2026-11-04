import datetime, hashlib, json, os, subprocess, sys, time
from pathlib import Path

root = Path('/Users/sid/AgentMaturityCompass-worktrees/codex-7f/p2-30')
q = root / 'qualification/2026-10-18-P2-30/checks'
e = root.parent / 'evidence/p2-30/checks'
head = sys.argv[1]
os.chdir(root)
def git(*args):
    return subprocess.check_output(['git'] + list(args), text=True).strip()
def sha(data):
    return hashlib.sha256(data).hexdigest()
assert len(head) == 40 and git('rev-parse', 'HEAD') == head
node = subprocess.check_output(['node', '--version'], text=True).strip()
assert node.startswith('v22.')
assert os.environ.get('TMPDIR', '').rstrip('/') == str(root.parent / 'runtime/p2-30')
assert not (q / 'full-suite-final.json').exists(), 'Final suite already recorded; never silently repeat it.'
assert not (q / 'full-suite-final-start.json').exists(), 'An attempt already started; inspect it before any retry.'
rows = json.loads((q / 'post-governance-results.json').read_text())
required = {'build','focused','typecheck','typecheck-tests','lint','counts','docs-drift','freeze','architecture-boundaries','gates','schemas','api-ref','threat-model','citations','qualification','release-notes','catalog-currency','catalog-changelog','duplicates','dead-code','clean-source','industry-guides','regulatory-calendar','catalog-changelog-main'}
assert required <= {r['name'] for r in rows}
assert all(r['head'] == head for r in rows)
failed_checks = [r for r in rows if r['name'] != 'counts-before-regeneration' and r['exit'] != 0]
assert all(r['name'] == 'catalog-changelog-main' and r['exit'] == 1 for r in failed_checks), failed_checks
if failed_checks:
    blocker_path = q / 'catalog-changelog-main-blocker.json'
    blocker = json.loads(blocker_path.read_text())
    assert blocker['head'] == head and blocker['state'] == 'expected_main_merge_consolidation'
    assert blocker['code'] == 'GOV_CHANGELOG_ENTRY_COUNT' and blocker['guardUnchangedAgainstInt'] is True
    assert blocker['measuredCheck']['rawLogSha256'] == failed_checks[0]['rawLogSha256']
    assert sha(Path(failed_checks[0]['rawLogPath']).read_bytes()) == failed_checks[0]['rawLogSha256']
    assert blocker['allOtherRequiredChecksPass'] is True

allowed = ['README.md','CONTRIBUTING.md','website/i18n.js','website/index.html','website/lite.html','whitepaper/AMC_WHITEPAPER_v1.md','docs/content/show-hn-draft.md','docs/content/reddit-launch-drafts.md','docs/internal/competitive-landscape.md','docs/internal/mirofish-simulation-council.md']
status_before = git('status','--porcelain','--untracked-files=all','--','.',':(exclude)qualification/**')
dirty_before = git('diff','HEAD','--name-only','--','.',':(exclude)qualification/**').splitlines()
assert set(dirty_before) == set(allowed), status_before
assert not any(line.startswith('??') for line in status_before.splitlines()), status_before
backup = e / ('generated-counts-before-final-full-' + head)
backup.mkdir(parents=True, exist_ok=True)
saved = {}
for path in allowed:
    data = (root / path).read_bytes()
    saved[path] = data
    dest = backup / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
implementation_dirty = git('status','--porcelain','--untracked-files=all','--','.',':(exclude)qualification/**',*[
    ':(exclude)' + path for path in allowed])
assert implementation_dirty == '', implementation_dirty
raw = e / 'full-suite-final.log'
report = e / 'full-suite-final-report.json'
assert not report.exists(), 'Final JSON report already exists; inspect it before attempting a run.'
cmd = ['npm','test','--','--maxWorkers=4','--reporter=dot','--reporter=json','--outputFile=' + str(report)]
start_record = {'head':head,'int':git('rev-parse','int'),'node':node,'tmpdir':os.environ['TMPDIR'],'cmd':' '.join(cmd),'timeUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'statusBeforeRun':status_before,'workingTreeClean':not bool(status_before),'allowedGeneratedOutputPaths':dirty_before,'generatedOutputInputs':[{'path':path,'sha256':sha(data)} for path,data in saved.items()],'statusPorcelain':git('status','--porcelain'),'committedImplementationSourceAtStart':True,'nonFullCheckFailuresAtStart':failed_checks,'nonFullCheckFailurePolicy':'The default-main changelog entry-count failure is expected until 7fccbbfa consolidates at the final main merge, per the recorded coordinator decision; its assertion and exit are retained. The int-relative check and every other required check passed. The guard and existing entries are unchanged.','generatedOutputsBackup':str(backup),'generatedOutputPolicy':'Required regenerated count outputs remain uncommitted and hashed. publicStatsDrift.test.ts compares them with the actual test-file inventory; reverting them to old HEAD counts would create artificial failures. No other uncommitted source or test input is admitted.','policy':'One measured full-suite run on final source; no all-green claim required. Four workers on a 12 logical CPU host; no test budgets or assertions changed.'}
(q / 'full-suite-final-start.json').write_text(json.dumps(start_record,indent=2)+'\n')
start = time.monotonic()
exit_code = None
failure = None
command_ended = None
status_after_tests = None
generated_unchanged = None
try:
    with raw.open('wb') as log:
        proc = subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
    command_ended = time.monotonic()
    exit_code = proc.returncode
    status_after_tests = git('status','--porcelain','--untracked-files=all','--','.',':(exclude)qualification/**')
except BaseException as err:
    failure = repr(err)
finally:
    generated_unchanged = all(sha((root / path).read_bytes()) == sha(data) for path,data in saved.items())
duration = round(((command_ended if command_ended is not None else time.monotonic()) - start) * 1000)
raw_bytes = raw.read_bytes() if raw.exists() else b''
result = {'name':'full-suite-final','head':head,'headAfter':git('rev-parse','HEAD'),'cmd':' '.join(cmd),'exit':exit_code,'durationMs':duration,'rawLogPath':str(raw),'rawLogSha256':sha(raw_bytes),'rawLogBytes':len(raw_bytes),'jsonReportPath':str(report),'jsonReportSha256':sha(report.read_bytes()) if report.exists() else None,'statusAfterTests':status_after_tests,'generatedOutputsUnchangedByTests':generated_unchanged,'generatedOutputsBackup':str(backup),'exception':failure}
if report.exists():
    data = json.loads(report.read_text())
    result['reportedTests'] = {k:data.get(k) for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']}
(q / 'full-suite-final.json').write_text(json.dumps(result,indent=2)+'\n')
cap = raw_bytes if len(raw_bytes) <= 200000 else raw_bytes[:20000] + b'\n[Middle omitted; complete raw log path and SHA-256 retained in full-suite-final.json.]\n' + raw_bytes[-180000:]
(q / 'full-suite-final.log').write_bytes(cap)
print(json.dumps(result),flush=True)
if failure:
    raise SystemExit(2)
