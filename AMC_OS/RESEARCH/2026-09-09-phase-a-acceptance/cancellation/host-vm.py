# Prepared only. Requires explicit release; never changes shared engine state.
import os,pathlib,json,subprocess,sys,datetime,hashlib,signal

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

config,plan,planPaths,planHashes,guestRoot=admitted_plan(sys.argv[1],'host')
for key in ['installScript','qualifyScript','setupEnvironment','colima']:
 require(not absolute(config[key]).is_relative_to(guestRoot), 'host helper/input cannot live in fresh guest root')
 require(file_hash(config[key])==config[key+'Sha256'], key+' bytes do not match release')
require(file_hash(config['runner'])==config['runnerSha256'], 'runner bytes do not match release')
require(file_hash(plan['qualification']['apparmorProfile'])==plan['qualification']['apparmorProfileSha256'], 'restrictive profile bytes do not match release')
require(config['installScript']!=config['qualifyScript'], 'helper paths must be distinct')
setup=read_config(config['setupEnvironment'])
require(isinstance(setup.get('commandEnvironment'),dict) and all(isinstance(k,str) and isinstance(v,str) for k,v in setup['commandEnvironment'].items()), 'invalid owned VM command environment')
require(isinstance(setup.get('unsetForCommands'),list) and all(isinstance(k,str) for k in setup['unsetForCommands']), 'invalid environment removal list')
root=absolute(config['receiptDirectory']);root.mkdir(mode=0o700,exist_ok=False)
env=os.environ.copy();env.update(setup['commandEnvironment'])
for key in setup['unsetForCommands']:env.pop(key,None)
for key in list(env):
 if key.startswith('AMC_') or key in ['NODE_OPTIONS','NODE_PATH']:env.pop(key,None)
commands=[]
def interrupted(signum,frame): raise InterruptedError('host operation interrupted by signal '+str(signum))
signal.signal(signal.SIGTERM,interrupted)
def run(name,args,timeout):
 at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (root/(name+'.stdout.log')).open('xb') as out,(root/(name+'.stderr.log')).open('xb') as err:
  p=subprocess.Popen(args,env=env,stdout=out,stderr=err,start_new_session=True)
  try:code=p.wait(timeout=timeout);error=None
  except BaseException as exc:
   code=-1;error=repr(exc)
   try:os.killpg(p.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:p.wait(timeout=15)
   except subprocess.TimeoutExpired:
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    p.wait(timeout=10)
 commands.append({'name':name,'argv':args,'exitCode':code,'error':error,'startedAt':at,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 (root/'commands.json').write_text(json.dumps(commands,indent=2)+'\n');return code
def profile_state(name):
 raw=(root/(name+'.stdout.log')).read_text().strip()
 try:
  parsed=json.loads(raw);rows=parsed if isinstance(parsed,list) else [parsed]
 except json.JSONDecodeError:rows=[json.loads(line) for line in raw.splitlines() if line.strip()]
 require(all(isinstance(row,dict) for row in rows), 'invalid VM state rows')
 matches=[row for row in rows if row.get('name')=='amc-qual']
 return {'matches':matches,'stopped':len(matches)==1 and isinstance(matches[0].get('status'),str) and matches[0]['status'].lower()=='stopped'}
started=False;initialAdmitted=False;initialState=None;finalState=None;failure=None;cleanupErrors=[]
try:
 require(run('vm-initial-state',[config['colima'],'list','--json'],30)==0, 'initial VM state could not be observed')
 initialState=profile_state('vm-initial-state')
 require(initialState['stopped'], 'refusing VM mutation: exactly one existing amc-qual profile must be Stopped')
 initialAdmitted=True
 started=True
 assert run('vm-start',[config['colima'],'--profile','amc-qual','start'],90)==0
 require(all(file_hash(path)==planHashes[name] for name,path in planPaths.items() if name!='host'), 'nested config changed after admission')
 assert run('vm-install',[config['colima'],'--profile','amc-qual','ssh','--','python3',config['installScript'],config['installConfig']],180)==0
 require(all(file_hash(path)==planHashes[name] for name,path in planPaths.items() if name!='host'), 'nested config changed after installation')
 assert run('vm-validation',[config['colima'],'--profile','amc-qual','ssh','--','python3',config['qualifyScript'],config['qualifyConfig']],600)==0
except BaseException as e:failure=repr(e)
finally:
 stopped=False
 # Attempt cleanup only after the fresh pre-start Stopped observation was admitted.
 # A rejected initial state must never lead to stop, even if the profile is running.
 if started:
  stopExited=False
  try:
   stopExited=run('vm-stop',[config['colima'],'--profile','amc-qual','stop'],90)==0
  except BaseException as error:cleanupErrors.append({'phase':'stop','error':repr(error)})
  try:
   if run('vm-final-state',[config['colima'],'list','--json'],30)==0:
    finalState=profile_state('vm-final-state');stopped=stopExited and finalState['stopped']
  except BaseException as error:cleanupErrors.append({'phase':'final-state','error':repr(error)})
 (root/'host-receipt.json').write_text(json.dumps({'source':config['source'],'guestRoot':str(guestRoot),'configurationSha256':planHashes,'ok':initialAdmitted and failure is None and stopped and not cleanupErrors,'error':failure,'initialState':initialState,'initialAdmitted':initialAdmitted,'startAttempted':started,'stopAttempted':started,'finalState':finalState,'stopped':stopped,'cleanupErrors':cleanupErrors,'commands':commands,'environment':setup['commandEnvironment']},indent=2)+'\n')
if failure is not None or not stopped:raise SystemExit(1)
