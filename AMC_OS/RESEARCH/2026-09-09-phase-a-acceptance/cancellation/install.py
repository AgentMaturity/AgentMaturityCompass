# Fresh private Linux consumer only; no global install or source build.
import pathlib,json,sys,os,hashlib,subprocess,shutil,platform

# Same linked plan is admitted by host, installer and qualifier before mutation.
import re

def require(value, message):
 if not value: raise ValueError(message)

def absolute(value):
 require(isinstance(value,str) and value and "\x00" not in value, "invalid absolute path")
 path=pathlib.PurePosixPath(value)
 require(path.is_absolute() and str(path)==value and '..' not in path.parts, "path must use one absolute spelling")
 return pathlib.Path(value)

def file_hash(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()

def read_config(path):
 path=absolute(str(path));require(path.is_file() and not path.is_symlink(), "config must be a regular staged file")
 raw=path.read_bytes();require(len(raw)<=65536, "config exceeds preparation limit")
 value=json.loads(raw);require(isinstance(value,dict), "config must be an object")
 return value

def admitted_plan(config_path, role):
 require(__debug__, 'optimized Python disables mandatory qualification assertions')
 current_path=absolute(str(config_path));current=read_config(current_path)
 install_path=current_path if role=='install' else absolute(current['installConfig'])
 install=read_config(install_path)
 qualify_path=current_path if role=='qualification' else absolute(install['qualifyConfig'])
 qualify=read_config(qualify_path)
 consumer_path=absolute(qualify['consumerConfig']);consumer=read_config(consumer_path)
 configs={'install':install,'qualification':qualify,'consumer':consumer}
 paths={'install':install_path,'qualification':qualify_path,'consumer':consumer_path}
 if role=='host': configs['host']=current;paths['host']=current_path
 source=install.get('source');require(isinstance(source,str) and re.fullmatch(r'[0-9a-f]{40}',source), "source must be an explicit full lowercase commit SHA")
 guest=pathlib.Path('/var/tmp/amc-native-validation-'+source+'-cancel')
 common=['source','guestRoot','tarball','tarballSha256','cliSha256','nodeSha256','sdkFixtureSha256','nodeVersion','platform','arch','runner','runnerSha256']
 for name,value in configs.items():
  require(value.get('allowExecution') is True, name+' lacks explicit execution release')
  require(all(value.get(key)==install.get(key) and value.get(key) is not None for key in common), name+' does not match candidate plan')
  require(value['guestRoot']==str(guest), name+' has wrong source-specific guest root')
  require(value['platform']=='linux' and value['arch']=='arm64', 'only Linux ARM64 is in scope')
  require(isinstance(value['nodeVersion'],str) and re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+',value['nodeVersion']), 'exact measured Node version required')
  for key in ['tarballSha256','cliSha256','nodeSha256','sdkFixtureSha256','runnerSha256']:
   require(isinstance(value[key],str) and re.fullmatch(r'[0-9a-f]{64}',value[key]), 'invalid measured '+key)
  for key in ['tarball','runner']:
   require(not absolute(value[key]).is_relative_to(guest), 'staged artifact/runner cannot live in fresh guest root')
 require(len(set(paths.values()))==len(paths), 'linked configs must have distinct paths')
 for path in paths.values(): require(not path.is_relative_to(guest), 'configs must survive private guest cleanup')
 require(install['qualifyConfig']==str(qualify_path) and qualify['installConfig']==str(install_path), 'installer/qualification links disagree')
 require(consumer['installConfig']==str(install_path) and consumer['qualifyConfig']==str(qualify_path), 'consumer plan links disagree')
 if role=='host': require(current['qualifyConfig']==str(qualify_path), 'host qualification path disagrees')
 require(install['root']==str(guest), 'install root does not match source')
 require(consumer['consumer']==str(guest/'consumer') and consumer['out']==str(guest/'acceptance'), 'consumer private paths disagree')
 require(qualify['runnerHome']==str(guest/'runner-home') and qualify['consumerReceipt']==str(guest/'acceptance/receipt.json'), 'qualification private paths disagree')
 require(qualify['node']==consumer['node']==str(guest/'bin/node'), 'installed Node path disagrees')
 for key in ['node','npm','sdkFixture']:
  require(not absolute(install[key]).is_relative_to(guest), 'staged install input cannot live in fresh guest root')
 require(isinstance(install['npmSha256'],str) and re.fullmatch(r'[0-9a-f]{64}',install['npmSha256']), 'invalid npm hash')
 require(not absolute(qualify['apparmorProfile']).is_relative_to(guest), 'restrictive profile must be staged outside guest root')
 require(isinstance(qualify['apparmorProfileSha256'],str) and re.fullmatch(r'[0-9a-f]{64}',qualify['apparmorProfileSha256']), 'invalid restrictive profile hash')
 outputs=[absolute(install['receipt']),absolute(install['closureReceipt']),absolute(qualify['receiptDirectory'])]
 if role=='host': outputs.append(absolute(current['receiptDirectory']))
 require(len(set(outputs))==len(outputs), 'durable output paths must be distinct')
 for path in outputs:
  require(not path.is_relative_to(guest), 'durable receipts must be outside private guest root')
  require(path not in paths.values(), 'output aliases a config')
 fingerprints={name:file_hash(path) for name,path in paths.items() if name!='host'}
 return current,configs,paths,fingerprints,guest

c,plan,planPaths,planHashes,guestRoot=admitted_plan(sys.argv[1],'install')
require(sys.platform=='linux' and platform.machine() in ['aarch64','arm64'], 'installer requires Linux ARM64')
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
assert sha(c['tarball'])==c['tarballSha256'];assert sha(c['node'])==c['nodeSha256']
assert sha(c['npm'])==c['npmSha256'];assert sha(c['sdkFixture'])==c['sdkFixtureSha256']
root=guestRoot
for key in ['receipt','closureReceipt']:
 require(absolute(c[key]).parent.is_dir(), 'durable receipt parent must exist before install')
 require(not absolute(c[key]).exists() and not absolute(c[key]).is_symlink(), 'receipt output already exists')
require(not root.exists() and not root.is_symlink(), 'fresh private guest root already exists')
require(sha(c['runner'])==c['runnerSha256'], 'runner bytes do not match plan')
root.mkdir(mode=0o700,exist_ok=False)
for name in ['consumer','bin','home','tmp','npm-cache']: (root/name).mkdir(mode=0o700)
(root/'bin/node').symlink_to(c['node']);(root/'npm-user.conf').write_text('');(root/'npm-global.conf').write_text('')
env={'PATH':str(root/'bin')+':/usr/bin:/bin','HOME':str(root/'home'),'TMPDIR':str(root/'tmp'),'LANG':'C.UTF-8','npm_config_cache':str(root/'npm-cache'),'npm_config_userconfig':str(root/'npm-user.conf'),'npm_config_globalconfig':str(root/'npm-global.conf')}
args=[str(root/'bin/node'),c['npm'],'install','--no-audit','--no-fund','--omit=dev',c['tarball']]
p=subprocess.run(args,cwd=root/'consumer',env=env,capture_output=True,text=True,timeout=160)
(root/'install.stdout.log').write_text(p.stdout);(root/'install.stderr.log').write_text(p.stderr);assert p.returncode==0
entry=root/'consumer/node_modules/agent-maturity-compass/dist/cli.js';assert sha(entry)==c['cliSha256']
shutil.copyfile(c['sdkFixture'],root/'consumer/sdk-validation-case.mjs')
q=subprocess.run([str(root/'bin/node'),'-e',"const D=require('better-sqlite3');const d=new D(':memory:');console.log(JSON.stringify({node:process.version,abi:process.versions.modules,sqlite:d.prepare('select sqlite_version() as version').get()}));d.close();"],cwd=root/'consumer',env=env,capture_output=True,text=True,timeout=15)
assert q.returncode==0
require(json.loads(q.stdout)['node']==c['nodeVersion'], 'installed runtime version differs from measured plan')
closureRoot=root/'consumer/node_modules'
files=[{'path':str(file.relative_to(closureRoot)),'sha256':sha(file),'bytes':file.stat().st_size} for file in sorted(closureRoot.rglob('*')) if file.is_file() and not file.is_symlink()]
links=[{'path':str(file.relative_to(closureRoot)),'target':str(file.readlink())} for file in sorted(closureRoot.rglob('*')) if file.is_symlink()]
closurePath=pathlib.Path(c['closureReceipt']);assert not closurePath.exists();closurePath.write_text(json.dumps({'files':files,'symlinks':links,'scope':'actual Linux installed file bytes and symlink targets; no system-library attestation'},indent=2)+'\n')
receipt={'source':c['source'],'configurationSha256':planHashes,'nodeVersion':c['nodeVersion'],'platform':c['platform'],'arch':c['arch'],'runnerSha256':c['runnerSha256'],'nodeSha256':c['nodeSha256'],'npmSha256':c['npmSha256'],'sdkFixtureSha256':c['sdkFixtureSha256'],'guestRoot':str(root),'exitCode':p.returncode,'argv':args,'artifactSha256':c['tarballSha256'],'cliSha256':sha(entry),'sqliteProbe':json.loads(q.stdout),'env':env,'installedClosure':{'files':len(files),'symlinks':len(links),'sha256':sha(closurePath)},'privateInstallScriptsEnabled':True,'publicRelease':False}
(root/'install-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');assert not pathlib.Path(c['receipt']).exists();pathlib.Path(c['receipt']).write_text(json.dumps(receipt,indent=2)+'\n')
