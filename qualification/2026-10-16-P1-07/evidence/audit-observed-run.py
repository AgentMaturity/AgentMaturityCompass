from pathlib import Path
import collections,hashlib,json,re,sys
phase=sys.argv[1]
base=Path('/private/tmp/p1-39-post-typecheck-20261016')
folder=base/('command-'+phase)
raw=json.loads((folder/'raw.json').read_text()); observer=json.loads((folder/'observer.json').read_text()); command=json.loads((folder/'command.json').read_text())
assert command['phase']==phase and command['observed'] and command['groupAbsentByESRCH'] and not command['signalsOtherThanZeroSent']
rows=[]
for file in raw['testResults']:
 for item in file['assertionResults']:
  rows.append({'file':file['name'],'fullName':item['fullName'],'state':item['status'],'failureMessages':item.get('failureMessages',[])})
observed=[]; current=None; hooks=[]; task_errors=[]
for task in observer['tasks']:
 if task['kind']=='file': current=task['filepath']
 if task.get('hooks'): hooks.append({'kind':task['kind'],'file':current,'name':task['name'],'hooks':task['hooks']})
 if task.get('errors'): task_errors.append({'kind':task['kind'],'file':current,'name':task['name'],'errors':task['errors']})
 if task['kind']=='test': observed.append({'file':current,'fullName':task['fullName'],'state':task['state'],'id':task['id']})
assert len(rows)==raw['numTotalTests']==len(observed)==observer['testCount']
assert len({r['id'] for r in observed})==len(observed)
normalize={'passed':'pass','failed':'fail','pending':'skip','skipped':'skip','todo':'todo'}
raw_keys=[(r['file'],r['fullName'],normalize[r['state']]) for r in rows]
obs_keys=[(r['file'],r['fullName'],r['state']) for r in observed]
assert raw_keys==obs_keys, 'Exact file, fullName, occurrence and state join failed'
log=(folder/'stdout-stderr.log').read_text();public=[]
for path in re.findall(r'^PUBLIC_EVIDENCE (/.+)$',log,re.M):
 p=Path(path); data=p.read_bytes(); facts=json.loads(data)
 public.append({'path':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'bodyFailed':facts.get('bodyFailed'),'cleanupErrors':facts.get('cleanupErrors'),'environmentRestored':facts.get('environmentRestored'),'vaultLocked':facts.get('vaultLocked'),'poolClosed':facts.get('poolClosed')})
artifacts=[]
for name in ['command.json','owned-group-after-exit.json','raw.json','observer.json','stdout-stderr.log']:
 p=folder/name; data=p.read_bytes();artifacts.append({'path':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
out={'schema':'p107-observed-run-audit/1','phase':phase,'actualExit':command['exit'],'durationMs':command['durationMs'],'ownedPgid':command['ownedProcess']['ownedPgid'],'groupAbsentByESRCH':True,'signalsOtherThanZeroSent':False,'tests':{k:raw[k] for k in ['numTotalTests','numPassedTests','numFailedTests','numPendingTests']},'exactOrderedFileNameOccurrenceStateJoin':True,'uniqueObserverTestIds':len(observed),'unhandledErrors':observer.get('unhandledErrors',[]),'taskErrors':task_errors,'hooks':hooks,'rows':rows,'publicEvidence':public,'artifacts':artifacts,'boundary':'Actual observed scoped run only; canonical, fresh-source, full-suite and mutation credit require separate binding and review.'}
target=Path('/private/tmp/p1-07-gate-qualification-20261016')/(phase+'-outcome.json')
with target.open('x') as f:json.dump(out,f,indent=2);f.write('\n')
print(json.dumps({k:out[k] for k in ['phase','actualExit','durationMs','ownedPgid','tests','uniqueObserverTestIds','unhandledErrors','publicEvidence']}))
print(json.dumps({'taskErrorEntries':len(task_errors),'hookEntries':len(hooks),'outcome':str(target)}))
