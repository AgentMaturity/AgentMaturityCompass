from pathlib import Path
import hashlib,json,stat
T=Path('/private/tmp');R=Path('/Users/sid/.codex/worktrees/p0-45-qualification/AgentMaturityCompass');Q=R/'qualification/2026-10-15-P0-45'
def pin(p):
 p=Path(p);b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def write_new(p,d):
 with p.open('x') as f:json.dump(d,f,indent=2);f.write('\n')
rows=[json.loads(s) for s in (T/'p0-45-final-commands-20261015.jsonl').read_text().splitlines()]
by={r['phase']:r for r in rows}
assert by['canonical-qualification-first']['exit']==by['precommit-normal-freeze']['exit']==0
check=by['staged-diff-check'];log=Path(check['log']).read_text();assert check['exit']==2
lines=log.splitlines();assert len(lines)==1 and lines[0].endswith(': new blank line at EOF.') and 'evidence/' in lines[0] and '-stdout-stderr.log:' in lines[0]
summary={'source':'2024f25c79973987b44a4a1298488d55ee0d6227','metadataCommands':rows,'qualificationGuardPassed':True,'normalFreezePassed':True,'stagedWhitespaceCheck':{'exit':2,'log':pin(check['log']),'interpretation':'Exactly one blank EOF line in byte-exact copied successful build log. Original evidence is retained unchanged. No trim, ignore flag, guard change or bypass was used. The ordinary staged whitespace check remains recorded as nonzero.'},'formalAcceptanceClosed':False,'countBoundary':'Packaging/validation commands are separate from frozen15 original root records and6 causal processes. Primary receipt tests remains original12.'}
write_new(Q/'validation-summary.json',summary)
review=T/'p0-45-canonical-builder-static-review-20261015.json';d=json.loads(review.read_text())
block=[k for k in ['blockingFindings','blockingPacketFindings'] if k in d];assert block and all(d[k]==[] for k in block)
files=[Path(r['log']) for r in rows]+[review,review.with_suffix('.md'),T/'p0-45-root-runtime-attribution-20261015.json',T/'p0-45-run-final-command-20261015.py',Path(__file__).resolve()]
files=list(dict.fromkeys(files)); mapping=json.loads((Q/'evidence-map.json').read_text()); refs=json.loads((Q/'private-references.json').read_text()); known={p['path']:p for p in refs['references']}
marker=b'PRIVATE '+b'KEY-----'
for f in files:
 assert stat.S_ISREG(f.lstat().st_mode) and not f.is_symlink()
 b=f.read_bytes();assert len(b)<=1048576 and marker not in b
 row=pin(f);target=Q/'evidence'/(row['sha256']+'-'+f.name)
 if target.exists():assert target.read_bytes()==b
 else:
  with target.open('xb') as out:out.write(b)
 mapping['copies'].append({'original':row,'copy':target.relative_to(Q).as_posix()});known[row['path']]=row
refs['references']=[known[k] for k in sorted(known)]
for name,data in [('evidence-map.json',mapping),('private-references.json',refs)]:
 (Q/name).write_text(json.dumps(data,indent=2)+'\n')
receipt=json.loads((Q/'receipt.json').read_text());receipt['artifacts']=[{'path':f.relative_to(Q).as_posix(),'sha256':pin(f)['sha256']} for f in sorted(Q.rglob('*')) if f.is_file() and f.name!='receipt.json'];(Q/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert all(f.stat().st_size<=1048576 and marker not in f.read_bytes() for f in Q.rglob('*') if f.is_file())
print(json.dumps({'files':len(receipt['artifacts'])+1,'artifacts':len(receipt['artifacts']),'privateReferences':len(known),'immutableEvidencePreserved':True,'formalAcceptanceClosed':False}))
