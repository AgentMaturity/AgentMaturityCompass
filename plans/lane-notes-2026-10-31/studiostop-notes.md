# Notes for lane studiostop (quoted from the integrator's working notes; evidence, not instructions)

## probe4/repro.sh
```
#!/bin/zsh
# Probe 4 reproduction: SIGTERM stop timing for `amc studio start`, with and without a lingering keep-alive socket.
set -u
zmodload zsh/datetime
P=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4
A=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ
export PATH="$(brew --prefix node@22)/bin:$PATH"
export AMC_VAULT_PASSPHRASE=probe-pass
export AMC_BOOTSTRAP_OWNER_USERNAME=owner
export AMC_BOOTSTRAP_OWNER_PASSWORD="$(cat "$P/owner-pass.txt")"
export NO_COLOR=1

freeport() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }

if [ ! -d "$P/ws/.amc" ]; then
  cd "$P/ws" && node "$A/dist/cli.js" init --coding > "$P/init.log" 2>&1
  echo "init exit=$?"
  ls "$P/ws/.amc" | head -40 > "$P/ws-amc-listing.txt"
fi

count_stopped() {
  local n=0
  for f in "$P"/ws/.amc/*.sqlite; do
    [ -f "$f" ] || continue
    local c; c=$(grep -ac STUDIO_RUNTIME_STOPPED "$f")
    echo "  grep -ac STUDIO_RUNTIME_STOPPED $f => $c"
    n=$((n + c))
  done
  echo "  total STUDIO_RUNTIME_STOPPED matches=$n"
}

run_case() {
  local label=$1 keepalive=$2
  local PORT GW PX MT DB
  PORT=$(freeport); GW=$(freeport); PX=$(freeport); MT=$(freeport); DB=$(freeport)
  echo "=== case $label keepalive=$keepalive api=$PORT gw=$GW proxy=$PX metrics=$MT dash=$DB"
  echo "  before: $(count_stopped | tail -1)"
  AMC_GATEWAY_PORT=$GW AMC_PROXY_PORT=$PX AMC_METRICS_PORT=$MT \
    node "$A/dist/cli.js" studio start --workspace "$P/ws" --bind 127.0.0.1 --port "$PORT" --dashboard-port "$DB" \
    > "$P/studio-$label.log" 2>&1 &
  local SPID=$!
  local ready=0
  for i in {1..80}; do
    if curl -fsS "http://127.0.0.1:$PORT/readyz" > "$P/readyz-$label.json" 2>/dev/null; then ready=1; break; fi
    if ! kill -0 "$SPID" 2>/dev/null; then echo "  studio died before ready"; break; fi
    sleep 0.5
  done
  echo "  ready=$ready pid=$SPID readyz=$(cat "$P/readyz-$label.json" 2>/dev/null | head -c 200)"
  if [ "$ready" != 1 ]; then kill -KILL "$SPID" 2>/dev/null; tail -20 "$P/studio-$label.log"; return; fi
  local KPID=""
  if [ "$keepalive" = 1 ]; then
    node -e "const http=require('http');const a=new http.Agent({keepAlive:true});http.get({host:'127.0.0.1',port:$PORT,path:'/readyz',agent:a},r=>{r.resume();setTimeout(()=>{},60000)})" &
    KPID=$!
    sleep 1
    echo "  established sockets to api port before TERM:"; lsof -nP -iTCP:"$PORT" -sTCP:ESTABLISHED 2>/dev/null | sed 's/^/    /'
  fi
  local t0s t0 t1 t1s
  t0s=$(date +%s); t0=$EPOCHREALTIME
  kill -TERM "$SPID"
  local alive=1
  for i in {1..600}; do
    if ! kill -0 "$SPID" 2>/dev/null; then alive=0; break; fi
    sleep 0.1
  done
  t1=$EPOCHREALTIME; t1s=$(date +%s)
  if [ "$alive" = 1 ]; then
    echo "  HUNG: still alive after 60s, sending SIGKILL"; kill -KILL "$SPID" 2>/dev/null
  fi
  wait "$SPID" 2>/dev/null; local rc=$?
  echo "  exit rc=$rc date_before=$t0s date_after=$t1s elapsed_s=$(( t1s - t0s )) elapsed_precise=$(printf '%.3f' $(( t1 - t0 )))"
  [ -n "$KPID" ] && kill "$KPID" 2>/dev/null
  echo "  after:"; count_stopped
  echo "  state file present: $(ls "$P"/ws/.amc/studio/*.json 2>/dev/null | tr '\n' ' ')"
  echo "  studio log tail:"; tail -5 "$P/studio-$label.log" | sed 's/^/    /'
}

run_case keepalive 1
run_case nokeepalive 0
run_case keepalive2 1

```

