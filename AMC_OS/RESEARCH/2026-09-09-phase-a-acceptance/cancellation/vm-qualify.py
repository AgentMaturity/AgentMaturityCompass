# Prepared only. Root must release the source/package before invoking.
import pathlib,hashlib,json,subprocess,datetime,os,sys,shutil,signal

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

configPath=absolute(sys.argv[1]);config,plan,planPaths,planHashes,guestRoot=admitted_plan(configPath,'qualification')
require(guestRoot.is_dir() and not guestRoot.is_symlink() and guestRoot.resolve()==guestRoot, 'owned persistent guest install missing or redirected')
require(guestRoot.stat().st_uid==os.getuid() and guestRoot.stat().st_mode & 0o077==0, 'private guest ownership/mode mismatch')
installedReceipt=read_config(guestRoot/'install-receipt.json')
require(installedReceipt['source']==config['source'] and installedReceipt['guestRoot']==str(guestRoot), 'install receipt source/root mismatch')
require(installedReceipt['configurationSha256']==planHashes, 'nested configuration changed since installation')
for receiptKey,configKey in [('artifactSha256','tarballSha256'),('cliSha256','cliSha256'),('nodeSha256','nodeSha256'),('sdkFixtureSha256','sdkFixtureSha256'),('runnerSha256','runnerSha256')]:
 require(installedReceipt[receiptKey]==config[configKey], 'installed artifact identity mismatch')
