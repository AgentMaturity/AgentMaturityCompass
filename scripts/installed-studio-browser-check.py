#!/usr/bin/env python3
"""Reproducible installed Studio acceptance from a pinned independent source clone."""
import argparse,datetime,hashlib,json,os,pathlib,re,secrets,shutil,signal,socket,subprocess,time,urllib.request
p=argparse.ArgumentParser(description="Installed Studio browser acceptance with pinned artifact, independent source clone, Node22, and Chromium")
for name in ['artifact','artifact-sha256','source','source-tree','shared-checkout','node','node-sha256','node-version','npm','npm-sha256','cli-sha256','dependency-root','browser-executable','browser-sha256','out']:
 p.add_argument('--'+name,required=True)
a=p.parse_args()
sha=lambda path:hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
assert re.fullmatch('[a-f0-9]{40}',a.source)
assert re.fullmatch(r'v22\.\d+\.\d+',a.node_version)
for path,expected in [(a.artifact,a.artifact_sha256),(a.node,a.node_sha256),(a.npm,a.npm_sha256),(a.browser_executable,a.browser_sha256)]:
 assert re.fullmatch('[a-f0-9]{64}',expected) and sha(path)==expected, 'Input digest mismatch'
shared_root=pathlib.Path(a.shared_checkout).resolve(strict=True)
assert shared_root.is_dir(), 'Shared checkout must be an existing directory'
source=pathlib.Path(a.source_tree).resolve()
assert not source.is_relative_to(shared_root), 'Source must be a separate fresh clone, not the shared checkout'
git_dir=source/'.git'
assert git_dir.is_dir() and not git_dir.is_symlink(), 'Linked worktrees and shared Git metadata are not admitted'
assert not (git_dir/'commondir').exists() and not (git_dir/'objects/info/alternates').exists(), 'Source Git objects must be independent'
git_env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'}
assert pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=source,env=git_env,text=True).strip()).resolve()==source
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,env=git_env,text=True).strip()==a.source
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=source,env=git_env,text=True).strip(), 'Source clone has tracked changes'
harness_paths=['scripts/studio-native-browser-check.mjs','tests/e2e/native-tasks-page.mjs','scripts/lib/nativeStudioBrowserReceipt.mjs','scripts/installed-studio-browser-check.py']
harness_hashes={}
for path in harness_paths:
 committed=subprocess.check_output(['git','show',a.source+':'+path],cwd=source,env=git_env)
 assert (source/path).read_bytes()==committed
 harness_hashes[path]=sha(source/path)