## probe4/repro2.sh
```
#!/bin/zsh
# Probe 4: one keep-alive case with lsof polling during shutdown to see when the lingering socket closes vs when the process exits.
set -u
zmodload zsh/datetime
P=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4
A=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ
export PATH="$(brew --prefix node@22)/bin:$PATH"
export AMC_VAULT_PASSPHRASE=probe-pass
export NO_COLOR=1
freeport() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
PORT=$(freeport); GW=$(freeport); PX=$(freeport); MT=$(freeport); DB=$(freeport)
echo "=== lsof-polled keepalive case api=$PORT"
AMC_GATEWAY_PORT=$GW AMC_PROXY_PORT=$PX AMC_METRICS_PORT=$MT \
  node "$A/dist/cli.js" studio start --workspace "$P/ws" --bind 127.0.0.1 --port "$PORT" --dashboard-port "$DB" > "$P/studio-polled.log" 2>&1 &
SPID=$!
for i in {1..80}; do curl -fsS "http://127.0.0.1:$PORT/readyz" >/dev/null 2>&1 && break; sleep 0.5; done
node -e "const http=require('http');const a=new http.Agent({keepAlive:true});http.get({host:'127.0.0.1',port:$PORT,path:'/readyz',agent:a},r=>{r.resume();r.on('end',()=>console.log('client: response ended '+Date.now()));setTimeout(()=>{},60000)});a.on&&0" &
KPID=$!
sleep 1
t0=$EPOCHREALTIME
echo "TERM sent at $(printf '%.3f' $t0)"
kill -TERM "$SPID"
for i in {1..400}; do
  now=$EPOCHREALTIME
  alive=$(kill -0 "$SPID" 2>/dev/null && echo yes || echo no)
  socks=$(lsof -nP -p "$SPID" -a -iTCP 2>/dev/null | grep -c ESTABLISHED)
  listen=$(lsof -nP -p "$SPID" -a -iTCP 2>/dev/null | grep -c LISTEN)
  echo "  +$(printf '%.2f' $(( now - t0 )))s alive=$alive established=$socks listening=$listen"
  [ "$alive" = no ] && break
  sleep 0.25
done
kill "$KPID" 2>/dev/null
wait "$SPID" 2>/dev/null; echo "exit rc=$?"

```

## probe4/repro3.sh
```
#!/bin/zsh
# Probe 4: measure /readyz latency (headers vs end) for curl keep-alive, curl Connection: close, and a node keep-alive client.
set -u
zmodload zsh/datetime
P=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4
A=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ
export PATH="$(brew --prefix node@22)/bin:$PATH"
export AMC_VAULT_PASSPHRASE=probe-pass
export NO_COLOR=1
freeport() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
PORT=$(freeport); GW=$(freeport); PX=$(freeport); MT=$(freeport); DB=$(freeport)
AMC_GATEWAY_PORT=$GW AMC_PROXY_PORT=$PX AMC_METRICS_PORT=$MT \
  node "$A/dist/cli.js" studio start --workspace "$P/ws" --bind 127.0.0.1 --port "$PORT" --dashboard-port "$DB" > "$P/studio-latency.log" 2>&1 &
SPID=$!
for i in {1..80}; do curl -fsS "http://127.0.0.1:$PORT/readyz" >/dev/null 2>&1 && break; sleep 0.5; done
echo "=== curl default (HTTP/1.1 keep-alive) x3: starttransfer total"
for i in 1 2 3; do curl -sS -o /dev/null -w '%{http_code} starttransfer=%{time_starttransfer}s total=%{time_total}s size=%{size_download}\n' "http://127.0.0.1:$PORT/readyz"; done
echo "=== curl Connection: close x2"
for i in 1 2; do curl -sS -o /dev/null -H 'Connection: close' -w '%{http_code} starttransfer=%{time_starttransfer}s total=%{time_total}s\n' "http://127.0.0.1:$PORT/readyz"; done
echo "=== response headers"
curl -sS -D - -o /dev/null "http://127.0.0.1:$PORT/readyz" | sed 's/^/    /'
echo "=== node keep-alive client: time to headers / time to end, then second request on same socket"
node -e "
const http=require('http');const a=new http.Agent({keepAlive:true});
function one(label){return new Promise(res=>{const t0=Date.now();const req=http.get({host:'127.0.0.1',port:$PORT,path:'/readyz',agent:a},r=>{const th=Date.now()-t0;let n=0;r.on('data',d=>{n+=d.length});r.on('end',()=>{console.log(label+': status='+r.statusCode+' headers@'+th+'ms end@'+(Date.now()-t0)+'ms bytes='+n+' content-length='+r.headers['content-length']+' te='+r.headers['transfer-encoding']+' conn='+r.headers['connection']);res();});});req.on('error',e=>{console.log(label+': error '+e.message);res();});});}
(async()=>{await one('ka#1');await one('ka#2');await one('ka#3');process.exit(0);})();
"
echo "=== node Connection: close client"
node -e "
const http=require('http');const t0=Date.now();
http.get({host:'127.0.0.1',port:$PORT,path:'/readyz',headers:{connection:'close'}},r=>{const th=Date.now()-t0;r.resume();r.on('end',()=>{console.log('close: headers@'+th+'ms end@'+(Date.now()-t0)+'ms');process.exit(0)})});
"
echo "=== node keep-alive client to /healthz"
node -e "
const http=require('http');const a=new http.Agent({keepAlive:true});const t0=Date.now();
http.get({host:'127.0.0.1',port:$PORT,path:'/healthz',agent:a},r=>{const th=Date.now()-t0;r.resume();r.on('end',()=>{console.log('healthz ka: headers@'+th+'ms end@'+(Date.now()-t0)+'ms');process.exit(0)})});
"
echo "=== node keep-alive client to gateway /healthz on $GW"
node -e "
const http=require('http');const a=new http.Agent({keepAlive:true});const t0=Date.now();
const req=http.get({host:'127.0.0.1',port:$GW,path:'/healthz',agent:a},r=>{const th=Date.now()-t0;r.resume();r.on('end',()=>{console.log('gateway healthz ka: status='+r.statusCode+' headers@'+th+'ms end@'+(Date.now()-t0)+'ms');process.exit(0)})});req.on('error',e=>{console.log('gateway err '+e.message);process.exit(0)});
"
kill -TERM "$SPID"; wait "$SPID" 2>/dev/null; echo "studio exit rc=$?"

```

