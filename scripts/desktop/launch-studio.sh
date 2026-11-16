#!/bin/sh
# Agent Maturity Compass Studio launcher: launch-studio.sh [info|workspace|demo|stop] (default demo).
# The macOS app runs it and reads the KEY=value lines it prints on stdout; on Linux amc-studio.sh runs it in a terminal.
# Lines: AMC_STATUS (progress), AMC_ERROR (why it stopped), AMC_STUDIO_URL, AMC_SESSION (the owner's console session
# cookie, macOS only), AMC_TITLE, AMC_STARTED, AMC_PACKAGE_DIGEST, AMC_NODE (the Node.js it uses) and the info paths.
# No secret goes to the log, to a file or into a process's arguments: secrets move through pipes, the environment of
# amc itself, and the macOS Keychain (security -i reads its command from stdin).
# Every network step has a time limit, and a signal (the app quitting) stops what this run started before it exits.
# The packager fills the __AMC_…__ values (scripts/desktop/files.mjs).
set -eu

MODE=${1:-demo}
STUDIO_OS=__AMC_STUDIO_OS__
APP_RESOURCES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PACKAGE="$APP_RESOURCES_DIR/__AMC_PACKAGE_NAME__"
PACKAGE_DIGEST="__AMC_PACKAGE_SHA256__"
# The one Node.js rule, from package.json engines.
NODE_MIN_MAJOR=__AMC_NODE_MIN_MAJOR__
if [ "$STUDIO_OS" = mac ]; then
  MACHINE="this Mac"
  AGAIN="click Retry"
  SUPPORT_DEFAULT="$HOME/Library/Application Support/Agent Maturity Compass"
  LOG_DIR="$HOME/Library/Logs/Agent Maturity Compass"
else
  MACHINE="this computer"
  AGAIN="start Agent Maturity Compass Studio again"
  SUPPORT_DEFAULT="${XDG_DATA_HOME:-$HOME/.local/share}/agent-maturity-compass"
  LOG_DIR="$SUPPORT_DEFAULT/Logs"
fi
# AMC_STUDIO_SUPPORT_DIR moves all app data elsewhere (a test, or the dev build); the log then lives beside it.
SUPPORT_DIR="${AMC_STUDIO_SUPPORT_DIR:-$SUPPORT_DEFAULT}"
[ -z "${AMC_STUDIO_SUPPORT_DIR:-}" ] || LOG_DIR="$SUPPORT_DIR/Logs"
LOG_FILE="$LOG_DIR/studio-launcher.log"
RUNTIME_DIR="$SUPPORT_DIR/runtime"
WORKSPACE_DIR="$SUPPORT_DIR/workspace"
DEMO_DIR="$SUPPORT_DIR/studio-workspace"
USER_FILE="$SUPPORT_DIR/console-user"
DIGEST_FILE="$RUNTIME_DIR/package.sha256"
AMC_BIN="$RUNTIME_DIR/node_modules/.bin/amc"
TIMEOUT_MARK="$LOG_DIR/.time-limit-$$"

# Time limits in seconds (a test may shorten them): the whole first install, one amc up, one amc down.
INSTALL_LIMIT=${AMC_LAUNCHER_INSTALL_LIMIT:-900}
START_LIMIT=${AMC_LAUNCHER_START_LIMIT:-300}
STOP_LIMIT=60
case "$INSTALL_LIMIT" in ''|*[!0-9]*) INSTALL_LIMIT=900 ;; esac
case "$START_LIMIT" in ''|*[!0-9]*) START_LIMIT=300 ;; esac

# The app's own ports, away from the defaults a terminal amc up uses (3210-3212, 4173, 9464), so both can run at once.
# A variable already set wins. The demo and your workspace never run together, so they share them.
export AMC_STUDIO_PORT="${AMC_STUDIO_PORT:-3232}" AMC_HOST_PORT="${AMC_HOST_PORT:-3232}" AMC_GATEWAY_PORT="${AMC_GATEWAY_PORT:-3230}"
export AMC_PROXY_PORT="${AMC_PROXY_PORT:-3231}" AMC_DASHBOARD_PORT="${AMC_DASHBOARD_PORT:-4193}" AMC_METRICS_PORT="${AMC_METRICS_PORT:-9484}"

# Preserve an explicitly selected Node/npm runtime. Finder/LaunchServices have
# a minimal PATH, so append the common installation locations as fallbacks.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"

