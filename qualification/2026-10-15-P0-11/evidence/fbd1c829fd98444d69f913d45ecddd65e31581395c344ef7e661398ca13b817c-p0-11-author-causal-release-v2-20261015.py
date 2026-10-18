from pathlib import Path
import json, hashlib, datetime, subprocess, sys, os
B=Path('/private/tmp/p0-11-causal-qualification-20261015')
R=Path('/Users/sid/.codex/worktrees/p0-11-qualification/AgentMaturityCompass')
T=Path('/private/tmp')
SOURCE='fa3c3e5554f8a4013fb50cc373a4b5d644e6924e'
def read(p):return json.loads(Path(p).read_text())
def pin(p):
 p=Path(p);d=p.read_bytes();return {'path':str(p),'bytes':len(d),'sha256':hashlib.sha256(d).hexdigest()}
def verify(p):
 a=pin(p['path']);assert all(a[k]==p[k] for k in ['path','bytes','sha256']),p['path']
control=sys.argv[1]
proposal=read(B/'proposal.json');ids=[r['id'] for r in proposal['recipes']]
assert ids==['C1-map-missing-path-fail-open','C2-tool-recorder-error-propagates','L1-optional-historical-literal-whole-branch-removal'] and control in ids
pos=ids.index(control)
assert not (B/'ACTIVE').exists() and not (B/'HALTED.json').exists() and not (B/('started--'+control+'.json')).exists()
for previous in ids[:pos]:
 result=read(B/('result--'+previous+'.json'))
 assert result['restoredExactly'] and result['baseline']['passed']==result['restored']['passed']==7
 assert result['mutant']['classification'] in ['survivor','body-assertion-failures-observed','body-failures-observed']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()==SOURCE
assert not subprocess.check_output(['git','status','--porcelain=v1'],cwd=R,text=True)
reviews={'sealedSetupReview': ('p0-11-controller-sealed-setup-review-20261015.json', '17782c03541ccfe9be068809b2b25a1a4ffbba2d4bc0dde0b76354848b5ab76c'), 'staticCodeReview': ('p0-11-controller-code-static-review-20261015.json', '94899d5f0c2c54ba5625432c1a24942102f447a946f34e0a30b7e940d2323aba'), 'rootInputVerification': ('p0-11-causal-root-sealed-input-verification-20261015.json', 'f0e93980ecf307cc50ac8fa74b85d8d8b87839fcfaa3fe7b0d31ff50e2d2fce0'), 'recipeReview': ('p0-11-recipes-static-review-20261015.json', 'b7619c6e45d47c4782a6cd7be7607f4debc8a8180c649aa16e99a8b7a9b7b278'), 'originalCorporaReview': ('p0-11-original-corpora-independent-review-20261015.json', 'ad9128b687def99c672387e0c33ab1926a53082bb0b5087fa8a28905cb1d537a')}
bound={}
for key,(name,sha) in reviews.items():
 path=T/name;assert pin(path)['sha256']==sha;bound[key]=pin(path)
for key in ['sealedSetupReview','originalCorporaReview']:
 d=read(bound[key]['path']);assert d['allReadsFinished'] and d['blockingFindings']==[] and d['formalAcceptanceClosed'] is False
assert read(bound['staticCodeReview']['path'])['blockingFindings']==[] and read(bound['staticCodeReview']['path'])['allReadsFinished']
setup=read(B/'setup.json');pres=read(B/'inputs/preservation.json')
for row in read(B/'setup-index.json')['artifacts']+pres['immutableInputs']:verify(row)
expected=read(B/'inputs/source-manifest.json')|read(B/'inputs/compiled-manifest.json')
assert len(expected)==12891
for name,sha in expected.items():
 assert pin(R/name)['sha256']==pin(B/'closure'/name)['sha256']==sha,name
n=pres['borrowedNative'];st=Path(n['path']).stat();assert pin(n['path'])|{'device':st.st_dev,'inode':st.st_ino,'nlink':st.st_nlink,'mode':st.st_mode&0o7777}==n
guard_path=T/'p0-11-qualification-20261015/command-pre-causal-normal-freeze/command.json';guard=read(guard_path)
assert guard['exit']==0 and guard['head']==guard['headAfter']==SOURCE and guard['groupAbsentByESRCH']
verify(read(bound['rootInputVerification']['path'])['preCausalNormalFreeze']);verify(read(bound['rootInputVerification']['path'])['preCausalNormalFreezeLog'])
paths={'setupSha256':B/'setup.json','controllerSha256':B/'driver/controller.py','proposalSha256':B/'proposal.json','sourceManifestSha256':B/'inputs/source-manifest.json','compiledManifestSha256':B/'inputs/compiled-manifest.json','preservationSha256':B/'inputs/preservation.json','observerSha256':B/'driver/observer-reporter.mjs','setupIndexSha256':B/'setup-index.json','caseIdentitiesSha256':B/'inputs/case-identities.json'}
release={k:pin(path)['sha256'] for k,path in paths.items()}
release.update(authorization='START_P011_CAUSAL_'+control,control=control,releasedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),setupPath=str(B/'setup.json'),setupIndexPath=str(B/'setup-index.json'),controllerPath=str(B/'driver/controller.py'),closureRoot=str(B/'closure'),parentRoot=str(R),rootAuthor='Root; user-authorized bounded P0-11 qualification only',noHumanApprovalClaim=True,releaseAuthor=pin(Path(__file__)),preCausalNormalFreeze=pin(guard_path),priorControlsCompleted=ids[:pos],scope='Only the selected unchanged original map7 or recording7 source-mode baseline/mutant/restored control. No source ownership transfer, product guard waiver, dist edit or test/config/deadline change.',boundaries='Borrowed dependencies and seven-key child environment. No independent install, OS/network or universal descendant proof. Failures and masks need actual review; C2 is the exact genuine recorder Error, and L1 diagnostic change is not invalid-fixture admission.',**bound)
(B/'releases').mkdir(exist_ok=True)
path=B/'releases'/(control+'.json')
with path.open('x') as out:json.dump(release,out,indent=2);out.write('\n')
print(json.dumps(pin(path)))
