from pathlib import Path
import hashlib,json,stat,re
T=Path('/private/tmp');R=Path('/Users/sid/.codex/worktrees/p0-11-qualification/AgentMaturityCompass');Q=R/'qualification/2026-10-15-P0-11'
def pin(p):
 p=Path(p);b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def write_new(p,d):
 with p.open('x') as f:json.dump(d,f,indent=2);f.write('\n')
rows=[json.loads(s) for s in (T/'p0-11-final-commands-20261015.jsonl').read_text().splitlines()]
by={r['phase']:r for r in rows}
assert by['canonical-qualification-first']['exit']==by['precommit-normal-freeze']['exit']==0
check=by['staged-diff-check'];log=Path(check['log']).read_text();assert check['exit'] in [0,2]
lines=log.splitlines(); mapping_before=json.loads((Q/'evidence-map.json').read_text());known_copies={row['copy']:row for row in mapping_before['copies']}; diagnostics=[];i=0
while i<len(lines):
 match=re.fullmatch(r'(qualification/2026-10-15-P0-11/evidence/[^:]+):(\d+): (new blank line at EOF|trailing whitespace)\.',lines[i]);assert match,lines[i]
 rel=Path(match[1]).relative_to(Q.relative_to(R)).as_posix();assert rel in known_copies
 row=known_copies[rel];target=Q/rel;assert pin(target)['sha256']==row['original']['sha256'] and pin(row['original']['path'])==row['original']
 content=target.read_text().splitlines();number=int(match[2]);assert 0<number<=len(content)
 diagnostics.append({'copy':rel,'line':number,'diagnostic':match[3],'immutableOriginal':row['original']});i+=1
 if match[3]=='trailing whitespace':
  assert content[number-1].rstrip()!=content[number-1] and i<len(lines) and lines[i]=='+'+content[number-1];i+=1
 else:assert content[number-1]==''
assert (check['exit']==0 and not diagnostics) or (check['exit']==2 and diagnostics)

summary={'source':'fa3c3e5554f8a4013fb50cc373a4b5d644e6924e','metadataCommands':rows,'qualificationGuardPassed':True,'normalFreezePassed':True,'stagedWhitespaceCheck':{'exit':check['exit'],'log':pin(check['log']),'diagnostics':diagnostics,'interpretation':'Every recorded whitespace diagnostic is individually matched to a byte-exact copied immutable evidence body. Original bytes and the ordinary nonzero result remain unchanged; no trim, ignore flag, source guard change or bypass was used.'},'formalAcceptanceClosed':False,'countBoundary':'Packaging/validation commands are separate from frozen20 original root records and9 causal processes. Primary receipt tests is9 aggregated across separate originalmap7+telemetry2, never one9-case run.'}
write_new(Q/'validation-summary.json',summary)
review=T/'p0-11-canonical-builder-static-review-20261015.json';d=json.loads(review.read_text())
block=[k for k in ['blockingFindings','blockingPacketFindings'] if k in d];assert block and all(d[k]==[] for k in block)
files=[Path(r['log']) for r in rows]+[review,review.with_suffix('.md'),T/'p0-11-root-runtime-attribution-20261015.json',T/'p0-11-run-final-command-20261015.py',Path(__file__).resolve()]
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