say() { printf '%s\n' "$1"; }
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG_FILE"; }
fail() { log "$1"; say "AMC_ERROR=$1"; exit 1; }

# ---- Processes: time limits, and nothing left running when this script is stopped ----------------------------------

CHILD=""
WATCHDOG=""
STARTING_DIR=""

# Stops a process and every process under it (npm starts node, prebuild-install, node-gyp and compilers).
kill_tree() {
  kill -STOP "$1" 2>/dev/null || return 0
  pgrep -P "$1" 2>/dev/null | while IFS= read -r KID; do kill_tree "$KID"; done
  kill -TERM "$1" 2>/dev/null || true
  kill -CONT "$1" 2>/dev/null || true
}

# A signal (the app quitting, Ctrl+C) stops the running step and its children, and a Studio this run was starting.
on_signal() {
  trap - INT TERM HUP USR1
  if [ -n "$WATCHDOG" ]; then kill_tree "$WATCHDOG"; fi
  if [ -n "$CHILD" ]; then kill_tree "$CHILD"; fi
  CHILD=""
  if [ -n "$STARTING_DIR" ]; then stop_studio "$STARTING_DIR"; fi
  rm -f "$TIMEOUT_MARK"
  log "Stopped before it finished; what this run started is stopped too."
  exit 143
}
trap on_signal INT TERM HUP

# The watchdog's signal: the time limit has passed, so the running step and its children stop.
on_limit() {
  if [ -n "$CHILD" ]; then kill_tree "$CHILD"; fi
}
trap on_limit USR1

# Runs a command in the background so a signal reaches this script while it waits, stops it after LIMIT seconds, and
# returns its status, or 124 when the limit stopped it. The watchdog is a new sh (exec'd, so it holds none of this
# shell's file descriptors, and never the app's stdout pipe) that marks the timeout and sends USR1 here.
run_limited() {
  LIMIT=$1
  shift
  rm -f "$TIMEOUT_MARK"
  "$@" &
  CHILD=$!
  /bin/sh -c 'sleep "$1" && : >"$2" && kill -USR1 "$3"' sh "$LIMIT" "$TIMEOUT_MARK" "$$" </dev/null >/dev/null 2>&1 &
  WATCHDOG=$!
  # wait returns early when a trapped signal arrives; the child may still be stopping, so wait for it again.
  STATUS=0
  wait "$CHILD" || STATUS=$?
  while kill -0 "$CHILD" 2>/dev/null; do wait "$CHILD" || STATUS=$?; done
  kill_tree "$WATCHDOG"
  WATCHDOG=""
  CHILD=""
  if [ -f "$TIMEOUT_MARK" ]; then rm -f "$TIMEOUT_MARK"; return 124; fi
  return "$STATUS"
}

# A time limit in words.
limit_words() {
  if [ "$1" -ge 120 ]; then printf '%s minutes' "$(($1 / 60))"; else printf '%s seconds' "$1"; fi
}