## probe4/repro4.sh
```
#!/bin/zsh
# Probe 4: deterministic alignment test. SIGTERM sent (a) 61.5 s after the API port starts listening, i.e. just after the
# 60 s scheduler tick fires, and (b) 20 s after listening as a control. Observer spy2.cjs logs tick/close timings.
set -u
zmodload zsh/datetime
P=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4
A=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ
export PATH="$(brew --prefix node@22)/bin:$PATH"
export AMC_VAULT_PASSPHRASE=probe-pass
export NO_COLOR=1
freeport() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }

run_case() {
  local label=$1 delay=$2
  local PORT GW PX MT DB
  PORT=$(freeport); GW=$(freeport); PX=$(freeport); MT=$(freeport); DB=$(freeport)
  local LOG="$P/spy-$label.log"; : > "$LOG"
  echo "=== case $label: SIGTERM at listen+${delay}s api=$PORT"
  NODE_OPTIONS="--require $P/spy2.cjs" PROBE4_SPY_LOG="$LOG" AMC_GATEWAY_PORT=$GW AMC_PROXY_PORT=$PX AMC_METRICS_PORT=$MT \
    node "$A/dist/cli.js" studio start --workspace "$P/ws" --bind 127.0.0.1 --port "$PORT" --dashboard-port "$DB" > "$P/studio-$label.log" 2>&1 &
  local SPID=$!
  local listenAt=""
  for i in {1..1200}; do
    if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then listenAt=$EPOCHREALTIME; break; fi
    if ! kill -0 "$SPID" 2>/dev/null; then echo "  studio died"; tail -5 "$P/studio-$label.log"; return; fi
    sleep 0.05
  done
  echo "  api listening at $(printf '%.3f' $listenAt)"
  # wait until listen+delay
  while (( EPOCHREALTIME - listenAt < delay )); do sleep 0.05; done
  local t0=$EPOCHREALTIME
  kill -TERM "$SPID"
  echo "  SIGTERM at listen+$(printf '%.2f' $(( t0 - listenAt )))s"
  local alive=1
  for i in {1..900}; do
    if ! kill -0 "$SPID" 2>/dev/null; then alive=0; break; fi
    sleep 0.1
  done
  local t1=$EPOCHREALTIME
  if [ "$alive" = 1 ]; then echo "  HUNG >90s, SIGKILL"; kill -KILL "$SPID" 2>/dev/null; fi
  wait "$SPID" 2>/dev/null; local rc=$?
  echo "  exit rc=$rc stop_elapsed=$(printf '%.2f' $(( t1 - t0 )))s"
  echo "  STOPPED events in ledger: $(sqlite3 "$P/ws/.amc/evidence.sqlite" "select count(*) from evidence_events where meta_json like '%STUDIO_RUNTIME_STOPPED%';" 2>&1)"
  echo "  observer log:"; sed 's/^/    /' "$LOG"
}

run_case tick61 61.5
run_case ctrl20 20

```