assert pathlib.Path(__file__).resolve()==source/'scripts/installed-studio-browser-check.py', 'Run this orchestrator from the pinned independent source clone'
harness_path=source/harness_paths[0]
assert pathlib.Path(a.out).is_absolute(), 'Output path must be explicit and absolute'
root=pathlib.Path(a.out).resolve()
assert not root.is_relative_to(source) and not root.is_relative_to(shared_root), 'Output must be outside source and shared checkout'
assert not root.exists() and not root.is_symlink(), 'Output must be new'
assert root.parent.is_dir(), 'Create only the parent directory in advance'
root.mkdir(mode=0o700)
for name in ['home','amc-home','tmp','owner','demo','installation','secrets']: (root/name).mkdir(mode=0o700)
private={name:root/'secrets'/name for name in ['vault','username','password']}
values={'vault':secrets.token_urlsafe(36),'username':'browser-owner','password':secrets.token_urlsafe(36)}
for name,file in private.items(): file.write_text(values[name]+'\n');file.chmod(0o600)
node=str(pathlib.Path(a.node).resolve());npm=str(pathlib.Path(a.npm).resolve());artifact=str(pathlib.Path(a.artifact).resolve())
env={'PATH':str(pathlib.Path(node).parent)+':/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(root/'home'),'USERPROFILE':str(root/'home'),'TMPDIR':str(root/'tmp'),'TMP':str(root/'tmp'),'TEMP':str(root/'tmp'),'AMC_HOME':str(root/'amc-home'),'AMC_CREDENTIALS_FILE':str(root/'amc-home'/'credentials.json'),'AMC_VAULT_REMEMBER':'0','NO_COLOR':'1','CI':'1','npm_config_userconfig':str(root/'home'/'.npmrc'),'npm_config_globalconfig':str(root/'home'/'global.npmrc'),'npm_config_cache':str(root/'home'/'.npm-cache')}
(root/'home'/'.npmrc').write_text('');(root/'home'/'global.npmrc').write_text('')
report={'sourceCommit':a.source,'artifactSha256':hashlib.sha256(pathlib.Path(artifact).read_bytes()).hexdigest(),'artifactPath':artifact,'root':str(root),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':[],'cleanup':[],'ok':False,'harnessHashes':harness_hashes,'nodeSha256':a.node_sha256,'nodeVersion':a.node_version,'browserExecutableSha256':a.browser_sha256,'helperSha256':sha(__file__),'trustBoundary':'Local pre-execution workspace key consistency; not independent external anchoring'}
secret_values=list(values.values())
def scrub(s):
 for v in secret_values:s=s.replace(v,'[fixture-secret]')
 return s
counter=0
cleanup_depth=0
def interrupted(signum,frame):
 report['interruptedBySignal']=signum
 report['error']='Operator interrupted browser acceptance'
 if cleanup_depth==0:raise KeyboardInterrupt('Signal '+str(signum))
signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGINT,interrupted)

def group_alive(pid):
 try:os.killpg(pid,0);return True
 except ProcessLookupError:return False

def reap_group(pid):
 if not group_alive(pid):return True
 for sig,seconds in [(signal.SIGTERM,5),(signal.SIGKILL,5)]:
  try:os.killpg(pid,sig)
  except ProcessLookupError:return True
  end=time.monotonic()+seconds
  while group_alive(pid) and time.monotonic()<end:time.sleep(.1)
 return not group_alive(pid)

def run(args,cwd,child_env=env,timeout=180,checked=True):
 global counter,cleanup_depth
 counter+=1
 child=None;stdout='';stderr='';failure=None;timed_out=False;exited=False;cleanup_error=None
 try:
  child=subprocess.Popen(args,cwd=cwd,env=child_env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
  stdout,stderr=child.communicate(timeout=timeout)
 except BaseException as error:
  failure=error;timed_out=isinstance(error,subprocess.TimeoutExpired)
  if not isinstance(error,Exception):report['error']='Command interrupted: '+type(error).__name__
 finally:
  # SIGINT/SIGTERM during bounded cleanup records cancellation without interrupting reaping.
  cleanup_depth+=1
  try:
   if child is not None:
    if failure is not None:
     try:os.killpg(child.pid,signal.SIGTERM)
     except ProcessLookupError:pass
     try:stdout,stderr=child.communicate(timeout=5)
     except subprocess.TimeoutExpired:
      try:os.killpg(child.pid,signal.SIGKILL)
      except ProcessLookupError:pass
      stdout,stderr=child.communicate(timeout=5)
    exited=reap_group(child.pid)
  except BaseException as error:cleanup_error=type(error).__name__+': '+str(error)
  finally:cleanup_depth-=1
  file=root/f'command-{counter:02}.log';file.write_text(scrub(stdout+'\n'+stderr));file.chmod(0o600)
  report['commands'].append({'argv':args,'cwd':str(cwd),'exitCode':child.returncode if child is not None else None,'timedOut':timed_out,'interrupted':failure is not None and not isinstance(failure,Exception),'failure':scrub(type(failure).__name__+': '+str(failure)) if failure else None,'processGroupReaped':exited,'cleanupError':scrub(cleanup_error) if cleanup_error else None,'log':str(file)})
 if failure is not None:raise failure
 if cleanup_error or not exited or (checked and child.returncode):raise RuntimeError(f'Public command {counter} failed or cleanup incomplete, see {file}')
 return subprocess.CompletedProcess(args,child.returncode,stdout,stderr)

def ports():
 result=[]
 for i in range(7):
  with socket.socket() as s:s.bind(('127.0.0.1',0));result.append(s.getsockname()[1])
 if len(set(result))!=len(result):return ports()
 return result

def environment(workspace):
 e=dict(env);port=ports()
 e.update({'AMC_WORKSPACE_DIR':str(workspace),'AMC_STUDIO_PORT':str(port[0]),'AMC_HOST_PORT':str(port[0]),'AMC_GATEWAY_PORT':str(port[1]),'AMC_PROXY_PORT':str(port[2]),'AMC_TOOLHUB_PORT':str(port[3]),'AMC_METRICS_PORT':str(port[4]),'AMC_BIND':'127.0.0.1','AMC_HOST_BIND':'127.0.0.1','AMC_ENABLE_NOTARY':'0','AMC_VAULT_PASSPHRASE_FILE':str(private['vault']),'AMC_VAULT_PASSPHRASE':values['vault'],'AMC_BOOTSTRAP_OWNER_USERNAME_FILE':str(private['username']),'AMC_BOOTSTRAP_OWNER_PASSWORD_FILE':str(private['password'])})
 return e,port

def wait_ready(url):
 end=time.monotonic()+50
 while time.monotonic()<end:
  try:
   with urllib.request.urlopen(url,timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(.2)
 raise RuntimeError('Owned Studio did not become ready')
owner_process=None;owner_log=None;demo_started=False;fixture=None;cli=None;owner_env=None;demo_env=None
try:
 (root/'installation'/'package.json').write_text('{"name":"amc-browser-consumer","private":true}')
 actual_node=run([node,'--version'],root).stdout.strip();assert actual_node==a.node_version
 run([node,npm,'install','--prefix',str(root/'installation'),'--no-audit','--no-fund',artifact],root/'installation',timeout=300)
 cli=str(root/'installation'/'node_modules'/'agent-maturity-compass'/'dist'/'cli.js')
 assert pathlib.Path(cli).is_file() and sha(cli)==a.cli_sha256, 'Installed CLI does not match candidate'
 report['installedCliSha256']=sha(cli)
 owner_env,owner_ports=environment(root/'owner');demo_env,demo_ports=environment(root/'demo')
 run([node,cli,'bootstrap'],root/'owner',owner_env)
 run([node,cli,'--agent','browser-agent','--json'],root/'owner',owner_env)
 run([node,cli,'firewall','enable','--mode','block','--json'],root/'owner',owner_env)
 monitor=root/'owner'/'.amc'/'keys'/'monitor_ed25519.pub';pin=root/'secrets'/'independent-monitor.pub';pin.write_bytes(monitor.read_bytes());pin.chmod(0o600)
 report['preExecutionMonitorSha256']=hashlib.sha256(pin.read_bytes()).hexdigest();owner_env['AMC_EXPECTED_MONITOR_FINGERPRINT']=report['preExecutionMonitorSha256']
 # Public initialization preserves the existing default signed grants; no custom policy widening.
 sentinel=root/'owner'/'user-data-sentinel.txt';sentinel.write_text('Existing fixture user data must be preserved.\n');sentinel_hash=hashlib.sha256(sentinel.read_bytes()).hexdigest()
 owner_log=(root/'owner-server-private.log').open('w');os.chmod(root/'owner-server-private.log',0o600)
 owner_process=subprocess.Popen([node,cli,'studio','start','--workspace',str(root/'owner'),'--bind','127.0.0.1','--port',str(owner_ports[0]),'--dashboard-port',str(owner_ports[5])],cwd=root/'owner',env=owner_env,stdout=owner_log,stderr=subprocess.STDOUT,start_new_session=True)
 owner_base=f'http://127.0.0.1:{owner_ports[0]}';wait_ready(owner_base+'/console/native-tasks')
 demo_started=True
 run([node,cli,'up','--demo','--no-open','--no-baseline'],root/'demo',demo_env,timeout=90)
 demo_base=f'http://127.0.0.1:{demo_ports[0]}/w/demo';wait_ready(demo_base+'/console/native-tasks')
 fixture={'schemaVersion':'amc-native-studio-browser-fixture/v1','sourceCommit':a.source,'artifactPath':artifact,'artifactSha256':report['artifactSha256'],'installedCli':cli,'ownerBase':owner_base,'demoBase':demo_base,'agentId':'browser-agent','ownerUsernameFile':str(private['username']),'ownerPasswordFile':str(private['password'])}
 fixture_file=root/'fixture.json';fixture_file.write_text(json.dumps(fixture,indent=2)+'\n');fixture_file.chmod(0o600)
 args=[node,str(harness_path),'--fixture',str(fixture_file),'--out',str(root/'browser'),'--dependency-root',str(pathlib.Path(a.dependency_root).resolve())]
 if a.browser_executable:args+=['--browser-executable',a.browser_executable]
 harness=run(args,root,env,timeout=600,checked=False)
 report['browserExitCode']=harness.returncode;report['fixtureFile']=str(fixture_file)
 report['sentinelPreserved']=hashlib.sha256(sentinel.read_bytes()).hexdigest()==sentinel_hash
except BaseException as e:report['error']=scrub(type(e).__name__+': '+str(e))
finally:
 cleanup_depth+=1
 if demo_started and cli:
  try:
   state_path=root/'demo'/'.amc'/'studio'/'state.json'
   state=json.loads(state_path.read_text()) if state_path.exists() else {}
   pid=state.get('pid');pgid=os.getpgid(pid) if pid else None
   stopped=run([node,cli,'down'],root/'demo',demo_env,timeout=40,checked=False)
   end=time.monotonic()+30
   while pid and time.monotonic()<end:
    try:os.kill(pid,0)
    except ProcessLookupError:break
    time.sleep(.2)
   alive=False
   if pid:
    try:os.kill(pid,0);alive=True
    except ProcessLookupError:pass
   group_exited=not group_alive(pgid) if pgid==pid else False
   if alive and pgid==pid:reap_group(pgid)
   report['cleanup'].append({'resource':'owned demo daemon','signalCommandExit':stopped.returncode,'knownPid':pid,'groupId':pgid,'processGroupReaped':group_exited,'ok':stopped.returncode==0 and not alive and group_exited})
  except Exception as e:report['cleanup'].append({'resource':'owned demo daemon','ok':False,'error':scrub(str(e))})
 if owner_process:
  try:
   os.killpg(owner_process.pid,signal.SIGTERM);code=owner_process.wait(timeout=40)
   exited=not group_alive(owner_process.pid)
   if not exited:reap_group(owner_process.pid)
   report['cleanup'].append({'resource':'owned foreground Studio','exitCode':code,'processGroupReaped':exited,'ok':code==0 and exited})
  except Exception as e:
   reap_group(owner_process.pid);owner_process.wait(timeout=10)
   report['cleanup'].append({'resource':'owned foreground Studio','ok':False,'forced':True,'error':scrub(str(e))})
 if owner_log:owner_log.close()
 try:
  # Browser writes its own credential-scrubbed receipt. Require its current exact scenario contract.
  browser_path=root/'browser'/'receipt.json'
  browser=json.loads(browser_path.read_text()) if browser_path.exists() else {}
  planned=browser.get('planned',[]);checks=browser.get('checks',[])
  required={'unreceived-create-explicit-identical-retry','unreceived-turn-explicit-identical-retry','explicit-closed-task-archive-retains-inspection'}
  report['browserReceiptComplete']=browser.get('ok') is True and required.issubset(planned) and len(set(planned))==len(planned) and bool(planned) and len(checks)==len(planned) and all(sum(c.get('name')==name and c.get('status')=='passed' for c in checks)==1 for name in planned) and bool(browser.get('cleanup')) and all(c.get('ok') is True for c in browser['cleanup'])
  assert browser.get('sourceCommit')==a.source and browser.get('artifactSha256')==a.artifact_sha256
  assert browser.get('installedCliSha256')==a.cli_sha256
  sessions=browser.get('sessionIds',[])
  assert sessions and len(sessions)==len(set(sessions)) and all(isinstance(s,str) and re.fullmatch('[a-f0-9-]{36}',s) for s in sessions), 'Missing or duplicate actual session IDs'
  assert report['cleanup'] and all(x.get('ok') is True for x in report['cleanup']), 'Writers must stop orderly before cold verification'
  report['coldVerifiers']=[]
  for session in sessions:
   result=run([node,cli,'--agent','browser-agent','agent-loop','verify',session,'--json'],root/'owner',owner_env,checked=False)
   parsed=json.loads(result.stdout) if result.returncode==0 else {}
   trust=parsed.get('trustRoot',{})
   valid=parsed.get('ok') is True and parsed.get('sessionId')==session and parsed.get('ledgerOk') is True and parsed.get('ledgerErrors')==[] and parsed.get('sessionChainErrors')==[] and parsed.get('unsignedRowIds')==[] and bool(parsed.get('requests')) and all(q.get('status')=='reconstructed' for q in parsed['requests']) and trust.get('anchored') is True and trust.get('expectedFingerprint')==report['preExecutionMonitorSha256']
   report['coldVerifiers'].append({'sessionId':session,'exitCode':result.returncode,'valid':valid,'output':scrub(result.stdout),'kind':'native request reconstruction'})
  ledger=run([node,cli,'session','verify','--json'],root/'owner',owner_env,checked=False)
  parsed=json.loads(ledger.stdout) if ledger.returncode==0 else {};trust=parsed.get('trustRoot',{})
  valid=parsed.get('ok') is True and parsed.get('chain',{}).get('ok') is True and parsed.get('errors')==[] and trust.get('anchored') is True and trust.get('expectedFingerprint')==report['preExecutionMonitorSha256']
  report['coldVerifiers'].append({'exitCode':ledger.returncode,'valid':valid,'output':scrub(ledger.stdout),'kind':'ledger'})
 except Exception as e:report['verificationError']=scrub(str(e))
 # Discover only fixture-generated local authentication strings, never user credentials.
 try:
  def collect(value):
   if isinstance(value,dict):
    for key,item in value.items():
     if re.search('token|password|passphrase|secret',key,re.I) and isinstance(item,str) and len(item)>=8:secret_values.append(item)
     else:collect(item)
   elif isinstance(value,list):
    for item in value:collect(item)
  for directory in ['owner','demo','amc-home']:
   for token_file in (root/directory).rglob('*.token'):
    if token_file.is_file() and not token_file.is_symlink() and token_file.stat().st_size<8192:
     value=token_file.read_text().strip()
     if value:secret_values.append(value)
   for file in (root/directory).rglob('*.json'):
    if file.is_file() and not file.is_symlink() and file.stat().st_size<2*1024*1024:
     try:collect(json.loads(file.read_text()))
     except (ValueError,UnicodeError):pass
  for file in list(root.glob('command-*.log'))+list((root/'browser').glob('*.json')):
   file.write_text(scrub(file.read_text()))
  # Raw logs and private workspace keys/tokens are not durable outputs.
  for name in ['owner-server-private.log','fixture.json']:
   (root/name).unlink(missing_ok=True)
  assert all(item.get('ok') is True for item in report['cleanup']), 'Retain private fixtures for owner cleanup after incomplete process shutdown'
  for name in ['home','amc-home','tmp','owner','demo','installation','secrets']:
   path=root/name
   assert not path.is_symlink() and path.parent==root
   shutil.rmtree(path)
  report['cleanup'].append({'resource':'private fixture credentials/workspaces/raw log','ok':True})
 except Exception as e:report['cleanup'].append({'resource':'private fixture credentials/workspaces/raw log','ok':False,'error':scrub(str(e))})
 report['ok']='error' not in report and 'interruptedBySignal' not in report and 'verificationError' not in report and report.get('browserExitCode')==0 and report.get('browserReceiptComplete') is True and report.get('sentinelPreserved') is True and all(x.get('ok') is True for x in report['cleanup']) and bool(report.get('coldVerifiers')) and all(x['exitCode']==0 and x['valid'] for x in report['coldVerifiers'])
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (root/'fixture-run-receipt.json').write_text(scrub(json.dumps(report,indent=2))+'\n')
 print(json.dumps({'ok':report['ok'],'receipt':str(root/'fixture-run-receipt.json')}))
raise SystemExit(0 if report['ok'] else 1)
