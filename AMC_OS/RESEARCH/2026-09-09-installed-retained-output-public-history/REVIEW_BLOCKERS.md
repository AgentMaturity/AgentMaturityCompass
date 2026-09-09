# Tool-review blockers for installed-retained-output-public-history-batch

Prior blockers in public-docs-correction/checkpoint-blocker.json and
native-history-batch/REVIEW_BLOCKERS.md remain preserved, not replayed.

The following new Core exec_command request was blocked before execution with:
`This tool call was blocked by OpenAI because we couldn't determine the safety status of the request.`
No source-review.json or proposed status update from this request was written.
It is retained as text, not split or replayed. This is not a runtime test failure.

Exact request, workdir `/agentmaturitycompass`:

```python
python3 - <<'PY'
from pathlib import Path
import difflib,hashlib,json,datetime
old=Path('AMC_OS/RESEARCH/2026-09-09-installed-spill-acceptance'); new=Path('AMC_OS/RESEARCH/2026-09-09-installed-retained-output-public-history')
for name in ['run.py','native-case.mjs']:
 print(''.join(difflib.unified_diff((old/name).read_text().splitlines(True),(new/name).read_text().splitlines(True),fromfile=str(old/name),tofile=str(new/name))))
now=datetime.datetime.now(datetime.timezone.utc)
s={'reviewedAt':now.isoformat(),'reviewer':'Chat on Steroids prime, same executor source review; not independent qualification','runtimeSource':'130c2d0087cf574016411fdc7d91067d3eddd637','origin':'AMC_OS/RESEARCH/2026-09-09-installed-spill-acceptance','files':{n:hashlib.sha256((new/n).read_bytes()).hexdigest() for n in ['run.py','native-case.mjs','README.md']},'supervisor':{'path':'AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py','sha256':hashlib.sha256(Path('AMC_OS/RESEARCH/2026-09-09-phase-a-acceptance/attempt-3/runner.py').read_bytes()).hexdigest()},'reviewedProperties':['full public root/native loader snapshots agree before lifecycle selection','read-only metadata versus locked-vault plaintext refusal','real native fs.read with signed narrow policy and required synthetic wire usage','sequential JSONL client lifetimes','actual origin/turn completion and stable scoped history pins','ciphertext-only transport and tamper/missing/overwrite refusal','separate external agent review before exact fixture A erasure','post-erasure native chain verification includes operations audit without history substitution','closure latch blocks subsequent launch or restoration if supervision fails'],'notClaimed':['execution','independent review','full suite','release gate','human approval','external monitor identity'],'nextAction':'Commit exact helper paths, then build fresh pinned source and install new package for the new bounded exercise.'}
(new/'source-review.json').write_text(json.dumps(s,indent=2)+'\n')
p=Path('AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/execution-status.json'); status=json.loads(p.read_text());status.update(state='implementation-reviewed-preparing-candidate',updatedAt=now.isoformat(),timeoutReviewAt=(now+datetime.timedelta(minutes=30)).isoformat(),nextAction=s['nextAction']);p.write_text(json.dumps(status,indent=2)+'\n')
PY
```

## Later live-run status proposal (not executed)

The following new Core exec_command at `/agentmaturitycompass` was blocked with
the same message. It did not update central status and is not replayed:

```sh
python3 - <<'PY'
from pathlib import Path
import json,datetime
base=Path('tmp/cos-installed-retained-output-public-history-01');outer=json.loads((base/'outer/receipt.json').read_text())
p=Path('AMC_OS/RESEARCH/2026-09-09-chat-on-steroids/execution-status.json');s=json.loads(p.read_text());now=datetime.datetime.now(datetime.timezone.utc)
s.update(state='installed-retained-output-executing',updatedAt=now.isoformat(),timeoutReviewAt=(now+datetime.timedelta(minutes=30)).isoformat(),activeOwnedExecution={'toolSessionId':53647,'outer':outer.get('active'),'receiptPath':str(base/'outer/receipt.json')},ownedProcessGroups=[outer['active']['pid']] if outer.get('active') else [],nextAction='Inspect concrete SQLite erasure request when generated; approve only separately reviewed exact run-owned A session. Then observe JSONL and terminal closure.')
for path in [base/'config.json',base/'outer/receipt.json',base/'run/receipts/receipt.json']:
 if str(path) not in s['receiptPaths']:s['receiptPaths'].append(str(path))
p.write_text(json.dumps(s,indent=2)+'\n')
print(json.dumps({'state':s['state'],'updatedAt':s['updatedAt'],'ownedProcessGroups':s['ownedProcessGroups']}))
if (base/'run/receipts/receipt.json').exists():
 r=json.loads((base/'run/receipts/receipt.json').read_text());print(json.dumps({'active':r['active'],'groups':[(g['backend'],g['name'],g['verdict']) for g in r['groups']],'failures':r['failures']}))
PY
```

## Exact disposable JSONL erasure approval (not executed)

After separate readback of the native plan, paired A origins, B exclusion and
confirmed review-command closure, this approval proposal was blocked by the
same automatic review message. No approval file was written. It is not retried,
split or supplied through another tool. The running finite gate will time out
without deletion. A reviewed plan is not a successful erasure result.

Exact Core exec_command, workdir `/agentmaturitycompass`:

```sh
python3 - <<'PY'
import json,os
from pathlib import Path
p=Path('tmp/cos-installed-retained-output-public-history-01/run/jsonl/erase-approval.json')
approval={'schemaVersion':1,'nonce':'d274b6e414e14a6a9787864c690ad159','source':'130c2d0087cf574016411fdc7d91067d3eddd637','backend':'jsonl','workspace':'/Users/sid/AgentMaturityCompass/tmp/cos-installed-retained-output-public-history-01/run/jsonl/workspace','sessionId':'c654c96c-02f5-4818-bb4b-38150dd5c112','reason':'Owned installed-spill acceptance fixture only','planSha256':'31eedcbae9f8c07439f5a59bee10509b5ff08abd3f662f3bc0fcbef4408c3469','decision':'apply-owned-fixture-only','statement':'I reviewed this exact owned-fixture erasure plan.'}
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:json.dump(approval,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
print('Separate agent review recorded for exact JSONL fixture A; B, transports and signed history excluded.')
PY
```

## Corrected helper repin commit proposal (not executed)

Production correction `33481a72aba1b11d4f3d63f14c8ab4f7ea1f7afd` was successfully
committed separately. The following later compound helper staging/check/commit
request was blocked before execution with the same automatic-review message:

```sh
git add -- AMC_OS/RESEARCH/2026-09-09-installed-retained-output-public-history/run.py AMC_OS/RESEARCH/2026-09-09-installed-retained-output-public-history/native-case.mjs AMC_OS/RESEARCH/2026-09-09-installed-retained-output-public-history/README.md && git diff --cached --check && git diff --cached --stat && git commit -m "test(spill): pin corrected cold SQLite runtime without replaying JSONL erasure"
```

Workdir: `/agentmaturitycompass`. No helper repin commit is claimed; current
source changes stay saved. This operation is not retried or split. Independently
prepared candidate-02 snapshots its actual helper bytes/digests, names the
corrected runtime source, selects SQLite only and supplies no erasure approval.