# Runs a command in a folder (in the subshell run_limited starts, so this script stays where it is).
in_dir() {
  cd "$1"
  shift
  exec "$@"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# ---- Node.js and the runtime ----------------------------------------------------------------------------------------

# Finds node, holds it to the one rule (NODE_MIN_MAJOR or newer) and says which one it picked.
check_node() {
  NODE_FOUND=$(command -v node 2>/dev/null || true)
  if [ -z "$NODE_FOUND" ]; then
    fail "AMC needs Node.js $NODE_MIN_MAJOR or newer, and none was found on $MACHINE. Install Node.js from https://nodejs.org, then $AGAIN."
  fi
  NODE_VERSION=$(node --version 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9.+-' | cut -c1-40)
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if ! [ "$NODE_MAJOR" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    fail "AMC needs Node.js $NODE_MIN_MAJOR or newer, and the one found on $MACHINE is Node.js ${NODE_VERSION:-unknown} ($NODE_FOUND). Install a newer Node.js from https://nodejs.org, then $AGAIN."
  fi
  log "Using Node.js $NODE_VERSION at $NODE_FOUND"
  say "AMC_NODE=Node.js $NODE_VERSION ($NODE_FOUND)"
}

# Installs the included package into the version-pinned runtime when its digest changed (first launch or an upgrade).
ensure_runtime() {
  [ -f "$PACKAGE" ] || fail "This app is missing its AMC package ($PACKAGE). Download the app again."
  ACTUAL_PACKAGE_DIGEST=$(sha256_of "$PACKAGE")
  if [ "$ACTUAL_PACKAGE_DIGEST" != "$PACKAGE_DIGEST" ]; then
    fail "The AMC package inside this app failed its integrity check, so it was not installed. Download the app again."
  fi
  say "AMC_PACKAGE_DIGEST=$PACKAGE_DIGEST"
  check_node
  CURRENT_DIGEST=$(cat "$DIGEST_FILE" 2>/dev/null || true)
  [ "$CURRENT_DIGEST" != "$PACKAGE_DIGEST" ] || [ ! -x "$AMC_BIN" ] || return 0
  command -v npm >/dev/null 2>&1 || fail "AMC needs npm, which comes with Node.js, and it was not found on $MACHINE. Reinstall Node.js from https://nodejs.org, then $AGAIN."
  if [ -z "$CURRENT_DIGEST" ]; then say "AMC_STATUS=Installing AMC (first launch only). This takes a minute or two."; else say "AMC_STATUS=Updating AMC to the version in this app."; fi
  if [ -x "$AMC_BIN" ]; then
    # Stop the Studios the previous runtime started, so the upgraded runtime serves the console.
    stop_studio "$WORKSPACE_DIR"
    stop_studio "$DEMO_DIR"
  fi
  mkdir -p "$RUNTIME_DIR"
  log "Installing $PACKAGE into $RUNTIME_DIR (time limit $INSTALL_LIMIT s)"
  # npm downloads AMC's dependencies: 30 s per request and two retries, and INSTALL_LIMIT for the whole install.
  if run_limited "$INSTALL_LIMIT" npm install --prefix "$RUNTIME_DIR" --no-audit --no-fund "$PACKAGE" \
    --fetch-timeout=30000 --fetch-retries=2 --fetch-retry-maxtimeout=10000 >>"$LOG_FILE" 2>&1; then
    printf '%s\n' "$PACKAGE_DIGEST" > "$DIGEST_FILE"
    return 0
  else
    STATUS=$?
  fi
  if [ "$STATUS" = 124 ]; then
    fail "Installing AMC took longer than $(limit_words "$INSTALL_LIMIT"), so it was stopped. On first launch AMC downloads its parts from the internet. Check the network connection, then $AGAIN. Details are in $LOG_FILE."
  fi
  fail "Installing AMC failed: npm could not finish, often because $MACHINE is offline. Details are in $LOG_FILE. Check the network connection, then $AGAIN."
}

# ---- Studio ---------------------------------------------------------------------------------------------------------

# True when a workspace's state.json names a live Studio daemon (its pid in DAEMON_PID); a stale file's pid may now be another program's.
live_daemon() {
  DAEMON_PID=$(node -e 'try { const pid = require(process.argv[1]).pid; console.log(Number.isSafeInteger(pid) && pid > 0 ? pid : "") } catch {}' "$1/.amc/studio/state.json" 2>/dev/null || true)
  [ -n "$DAEMON_PID" ] && ps -ww -o command= -p "$DAEMON_PID" 2>/dev/null | grep -q '_studio-daemon'
}

# Stops the Studio of one workspace and waits for it to release its ports (amc down only signals it, and it can take
# up to 10 s). AMC_NO_AUTO_REBUILD: an old runtime about to be replaced must not repair its database engine first.
stop_studio() {
  if live_daemon "$1"; then
    run_limited "$STOP_LIMIT" in_dir "$1" env AMC_NO_AUTO_REBUILD=1 "$AMC_BIN" down >>"$LOG_FILE" 2>&1 || true
    WAITED=0
    while kill -0 "$DAEMON_PID" 2>/dev/null && [ "$WAITED" -lt 15 ]; do
      sleep 1
      WAITED=$((WAITED + 1))
    done
  else
    # No Studio daemon runs under that pid, so the state file is stale; the runtime must not trust it.
    rm -f "$1/.amc/studio/state.json"
  fi
}

# True when something on this machine accepts connections on the port (2 s at most).
port_taken() {
  node -e 'const s = require("node:net").connect(Number(process.argv[1]), "127.0.0.1"); s.setTimeout(2000, () => process.exit(1)); s.on("connect", () => process.exit(0)).on("error", () => process.exit(1))' "$1" >/dev/null 2>&1
}

# Why a taken port stops AMC, in words: another AMC Studio (told by its _studio-daemon command line), or another
# program named by its process name, or (when this user cannot see the owner) just another program.
port_problem() {
  HOLDER=$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)
  if [ -n "$HOLDER" ] && ps -ww -o command= -p "$HOLDER" 2>/dev/null | grep -q '_studio-daemon'; then
    if command -v amc >/dev/null 2>&1; then
      HOW="To stop it, type amc down in Terminal in the folder where it was started"
    else
      HOW="Stop that Studio, or quit the program that started it"
    fi
    printf '%s' "AMC could not start because another AMC Studio on $MACHINE already uses port $1, probably one started from a terminal. $HOW, then $AGAIN."
    return 0
  fi
  NAME=""
  [ -z "$HOLDER" ] || NAME=$(basename -- "$(ps -o comm= -p "$HOLDER" 2>/dev/null || true)" 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9._ -' | cut -c1-60)
  if [ -n "$NAME" ]; then NAME=" ($NAME)"; fi
  printf '%s' "AMC could not start because another program on $MACHINE uses port $1$NAME, which AMC needs. Quit that program, then $AGAIN."
}

# Starts Studio in one workspace (extra amc up options follow). A Studio it starts stays in STARTING_DIR until the
# mode has finished, so a signal before then stops it again. On failure it explains a port of the app that another
# program holds, else the last line amc wrote.
start_studio() {
  DIR=$1
  shift
  mkdir -p "$DIR"
  if live_daemon "$DIR"; then STARTED=0; else STARTED=1; STARTING_DIR=$DIR; fi
  if run_limited "$START_LIMIT" in_dir "$DIR" "$AMC_BIN" up --no-open "$@" >>"$LOG_FILE" 2>&1; then
    say "AMC_STARTED=$STARTED"
    return 0
  else
    STATUS=$?
  fi
  if [ "$STARTED" = 1 ]; then stop_studio "$DIR"; fi
  STARTING_DIR=""
  if [ "$STATUS" = 124 ]; then
    fail "AMC did not finish starting within $(limit_words "$START_LIMIT"), so it was stopped. Details are in $LOG_FILE. Then $AGAIN."
  fi
  for PORT in "$AMC_STUDIO_PORT" "$AMC_HOST_PORT" "$AMC_GATEWAY_PORT" "$AMC_PROXY_PORT" "$AMC_DASHBOARD_PORT" "$AMC_METRICS_PORT"; do
    if port_taken "$PORT"; then fail "$(port_problem "$PORT")"; fi
  done
  fail "AMC could not start: $(grep -v '^ *$' "$LOG_FILE" | tail -n 1 | cut -c1-300) Details are in $LOG_FILE."
}

# The port Studio bound (state.json apiPort), else the configured one.
studio_port() {
  PORT=$(node -e 'try { const port = require(process.argv[1]).apiPort; console.log(Number.isInteger(port) && port > 0 && port < 65536 ? port : "") } catch {}' "$1/.amc/studio/state.json" 2>/dev/null || true)
  printf '%s\n' "${PORT:-$2}"
}

# ---- macOS: secrets in the Keychain, and the owner signed in for you --------------------------------------------------

# The account of the remembered-passphrase store (src/vault/passphraseStore.ts workspaceKey): the first 32 hex digits of
# the SHA-256 of the workspace's resolved path, as amc run in that folder computes it.
workspace_key() {
  (cd "$WORKSPACE_DIR" && node -e 'console.log(require("node:crypto").createHash("sha256").update(process.cwd()).digest("hex").slice(0, 32))')
}

keychain_read() {
  security find-generic-password -a "$2" -s "$1" -w 2>/dev/null
}

# security -i reads the command from stdin, so the secret is in no process's arguments; read back to confirm.
keychain_write() {
  printf 'add-generic-password -U -a %s -s %s -w %s\n' "$2" "$1" "$3" | security -i >/dev/null 2>&1 || return 1
  [ "$(keychain_read "$1" "$2")" = "$3" ]
}

new_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
}

console_user_name() {
  NAME=$(id -un | LC_ALL=C tr -cd 'A-Za-z0-9._-' | cut -c1-64)
  printf '%s\n' "${NAME:-owner}"
}

# First start of your own workspace: a vault passphrase into the Keychain entry amc up reads (service amc-vault), the
# vault and policies (amc up), then the owner account with a generated password kept in the Keychain (service
# amc-console). amc gets the passphrase in its environment and the password on stdin, never in an argument or a file.
first_run_setup() {
  say "AMC_STATUS=Creating your workspace (first launch only)."
  VAULT_PASSPHRASE=$(keychain_read amc-vault "$KEY" || true)
  if [ -z "$VAULT_PASSPHRASE" ]; then
    if [ -f "$WORKSPACE_DIR/.amc/vault.amcvault" ]; then
      fail "Your workspace has a vault, but its passphrase is not in your macOS Keychain, so AMC cannot open it. If you know the passphrase: open Terminal, type cd \"$WORKSPACE_DIR\" && \"$AMC_BIN\" up and press Return, enter the passphrase when asked, and say yes when AMC offers to remember it. Then click Retry."
    fi
    VAULT_PASSPHRASE=$(new_secret)
    keychain_write amc-vault "$KEY" "$VAULT_PASSPHRASE" \
      || fail "AMC could not save a vault passphrase in your macOS Keychain, so it did not create the vault. Unlock your login keychain, then click Retry."
  fi
  export AMC_VAULT_PASSPHRASE="$VAULT_PASSPHRASE"
  start_studio "$WORKSPACE_DIR"
  say "AMC_STATUS=Creating your owner account."
  CONSOLE_USER=$(console_user_name)
  CONSOLE_PASSWORD=$(new_secret)
  keychain_write amc-console "$KEY" "$CONSOLE_PASSWORD" \
    || fail "AMC could not save your console password in your macOS Keychain. Unlock your login keychain, then click Retry."
  if ! printf '%s' "$CONSOLE_PASSWORD" | (cd "$WORKSPACE_DIR" && "$AMC_BIN" user init --username "$CONSOLE_USER" --password-file /dev/stdin) >>"$LOG_FILE" 2>&1; then
    fail "AMC could not create your owner account. Details are in $LOG_FILE."
  fi
  unset AMC_VAULT_PASSPHRASE VAULT_PASSPHRASE CONSOLE_PASSWORD
  printf '%s\n' "$CONSOLE_USER" > "$USER_FILE"
}

# Signs the owner in through the console's own POST /auth/login (15 s at most). The password goes from the Keychain to
# node on a pipe; only the session cookie comes back. Exit 3: the console refused the password; 1: anything else.
console_session() {
  keychain_read amc-console "$KEY" | node -e '
let password = "";
process.stdin.on("data", (chunk) => { password += chunk; }).on("end", async () => {
  try {
    const response = await fetch(process.argv[1] + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.argv[2], password: password.trim() }), signal: AbortSignal.timeout(15000) });
    const cookie = response.headers.getSetCookie().map((line) => /^amc_session=([A-Za-z0-9%._~-]+)/.exec(line)?.[1]).find(Boolean);
    if (!cookie) { console.error("Console sign-in refused: HTTP " + response.status); process.exit(response.status === 401 || response.status === 403 ? 3 : 1); }
    console.log(cookie);
  } catch (error) { console.error("Console sign-in did not answer: " + error.message); process.exit(1); }
});' "$1" "$CONSOLE_USER" 2>>"$LOG_FILE"
}