## probe4/repro5.sh
```
#!/bin/zsh
# Probe 4: run the smoke again with the tick-logging observer and take macOS `sample` stacks of the Studio child
# inside the 30 s block (+25 s) and around the 60 s tick / SIGTERM window (+66..+90 s).
set -u
zmodload zsh/datetime
P=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4
C=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/ci/clone
export PATH="$(brew --prefix node@22)/bin:$PATH"
LOG="$P/spy-smoke2.log"; : > "$LOG"; mkdir -p "$P/samples"
cd "$C"
T0=$(date +%s)
NODE_OPTIONS="--require $P/spy2.cjs --perf-basic-prof" PROBE4_SPY_LOG="$LOG" node dist/cli.js e2e smoke --mode local --json > "$P/smoke-spy2.json" 2> "$P/smoke-spy2.stderr" &
SMK=$!
PID=""
for i in {1..1500}; do
  if grep -q 'spy loaded' "$LOG" 2>/dev/null; then PID=$(grep 'spy loaded' "$LOG" | head -1 | sed 's/.*pid=\([0-9]*\).*/\1/'); break; fi
  if ! kill -0 "$SMK" 2>/dev/null; then echo "smoke ended before studio child started"; break; fi
  sleep 0.2
done
childStart=$EPOCHREALTIME
echo "studio child pid=$PID at $(printf '%.3f' $childStart)"
take() {
  local at=$1 dur=$2
  while (( EPOCHREALTIME - childStart < at )); do sleep 0.1; done
  if kill -0 "$PID" 2>/dev/null; then
    local now=$(( EPOCHREALTIME - childStart ))
    sample "$PID" "$dur" -mayDie -file "$P/samples/s${at}.txt" >/dev/null 2>&1
    echo "sampled at child+$(printf '%.1f' $now)s for ${dur}s -> samples/s${at}.txt ($(wc -l < "$P/samples/s${at}.txt" 2>/dev/null) lines)"
  else
    echo "child gone before +${at}s"
  fi
}
take 25 2
take 64 1
take 70 1
take 76 1
take 82 1
take 88 1
take 94 1
take 100 1
wait "$SMK"; echo "smoke exit=$? elapsed=$(( $(date +%s) - T0 ))s"
echo "--- observer log"; cat "$LOG"

```

## probe4/spy.cjs
```
// Probe 4 observer: preloaded via NODE_OPTIONS=--require into every node process the smoke spawns.
// It only activates inside the `amc studio start` child and only appends timestamps to PROBE4_SPY_LOG.
// It changes no behaviour: it wraps net.Server.prototype.close to log begin/end, adds a SIGTERM listener,
// an unref'd event-loop lag monitor and an unref'd 9 s-after-SIGTERM handle dump.
const fs = require("fs");
const LOG = process.env.PROBE4_SPY_LOG;
const argv = process.argv.slice(1);
const isStudioStart = argv.includes("studio") && argv.includes("start");
if (LOG && isStudioStart) {
  const t0 = Date.now();
  let termAt = 0;
  const log = (m) => {
    try {
      fs.appendFileSync(LOG, `${new Date().toISOString()} +${String(Date.now() - t0).padStart(6)}ms pid=${process.pid}${termAt ? ` term+${Date.now() - termAt}ms` : ""} ${m}\n`);
    } catch {}
  };
  log(`spy loaded node=${process.version} argv=${argv.join(" ")}`);
  const net = require("net");
  const origClose = net.Server.prototype.close;
  net.Server.prototype.close = function (cb) {
    let addr = null;
    try { addr = this.address(); } catch {}
    const started = Date.now();
    const self = this;
    this.getConnections((e, c) => log(`Server.close begin ${JSON.stringify(addr)} connections=${c}`));
    return origClose.call(this, function (err) {
      log(`Server.close done ${JSON.stringify(addr)} after ${Date.now() - started}ms err=${err ? String(err) : "none"}`);
      if (typeof cb === "function") cb.call(self, err);
    });
  };
  process.on("SIGTERM", () => {
    termAt = Date.now();
    log("SIGTERM received");
    setTimeout(() => {
      const handles = (process._getActiveHandles ? process._getActiveHandles() : []).map((h) => {
        const type = h && h.constructor ? h.constructor.name : typeof h;
        const extra = [];
        try {
          if (type === "Socket" && h.localPort !== undefined) extra.push(`local=${h.localAddress}:${h.localPort} remote=${h.remoteAddress}:${h.remotePort} readyState=${h.readyState} pending=${h.pending}`);
          if (type === "Server") extra.push(`addr=${JSON.stringify(h.address())}`);
          if (type === "Timeout" || type === "Timer") extra.push(`unref=${typeof h.hasRef === "function" ? !h.hasRef() : "?"} repeat=${h._repeat}`);
          if (type === "ChildProcess") extra.push(`child pid=${h.pid} spawnargs=${(h.spawnargs || []).join(" ").slice(0, 120)}`);
          if (type === "FSWatcher" || type === "StatWatcher") extra.push(`watcher`);
        } catch (e) { extra.push(`err=${e.message}`); }
        return `${type}(${extra.join(" ")})`;
      });
      const reqs = (process._getActiveRequests ? process._getActiveRequests() : []).map((r) => (r && r.constructor ? r.constructor.name : typeof r));
      log(`9s after SIGTERM, process still alive. activeHandles=[${handles.join(", ")}] activeRequests=[${reqs.join(", ")}]`);
    }, 9000).unref();
  });
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = now - last - 200;
    if (lag > 400) log(`event loop blocked ~${lag}ms`);
    last = now;
  }, 200).unref();
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    log(`stderr: ${String(chunk).trim().slice(0, 600)}`);
    return origStderrWrite(chunk, ...rest);
  };
  process.on("exit", (code) => log(`exit code=${code}`));
  process.on("beforeExit", () => log("beforeExit (event loop drained)"));
  process.on("unhandledRejection", (reason) => { log(`unhandledRejection: ${reason && reason.stack ? reason.stack.slice(0, 800) : String(reason)}`); throw reason; });
}

```

