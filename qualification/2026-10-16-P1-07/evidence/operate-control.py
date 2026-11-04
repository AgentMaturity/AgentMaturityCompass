from pathlib import Path
import datetime,hashlib,json,subprocess,sys
b=Path('/private/tmp/p1-07-gate-qualification-20261016');mode=sys.argv[1];number=int(sys.argv[2]);assert mode in ['apply','restore'] and number in [1,2,3]
binding=json.loads((b/'fresh-source-binding.json').read_text());q=Path(binding['freshCheckout']);s=Path('/Users/sid/.codex/worktrees/p2-07-scim-qualification/AgentMaturityCompass');r=Path('/Users/sid/.codex/worktrees/p1-09-implementation/AgentMaturityCompass');design=b/'control-design'
operators=json.loads((design/'operators.json').read_text())['operators'];op=operators[number-1];target=q/op['target'];baseline=json.loads((b/'p107-fresh-canonical-outcome.json').read_text());assert baseline['actualExit']==0 and baseline['tests']['numFailedTests']==0 and not baseline['taskErrors'] and not baseline['unhandledErrors']
assert json.loads((design/'review.json').read_text())['blockers']==[]
manifest=json.loads((design/'pins.json').read_text())
for row in manifest['inputs']+manifest['outputs']:
 data=Path(row['path']).read_bytes();assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=q,text=True).strip()==binding['sourceCommit']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=s,text=True).strip()==binding['sourceCommit']
assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=s,text=True)==''
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=q,text=True)==''
precommit=json.loads((b/'precommit-source-review/review.json').read_text());assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=r,text=True)==precommit['heldWork']['RStatusExact18Rows']
assert subprocess.check_output(['git','diff','--cached','--name-only'],cwd=r,text=True)==''
for row in binding['sourceCompiledConfigAndNewFilesExact']:
 for root in [s,q]:
  if root==q and mode=='restore' and row['relativePath']==op['target']:continue
  data=(root/row['relativePath']).read_bytes();assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],str(root/row['relativePath'])
natives=json.loads((b/'source-native-compiled-pins.json').read_text())['nativePins']+[binding['freshNative']]
for row in natives:
 p=Path(row['path']);st=p.stat();assert st.st_ino==row['inode'] and st.st_nlink==row['nlink'] and hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
originals=b/'control-originals';originals.mkdir(exist_ok=True,mode=0o700);saved=originals/f'm{number}-original.ts'
if mode=='apply':
 assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=q,text=True)==''
 if number>1:
  prior=json.loads((b/f'p107-m{number-1}-restored-outcome.json').read_text());assert prior['actualExit']==0 and prior['tests']['numTotalTests']==baseline['tests']['numTotalTests'] and not prior['taskErrors'] and not prior['unhandledErrors']
 data=target.read_bytes();assert len(data)==op['original']['bytes'] and hashlib.sha256(data).hexdigest()==op['original']['sha256']
 with saved.open('xb') as f:f.write(data)
 patch=Path(op['patch']['path']);assert hashlib.sha256(patch.read_bytes()).hexdigest()==op['patch']['sha256']
 subprocess.run(['git','apply','--check',str(patch)],cwd=q,check=True)
 subprocess.run(['git','apply',str(patch)],cwd=q,check=True)
 data=target.read_bytes();assert len(data)==op['mutant']['bytes'] and hashlib.sha256(data).hexdigest()==op['mutant']['sha256']
 assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=q,text=True)==' M '+op['target']+'\n'
else:
 assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=q,text=True)==' M '+op['target']+'\n'
 data=target.read_bytes();assert len(data)==op['mutant']['bytes'] and hashlib.sha256(data).hexdigest()==op['mutant']['sha256']
 actual=json.loads((b/f'p107-m{number}-outcome.json').read_text());assert actual['actualExit']==1 and actual['tests']['numFailedTests']>0 and not actual['unhandledErrors']
 assert (b/f'm{number}-classification.json').exists()
 data=saved.read_bytes();assert len(data)==op['original']['bytes'] and hashlib.sha256(data).hexdigest()==op['original']['sha256']
 target.write_bytes(data)
 assert subprocess.check_output(['git','status','--porcelain=v1'],cwd=q,text=True)==''
 assert target.read_bytes()==data
out={'schema':'p107-owned-source-control-operation/1','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation':mode,'number':number,'name':op['name'],'freshCheckout':str(q),'sourceCommit':binding['sourceCommit'],'target':op['target'],'actualBytes':target.stat().st_size,'actualSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'expected':op['mutant' if mode=='apply' else 'original'],'otherBound32InputsExactExceptOwnedTarget':True,'allThreeNativePinsExact':True,'sourceAndBorrowedCheckoutUnmodified':True,'compiledOutputMutation':False,'forceResetRestoreNoVerifyBaselineOrWaiver':False}
with (b/f'm{number}-{mode}.json').open('x') as f:json.dump(out,f,indent=2);f.write('\n')
print(json.dumps(out))