# The password in the Keychain no longer opens the owner account (changed elsewhere, or the Keychain entry was lost):
# a new one goes to the Keychain and to the account, with the vault passphrase from the Keychain.
reset_console_password() {
  VAULT_PASSPHRASE=$(keychain_read amc-vault "$KEY" || true)
  if [ -z "$VAULT_PASSPHRASE" ]; then log "No vault passphrase in the Keychain, so the console password was not reset."; return 1; fi
  CONSOLE_PASSWORD=$(new_secret)
  if ! keychain_write amc-console "$KEY" "$CONSOLE_PASSWORD"; then
    unset VAULT_PASSPHRASE CONSOLE_PASSWORD
    log "The Keychain did not take a new console password."
    return 1
  fi
  RESET=0
  printf '%s' "$CONSOLE_PASSWORD" | (cd "$WORKSPACE_DIR" && AMC_VAULT_PASSPHRASE="$VAULT_PASSPHRASE" "$AMC_BIN" user password "$CONSOLE_USER" --password-file /dev/stdin) >>"$LOG_FILE" 2>&1 || RESET=1
  unset VAULT_PASSPHRASE CONSOLE_PASSWORD
  return "$RESET"
}

# Hands the app a session for the owner. A refused password is replaced once; if signing in still fails the app shows
# why instead of a sign-in page whose password only the Keychain knows.
sign_in() {
  CONSOLE_USER=$(cat "$USER_FILE" 2>/dev/null || true)
  [ -n "$CONSOLE_USER" ] || return 0
  STATUS=0
  SESSION=$(console_session "$1") || STATUS=$?
  if [ "$STATUS" = 3 ]; then
    log "The console refused the password the Keychain holds for $CONSOLE_USER, so AMC sets a new one."
    if reset_console_password; then
      STATUS=0
      SESSION=$(console_session "$1") || STATUS=$?
    fi
  fi
  if [ "$STATUS" != 0 ] || [ -z "$SESSION" ]; then
    fail "AMC started, but could not sign you in to the Compass Console. Unlock your login keychain if macOS asks, then click Retry. Details are in $LOG_FILE."
  fi
  say "AMC_SESSION=$SESSION"
}