## probe4/spy2.cjs
```
// Probe 4 observer: preloaded via NODE_OPTIONS=--require into every node process the smoke spawns.
// It only activates inside the `amc studio start` child and only appends timestamps to PROBE4_SPY_LOG.
// It changes no behaviour: it wraps net.Server.prototype.close to log begin/end, adds a SIGTERM listener,
// an unref'd event-loop lag monitor and an unref'd 9 s-after-SIGTERM handle dump.
const fs = require("fs");
const LOG = process.env.PROBE4_SPY_LOG;
const argv = process.argv.slice(1);
const isStudioStart = argv.includes("studio") && argv.includes("start");
if (LOG && isStudioStart) {
  const t0 = Date.now();
  let termAt = 0;
  const log = (m) => {
    try {
      fs.appendFileSync(LOG, `${new Date().toISOString()} +${String(Date.now() - t0).padStart(6)}ms pid=${process.pid}${termAt ? ` term+${Date.now() - termAt}ms` : ""} ${m}\n`);
    } catch {}
  };
  log(`spy loaded node=${process.version} argv=${argv.join(" ")}`);
  const net = require("net");
  const origClose = net.Server.prototype.close;
  net.Server.prototype.close = function (cb) {
    let addr = null;
    try { addr = this.address(); } catch {}
    const started = Date.now();
    const self = this;
    this.getConnections((e, c) => log(`Server.close begin ${JSON.stringify(addr)} connections=${c}`));
    return origClose.call(this, function (err) {
      log(`Server.close done ${JSON.stringify(addr)} after ${Date.now() - started}ms err=${err ? String(err) : "none"}`);
      if (typeof cb === "function") cb.call(self, err);
    });
  };
  const origSetInterval = global.setInterval;
  global.setInterval = function (fn, ms, ...args) {
    if (ms === 60_000 && typeof fn === "function") {
      log("60s interval armed");
      const wrapped = function (...a) { const t = Date.now(); log("60s scheduler tick fired"); const r = fn.apply(this, a); log("60s scheduler tick sync part returned after " + (Date.now() - t) + "ms"); return r; };
      return origSetInterval.call(global, wrapped, ms, ...args);
    }
    return origSetInterval.call(global, fn, ms, ...args);
  };
  process.on("SIGTERM", () => {
    termAt = Date.now();
    log("SIGTERM received");
    setTimeout(() => {
      const handles = (process._getActiveHandles ? process._getActiveHandles() : []).map((h) => {
        const type = h && h.constructor ? h.constructor.name : typeof h;
        const extra = [];
        try {
          if (type === "Socket" && h.localPort !== undefined) extra.push(`local=${h.localAddress}:${h.localPort} remote=${h.remoteAddress}:${h.remotePort} readyState=${h.readyState} pending=${h.pending}`);
          if (type === "Server") extra.push(`addr=${JSON.stringify(h.address())}`);
          if (type === "Timeout" || type === "Timer") extra.push(`unref=${typeof h.hasRef === "function" ? !h.hasRef() : "?"} repeat=${h._repeat}`);
          if (type === "ChildProcess") extra.push(`child pid=${h.pid} spawnargs=${(h.spawnargs || []).join(" ").slice(0, 120)}`);
          if (type === "FSWatcher" || type === "StatWatcher") extra.push(`watcher`);
        } catch (e) { extra.push(`err=${e.message}`); }
        return `${type}(${extra.join(" ")})`;
      });
      const reqs = (process._getActiveRequests ? process._getActiveRequests() : []).map((r) => (r && r.constructor ? r.constructor.name : typeof r));
      log(`9s after SIGTERM, process still alive. activeHandles=[${handles.join(", ")}] activeRequests=[${reqs.join(", ")}]`);
    }, 9000).unref();
  });
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = now - last - 200;
    if (lag > 400) log(`event loop blocked ~${lag}ms`);
    last = now;
  }, 200).unref();
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    log(`stderr: ${String(chunk).trim().slice(0, 600)}`);
    return origStderrWrite(chunk, ...rest);
  };
  process.on("exit", (code) => log(`exit code=${code}`));
  process.on("beforeExit", () => log("beforeExit (event loop drained)"));
  process.on("unhandledRejection", (reason) => { log(`unhandledRejection: ${reason && reason.stack ? reason.stack.slice(0, 800) : String(reason)}`); throw reason; });
}

```