require(pathlib.Path(config['node']).resolve()==absolute(plan['install']['node']).resolve(), 'installed Node symlink targets different binary')
require(file_hash(config['runner'])==config['runnerSha256'] and file_hash(config['node'])==config['nodeSha256'], 'qualification executable bytes mismatch')
absolute(config['apparmorProfile'])
require(file_hash(config['apparmorProfile'])==config['apparmorProfileSha256'], 'restrictive profile bytes mismatch')
require(file_hash(config['tarball'])==config['tarballSha256'], 'artifact changed after installation')
require(file_hash(guestRoot/'consumer/sdk-validation-case.mjs')==config['sdkFixtureSha256'], 'installed SDK fixture mismatch')
require(file_hash(guestRoot/'consumer/node_modules/agent-maturity-compass/dist/cli.js')==config['cliSha256'], 'installed CLI mismatch')
root=absolute(config['receiptDirectory']);require(not root.exists() and not root.is_symlink(), 'qualification output exists')
root.mkdir(mode=0o700,exist_ok=False)
source=pathlib.Path(config['apparmorProfile']);target=pathlib.Path('/etc/apparmor.d/bwrap-userns-restrict')
out=root/'qualification.json';result={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':{},'profileSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':config['source'],'guestRoot':str(guestRoot),'configurationSha256':planHashes}
def save():out.write_text(json.dumps(result,indent=2)+'\n')
def run(name,args,timeout=40,env=None):
 p=subprocess.Popen(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,start_new_session=True)
 timedOut=False;interruption=None
 try:stdout,stderr=p.communicate(timeout=timeout)
 except subprocess.TimeoutExpired:
  timedOut=True
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:stdout,stderr=p.communicate(timeout=15)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   stdout,stderr=p.communicate(timeout=10)
 except BaseException as error:
  interruption=repr(error)
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:stdout,stderr=p.communicate(timeout=15)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   stdout,stderr=p.communicate(timeout=10)
 result['commands'][name]={'argv':args,'exitCode':p.returncode,'stdout':stdout,'stderr':stderr,'timedOut':timedOut,'interruption':interruption};save()
 return subprocess.CompletedProcess(args,-1 if timedOut or interruption else p.returncode,stdout,stderr)
snapshot="""import pathlib,hashlib,json,subprocess
r=pathlib.Path('/etc/apparmor.d')
print(json.dumps({'files':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in r.rglob('*') if p.is_file() and not p.is_symlink()},'symlinks':{str(p):str(p.readlink()) for p in r.rglob('*') if p.is_symlink()},'profiles':sorted(pathlib.Path('/sys/kernel/security/apparmor/profiles').read_text().splitlines()),'sysctls':{k:subprocess.check_output(['sysctl','-n',k],text=True).strip() for k in ['kernel.unprivileged_userns_clone','kernel.apparmor_restrict_unprivileged_userns','kernel.apparmor_restrict_unprivileged_unconfined']}}))
"""
def state(name):
 p=run(name,['sudo','python3','-c',snapshot]);assert p.returncode==0;return json.loads(p.stdout)
installed=False;attempted=False
def interrupted(signum,frame): raise InterruptedError('qualification interrupted by signal '+str(signum))
signal.signal(signal.SIGTERM,interrupted)
try:
 assert os.getuid()!=0
 assert hashlib.sha256(pathlib.Path(config['runner']).read_bytes()).hexdigest()==config['runnerSha256']
 assert hashlib.sha256(pathlib.Path(config['node']).read_bytes()).hexdigest()==config['nodeSha256']
 assert result['profileSha256']==config['apparmorProfileSha256']
 before=state('before');result['before']=before
 assert before['sysctls']['kernel.apparmor_restrict_unprivileged_userns']=='1'
 assert not target.exists() and not target.is_symlink()
 assert not any(x.startswith('bwrap ') or x.startswith('unpriv_bwrap ') for x in before['profiles'])
 for local in ['bwrap-userns-restrict','unpriv_bwrap']:assert not pathlib.Path('/etc/apparmor.d/local',local).exists()
 assert 'flags=(unconfined)' not in source.read_text()
 assert run('parse',['sudo','apparmor_parser','-Q','-K',str(source)]).returncode==0
 assert run('install',['sudo','install','-o','root','-g','root','-m','0644',str(source),str(target)]).returncode==0
 installed=True;attempted=True
 assert run('load',['sudo','apparmor_parser','-a','-K',str(target)]).returncode==0
 result['loaded']=state('loaded-state')
 assert 'bwrap (enforce)' in result['loaded']['profiles'] and 'unpriv_bwrap (enforce)' in result['loaded']['profiles']
 consumerEnv={'PATH':str(pathlib.Path(config['node']).parent)+':/usr/bin:/bin','HOME':config['runnerHome'],'TMPDIR':'/tmp','LANG':'C.UTF-8','CI':'1','NO_COLOR':'1'}
 pathlib.Path(config['runnerHome']).mkdir(exist_ok=False)
 consumer=run('actual-installed-native-validation',[config['node'],config['runner'],config['consumerConfig']],timeout=300,env=consumerEnv)
 result['consumer']=json.loads(pathlib.Path(config['consumerReceipt']).read_text())
 assert consumer.returncode==0 and result['consumer']['ok'] is True and result['consumer'].get('endpointClosed') is True
 result['assertions']={'sysctlsUnchangedDuringTest':result['loaded']['sysctls']==before['sysctls'],'consumerReceiptProduced':True}
 assert all(result['assertions'].values())
except BaseException as error:result['error']=repr(error)
finally:
 run('kernel-audit',['sudo','journalctl','-k','--since',result['startedAt'],'--no-pager','--output=short-iso'],timeout=30)
 if installed:
  if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==result['profileSha256']:
   if attempted:run('unload',['sudo','apparmor_parser','-R','-K',str(target)])
   run('remove-owned-profile',['sudo','rm','--',str(target)])
  else:result['restorationError']='Owned profile changed unexpectedly; retained rather than deleting it.'
 try:
  after=state('after');result['after']=after
  result['restoredExactly']=after==result.get('before')
 except Exception as error:result['restorationError']=repr(error)
 try:
  artifacts=pathlib.Path(config['consumerReceipt']).parent
  targetRaw=root/'raw';targetRaw.mkdir()
  if artifacts.exists():
   for file in sorted(artifacts.rglob('*.json')):
    rel=file.relative_to(artifacts)
    if len(rel.parts)>2 or any(part in {'workspace','home','tmp','checkpoints'} for part in rel.parts) or file.name=='sdk-input-private.json':continue
    destination=targetRaw/rel;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,destination)
 except Exception as error:result['captureError']=repr(error)
 # Delete only this fresh private install after sanitized evidence has been copied.
 # guestRoot was derived from the full source and matched to the install receipt before mutation.
 try:
  assert 'captureError' not in result, 'Evidence capture failed; retain private directory for owner inspection'
  assert not guestRoot.is_symlink() and guestRoot.resolve()==guestRoot
  if guestRoot.exists():shutil.rmtree(guestRoot)
  result['privateGuestRootRemoved']=not guestRoot.exists()
 except Exception as error:result['privateCleanupError']=repr(error)
 result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 result['ok']='error' not in result and 'captureError' not in result and 'restorationError' not in result and result.get('privateGuestRootRemoved') is True and result.get('restoredExactly') is True and result['commands'].get('unload',{}).get('exitCode')==0 and result['commands'].get('remove-owned-profile',{}).get('exitCode')==0
 save()
print(json.dumps({'ok':result['ok'],'error':result.get('error'),'restoredExactly':result.get('restoredExactly'),'consumerStatus':result.get('consumer',{}).get('status'),'output':str(out)}))
raise SystemExit(0 if result['ok'] else 1)