# ---- Linux: the owner account is made at the terminal, with a password the person types -------------------------------

create_owner_at_terminal() {
  if ! (: </dev/tty) 2>/dev/null; then
    fail "Your workspace needs an owner account, and AMC asks for its password in a terminal. Open Agent Maturity Compass Studio from your applications menu, or run amc-studio.sh in a terminal."
  fi
  CONSOLE_USER=$(console_user_name)
  say "AMC_STATUS=Create the owner account you will sign in with ($CONSOLE_USER). AMC asks for its password now."
  if ! (cd "$WORKSPACE_DIR" && "$AMC_BIN" user init --username "$CONSOLE_USER") </dev/tty >/dev/tty 2>&1; then
    fail "AMC could not create your owner account; what amc said is shown above. Then $AGAIN."
  fi
  printf '%s\n' "$CONSOLE_USER" > "$USER_FILE"
}

# ---- Modes ----------------------------------------------------------------------------------------------------------

run_workspace() {
  ensure_runtime
  stop_studio "$DEMO_DIR"
  mkdir -p "$WORKSPACE_DIR"
  chmod 700 "$WORKSPACE_DIR"
  if [ "$STUDIO_OS" = mac ]; then
    KEY=$(workspace_key)
    if [ -f "$WORKSPACE_DIR/.amc/users.yaml" ]; then start_studio "$WORKSPACE_DIR"; else first_run_setup; fi
  else
    start_studio "$WORKSPACE_DIR"
    [ -f "$WORKSPACE_DIR/.amc/users.yaml" ] || create_owner_at_terminal
  fi
  PORT=$(studio_port "$WORKSPACE_DIR" "$AMC_STUDIO_PORT")
  [ "$STUDIO_OS" != mac ] || sign_in "http://127.0.0.1:$PORT"
  STARTING_DIR=""
  say "AMC_TITLE=My workspace"
  say "AMC_STUDIO_URL=http://127.0.0.1:$PORT/console/"
}