## probe4/smoke.json
```
{
  "status": "PASS",
  "mode": "local",
  "generatedTs": 1793434990715,
  "steps": [
    {
      "id": "workspace-bootstrap",
      "status": "PASS",
      "ms": 108310,
      "details": [
        "workspace=/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace",
        "report=/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/bootstrap/bootstrap_1793434845352.json"
      ]
    },
    {
      "id": "fake-upstream",
      "status": "PASS",
      "ms": 9,
      "details": [
        "upstream=http://127.0.0.1:60346",
        "gatewayPort=60187"
      ]
    },
    {
      "id": "studio-start",
      "status": "PASS",
      "ms": 23153,
      "details": [
        "studio=http://127.0.0.1:60186",
        "console=http://127.0.0.1:60186/console"
      ]
    },
    {
      "id": "lease-issue",
      "status": "PASS",
      "ms": 342,
      "details": [
        "lease issued for agent=default"
      ]
    },
    {
      "id": "gateway-and-toolhub-cycle",
      "status": "PASS",
      "ms": 37113,
      "details": [
        "gateway receipt minted",
        "toolhub intent+execute completed"
      ]
    },
    {
      "id": "diagnostic-and-ledger",
      "status": "PASS",
      "ms": 2865,
      "details": [
        "runId=65671598-96fa-490b-ac8b-d4885666b25f",
        "transparencyEntries=12",
        "merkleLeafCount=12"
      ]
    },
    {
      "id": "forecast-refresh",
      "status": "PASS",
      "ms": 2943,
      "details": [
        "forecast=/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/forecast/scopes/workspace/latest.json"
      ]
    },
    {
      "id": "bench-create-verify",
      "status": "PASS",
      "ms": 1978,
      "details": [
        "benchId=bench_d9ee866a44cbf8c3",
        "sha=1baae55781fd6da2217025f4d91f273762f84d9612bc69844b9dea9b22e276a0"
      ]
    },
    {
      "id": "backup-create-verify",
      "status": "PASS",
      "ms": 10955,
      "details": [
        "backup=/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/backup/smoke.amcbackup"
      ]
    },
    {
      "id": "release-pack-verify",
      "status": "PASS",
      "ms": 15025,
      "details": [
        "bundle=/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/smoke.amcrelease"
      ]
    },
    {
      "id": "studio-stop",
      "status": "PASS",
      "ms": 36,
      "details": [
        "studio child terminated gracefully (SIGTERM)",
        "shutdown audit event recorded"
      ]
    }
  ],
  "artifacts": {
    "workspace": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace",
    "bootstrapReport": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/bootstrap/bootstrap_1793434845352.json",
    "diagnosticReport": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/reports/smoke-latest.md",
    "runId": "65671598-96fa-490b-ac8b-d4885666b25f",
    "forecastLatest": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/forecast/scopes/workspace/latest.json",
    "bench": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/bench/exports/workspace/workspace/smoke.amcbench",
    "backup": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/workspace/.amc/backup/smoke.amcbackup",
    "releaseBundle": "/var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-5jjfj6/smoke.amcrelease",
    "studioShutdownEventHash": "97a5e5d6232150c28e53f99b6ceffe06ffdae6c8b9b583ee6e0991f753b0c0c2"
  },
  "warnings": []
}

```

## probe4/repro.out
```
init exit=0
=== case keepalive keepalive=1 api=60215 gw=60216 proxy=60217 metrics=60218 dash=60219
  before:   total STUDIO_RUNTIME_STOPPED matches=0
  ready=1 pid=40562 readyz={"status":"READY","reasons":[],"checks":{"opsPolicySignatureValid":true,"forecastPolicySignatureValid":true,"benchPolicySignatureValid":true,"auditPolicySignatureValid":true,"auditMapSignatureValid":t
  established sockets to api port before TERM:
    COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
    node    40562  sid   26u  IPv4 0x2497d382386f13f8      0t0  TCP 127.0.0.1:60215->127.0.0.1:60261 (ESTABLISHED)
    node    41638  sid   12u  IPv4 0xd58e00b30b3dc1ca      0t0  TCP 127.0.0.1:60261->127.0.0.1:60215 (ESTABLISHED)
  exit rc=0 date_before=1793434844 date_after=1793434848 elapsed_s=4 elapsed_precise=4.095
  after:
  grep -ac STUDIO_RUNTIME_STOPPED /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/evidence.sqlite => 2
  total STUDIO_RUNTIME_STOPPED matches=2
run_case:41: no matches found: /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/studio/*.json
  state file present: 
  studio log tail:
    Studio API: http://127.0.0.1:60215
    Gateway: http://127.0.0.1:60216
    Proxy: http://127.0.0.1:60217
    Dashboard: http://127.0.0.1:60219
    Metrics: http://127.0.0.1:60218/metrics
=== case nokeepalive keepalive=0 api=60264 gw=60265 proxy=60266 metrics=60267 dash=60268
  before:   total STUDIO_RUNTIME_STOPPED matches=2
  ready=1 pid=41897 readyz={"status":"READY","reasons":[],"checks":{"opsPolicySignatureValid":true,"forecastPolicySignatureValid":true,"benchPolicySignatureValid":true,"auditPolicySignatureValid":true,"auditMapSignatureValid":t
  exit rc=0 date_before=1793434856 date_after=1793434856 elapsed_s=0 elapsed_precise=0.110
  after:
  grep -ac STUDIO_RUNTIME_STOPPED /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/evidence.sqlite => 3
  total STUDIO_RUNTIME_STOPPED matches=3
run_case:41: no matches found: /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/studio/*.json
  state file present: 
  studio log tail:
    Studio API: http://127.0.0.1:60264
    Gateway: http://127.0.0.1:60265
    Proxy: http://127.0.0.1:60266
    Dashboard: http://127.0.0.1:60268
    Metrics: http://127.0.0.1:60267/metrics
=== case keepalive2 keepalive=1 api=60281 gw=60282 proxy=60283 metrics=60284 dash=60285
  before:   total STUDIO_RUNTIME_STOPPED matches=3
  ready=1 pid=42337 readyz={"status":"READY","reasons":[],"checks":{"opsPolicySignatureValid":true,"forecastPolicySignatureValid":true,"benchPolicySignatureValid":true,"auditPolicySignatureValid":true,"auditMapSignatureValid":t
  established sockets to api port before TERM:
    COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
    node    42337  sid   26u  IPv4  0x646c10116bc373c      0t0  TCP 127.0.0.1:60281->127.0.0.1:60309 (ESTABLISHED)
    node    43082  sid   12u  IPv4 0xb293738e81474bdd      0t0  TCP 127.0.0.1:60309->127.0.0.1:60281 (ESTABLISHED)
  exit rc=0 date_before=1793434866 date_after=1793434871 elapsed_s=5 elapsed_precise=4.778
  after:
  grep -ac STUDIO_RUNTIME_STOPPED /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/evidence.sqlite => 4
  total STUDIO_RUNTIME_STOPPED matches=4
run_case:41: no matches found: /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws/.amc/studio/*.json
  state file present: 
  studio log tail:
    Studio API: http://127.0.0.1:60281
    Gateway: http://127.0.0.1:60282
    Proxy: http://127.0.0.1:60283
    Dashboard: http://127.0.0.1:60285
    Metrics: http://127.0.0.1:60284/metrics

```

## probe4/repro4.out
```
=== case tick61: SIGTERM at listen+61.5s api=61030
  api listening at 1793435470.845
  SIGTERM at listen+61.52s
  HUNG >90s, SIGKILL
  exit rc=137 stop_elapsed=97.52s
  STOPPED events in ledger: 5
  observer log:
    2026-10-31T08:31:09.156Z +     1ms pid=98132 spy loaded node=v22.23.3 argv=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ/dist/cli.js studio start --workspace /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws --bind 127.0.0.1 --port 61030 --dashboard-port 61034
    2026-10-31T08:31:10.787Z +  1631ms pid=98132 60s interval armed
    2026-10-31T08:31:11.789Z +  2633ms pid=98132 event loop blocked ~2427ms
    2026-10-31T08:32:10.789Z + 61633ms pid=98132 60s scheduler tick fired
    2026-10-31T08:32:14.260Z + 65104ms pid=98132 60s scheduler tick sync part returned after 3471ms
=== case ctrl20: SIGTERM at listen+20s api=61183
  api listening at 1793435632.243
  SIGTERM at listen+20.02s
  exit rc=0 stop_elapsed=0.21s
  STOPPED events in ledger: 6
  observer log:
    2026-10-31T08:33:50.386Z +     1ms pid=4740 spy loaded node=v22.23.3 argv=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ/dist/cli.js studio start --workspace /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws --bind 127.0.0.1 --port 61183 --dashboard-port 61187
    2026-10-31T08:33:52.194Z +  1808ms pid=4740 60s interval armed
    2026-10-31T08:33:54.286Z +  3900ms pid=4740 event loop blocked ~3691ms
    2026-10-31T08:34:12.260Z + 21874ms pid=4740 term+0ms SIGTERM received
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61183} connections=0
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61183} after 0ms err=none
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61187} connections=0
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61187} after 0ms err=none
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61184} connections=0
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61184} after 0ms err=none
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61185} connections=0
    2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61185} after 0ms err=none
    2026-10-31T08:34:12.416Z + 22030ms pid=4740 term+156ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61186} connections=0
    2026-10-31T08:34:12.416Z + 22030ms pid=4740 term+156ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61186} after 0ms err=none
    2026-10-31T08:34:12.425Z + 22039ms pid=4740 term+165ms beforeExit (event loop drained)
    2026-10-31T08:34:12.425Z + 22039ms pid=4740 term+165ms exit code=0

```