run_demo() {
  ensure_runtime
  stop_studio "$WORKSPACE_DIR"
  start_studio "$DEMO_DIR" --demo
  PORT=$(studio_port "$DEMO_DIR" "$AMC_HOST_PORT")
  STARTING_DIR=""
  say "AMC_TITLE=Demo workspace (view only)"
  say "AMC_STUDIO_URL=http://127.0.0.1:$PORT/w/demo/console/"
}

case "$MODE" in
  info)
    say "AMC_LOG_FILE=$LOG_FILE"
    say "AMC_RUNTIME_DIR=$RUNTIME_DIR"
    say "AMC_WORKSPACE_DIR=$WORKSPACE_DIR"
    say "AMC_CONSOLE_USER=$(cat "$USER_FILE" 2>/dev/null || true)"
    if command -v node >/dev/null 2>&1; then say "AMC_NODE=Node.js $(node --version 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9.+-' | cut -c1-40) ($(command -v node))"; fi
    if [ -f "$WORKSPACE_DIR/.amc/users.yaml" ]; then say "AMC_SETUP_DONE=1"; else say "AMC_SETUP_DONE=0"; fi
    ;;
  workspace) run_workspace ;;
  demo) run_demo ;;
  stop)
    if [ -x "$AMC_BIN" ]; then
      stop_studio "$WORKSPACE_DIR"
      stop_studio "$DEMO_DIR"
    fi
    ;;
  *) fail "Unknown launcher mode: $MODE" ;;
esac