## probe4/repro5.out
```
studio child pid=7805 at 1793435732.498
sampled at child+25.1s for 2s -> samples/s25.txt (    5200 lines)
sampled at child+64.1s for 1s -> samples/s64.txt (    1957 lines)
sampled at child+70.0s for 1s -> samples/s70.txt (    4749 lines)
sampled at child+76.0s for 1s -> samples/s76.txt (    4942 lines)
sampled at child+82.1s for 1s -> samples/s82.txt (    5081 lines)
sampled at child+88.0s for 1s -> samples/s88.txt (     392 lines)
child gone before +94s
child gone before +100s
smoke exit=1 elapsed=192s
--- observer log
2026-10-31T08:35:32.288Z +     1ms pid=7805 spy loaded node=v22.23.3 argv=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/ci/clone/dist/cli.js studio start --workspace /var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-yp5HmZ/workspace --bind 127.0.0.1 --port 61222 --dashboard-port 61226
2026-10-31T08:35:37.303Z +  5015ms pid=7805 60s interval armed
2026-10-31T08:35:38.629Z +  6341ms pid=7805 event loop blocked ~6135ms
2026-10-31T08:35:42.959Z + 10671ms pid=7805 event loop blocked ~4130ms
2026-10-31T08:35:46.883Z + 14595ms pid=7805 event loop blocked ~3724ms
2026-10-31T08:35:47.784Z + 15496ms pid=7805 event loop blocked ~701ms
2026-10-31T08:36:19.262Z + 46974ms pid=7805 event loop blocked ~31278ms
2026-10-31T08:36:37.305Z + 65017ms pid=7805 60s scheduler tick fired
2026-10-31T08:36:40.584Z + 68296ms pid=7805 60s scheduler tick sync part returned after 3279ms

```

## probe4/spy-tick61.log
```
2026-10-31T08:31:09.156Z +     1ms pid=98132 spy loaded node=v22.23.3 argv=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ/dist/cli.js studio start --workspace /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws --bind 127.0.0.1 --port 61030 --dashboard-port 61034
2026-10-31T08:31:10.787Z +  1631ms pid=98132 60s interval armed
2026-10-31T08:31:11.789Z +  2633ms pid=98132 event loop blocked ~2427ms
2026-10-31T08:32:10.789Z + 61633ms pid=98132 60s scheduler tick fired
2026-10-31T08:32:14.260Z + 65104ms pid=98132 60s scheduler tick sync part returned after 3471ms

```

## probe4/spy-smoke2.log
```
2026-10-31T08:35:32.288Z +     1ms pid=7805 spy loaded node=v22.23.3 argv=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/ci/clone/dist/cli.js studio start --workspace /var/folders/kt/r665rkj5159bw9zt4rp2n66c0000gn/T/amc-e2e-local-yp5HmZ/workspace --bind 127.0.0.1 --port 61222 --dashboard-port 61226
2026-10-31T08:35:37.303Z +  5015ms pid=7805 60s interval armed
2026-10-31T08:35:38.629Z +  6341ms pid=7805 event loop blocked ~6135ms
2026-10-31T08:35:42.959Z + 10671ms pid=7805 event loop blocked ~4130ms
2026-10-31T08:35:46.883Z + 14595ms pid=7805 event loop blocked ~3724ms
2026-10-31T08:35:47.784Z + 15496ms pid=7805 event loop blocked ~701ms
2026-10-31T08:36:19.262Z + 46974ms pid=7805 event loop blocked ~31278ms
2026-10-31T08:36:37.305Z + 65017ms pid=7805 60s scheduler tick fired
2026-10-31T08:36:40.584Z + 68296ms pid=7805 60s scheduler tick sync part returned after 3279ms

```

## probe4/spy-ctrl20.log
```
2026-10-31T08:33:50.386Z +     1ms pid=4740 spy loaded node=v22.23.3 argv=~/AgentMaturityCompass-worktrees/s442cd919/work/amc-integ/dist/cli.js studio start --workspace /private/tmp/claude-501/-Users-sid-AgentMaturityCompass/3c2ecdb1-461b-4ae0-9dc8-8aae93103c14/scratchpad/audit/probe4/ws --bind 127.0.0.1 --port 61183 --dashboard-port 61187
2026-10-31T08:33:52.194Z +  1808ms pid=4740 60s interval armed
2026-10-31T08:33:54.286Z +  3900ms pid=4740 event loop blocked ~3691ms
2026-10-31T08:34:12.260Z + 21874ms pid=4740 term+0ms SIGTERM received
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61183} connections=0
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61183} after 0ms err=none
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61187} connections=0
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61187} after 0ms err=none
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61184} connections=0
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61184} after 0ms err=none
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61185} connections=0
2026-10-31T08:34:12.261Z + 21875ms pid=4740 term+1ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61185} after 0ms err=none
2026-10-31T08:34:12.416Z + 22030ms pid=4740 term+156ms Server.close begin {"address":"127.0.0.1","family":"IPv4","port":61186} connections=0
2026-10-31T08:34:12.416Z + 22030ms pid=4740 term+156ms Server.close done {"address":"127.0.0.1","family":"IPv4","port":61186} after 0ms err=none
2026-10-31T08:34:12.425Z + 22039ms pid=4740 term+165ms beforeExit (event loop drained)
2026-10-31T08:34:12.425Z + 22039ms pid=4740 term+165ms exit code=0

```

