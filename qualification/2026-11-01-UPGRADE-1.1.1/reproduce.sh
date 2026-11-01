#!/bin/zsh
# Upgrade qualification: create a workspace with AMC 1.1.1, then upgrade it with this line's packed build.
# usage: reproduce.sh <1.1.1 package dir> <new package dir> <out dir>
# Each package dir is an extracted `npm pack` tarball with its dependencies under node_modules.
# Every command runs in a new process with an empty HOME, no AMC_* or npm_config_* variables from the caller, Node 22.
zmodload zsh/datetime
OLD=$1; NEW=$2; OUT=$3
mkdir -p $OUT/logs; WS=$OUT/ws; HOMEDIR=$OUT/home; mkdir -p $WS $HOMEDIR
NODE_BIN="$(brew --prefix node@22)/bin"
JSONL=$OUT/commands.jsonl; : > $JSONL
run() { # run <label> <pkg> [VAR=value ...] -- args...
  local label=$1 pkg=$2; shift 2; local -a extra; while [[ $1 != -- ]]; do extra+=$1; shift; done; shift
  local t0=$EPOCHREALTIME
  env -i PATH="$NODE_BIN:/usr/bin:/bin:/usr/sbin:/sbin" HOME=$HOMEDIR CI=1 TERM=dumb \
    AMC_VAULT_PASSPHRASE=upgrade-qualification-ephemeral npm_config_cache=$HOMEDIR/npm-cache $extra \
    zsh -c 'cd "$1" && shift && exec node "$@"' _ $WS $pkg/dist/cli.js "$@" > $OUT/logs/$label.out 2> $OUT/logs/$label.err < /dev/null
  local rc=$? ms=$(( (EPOCHREALTIME - t0) * 1000 ))
  python3 -c 'import json,sys;print(json.dumps({"label":sys.argv[1],"pkg":sys.argv[2],"args":sys.argv[5:],"exit":int(sys.argv[3]),"durationMs":round(float(sys.argv[4]))}))' $label $([[ $pkg == $OLD ]] && echo 1.1.1 || echo this-line) $rc $ms "$@" >> $JSONL
  echo "$label rc=$rc"
}
FPCMD() { shasum -a 256 $WS/.amc/keys/monitor_ed25519.pub | awk '{print $1}'; }
# Step 2: a workspace as a 1.1.1 user leaves it.
run c01-init $OLD -- init --skip-vault
run c02-score $OLD -- run --score-only --json
run c03-collect $OLD -- evidence collect --first-run --agent default --runtime any -- node -e 'console.log("hello from a 1.1.1 agent")'
run c04-budgets-init $OLD -- budgets init --agent default
run c05-policy-action-init $OLD -- policy action init
run c06-governor $OLD -- governor check --agent default --action READ_ONLY --risk low --mode execute
run c07-verify-all $OLD -- verify all --json
tar -czf $OUT/ws111-snapshot.tgz -C $WS .amc
# Before upgrading (Migration, "Before you upgrade"): backup with 1.1.1, record the monitor fingerprint outside the workspace.
run b01-backup-create $OLD AMC_BACKUP_PASSPHRASE=upgrade-backup-ephemeral -- backup create --out $OUT/pre-upgrade.amcbackup
FP=$(FPCMD); echo $FP > $OUT/monitor-fingerprint.txt
# Step 3: the upgraded build against the 1.1.1 workspace.
run u01-doctor $NEW -- doctor --json
run u02-verify-unpinned $NEW -- verify
run u03-verify $NEW -- verify --expect-monitor $FP
run u04-session-verify $NEW -- session verify --expect-monitor $FP
run u05-run-score $NEW -- run --score-only --json
run u06-governor $NEW -- governor check --agent default --action READ_ONLY --risk low --mode execute
run u07-agent-loop-stub $NEW -- --agent default agent-loop run "Check recording after the upgrade." --provider stub --model amc-stub-1 --tools echo --max-steps 2 --max-tokens 512
for role in monitor auditor lease session; do
  run m01-history-migrate-$role $NEW -- vault history migrate --role $role --expected-sha256 $(shasum -a 256 $WS/.amc/keys/${role}_history.json | awk '{print $1}')
done
run m02-doctor $NEW -- doctor --json
run m03-relabel-dry-run $NEW -- verify --expect-monitor $FP --relabel-legacy --dry-run
run m04-relabel $NEW -- verify --expect-monitor $FP --relabel-legacy
sed -i '' 's/^\( *maxCostUsd:\) 50$/\1 null/' $WS/.amc/budgets.yaml
run m05-budgets-sign $NEW -- budgets sign
run m06-agent-loop-stub $NEW -- --agent default agent-loop run "Check recording after the upgrade." --provider stub --model amc-stub-1 --tools echo --max-steps 2 --max-tokens 512
SID=$(grep -o 'agent-loop verify [0-9a-f-]*' $OUT/logs/m06-agent-loop-stub.out | awk '{print $3}')
run m07-agent-loop-verify $NEW -- agent-loop verify $SID --expect-monitor $FP
run m08-session-verify $NEW -- session verify --expect-monitor $FP
run m09-verify-all $NEW -- verify all --expect-monitor $FP
run m10-backup-verify $NEW AMC_BACKUP_PASSPHRASE=upgrade-backup-ephemeral -- backup verify $OUT/pre-upgrade.amcbackup --pubkey $WS/.amc/keys/auditor_ed25519.pub
run m11-budgets-verify $NEW -- budgets verify
# Studio: start in the foreground process, probe /health, stop with SIGTERM.
( run s01-studio-start $NEW -- studio start --bind 127.0.0.1 --port 47811 --dashboard-port 47812 ) &
for i in {1..60}; do curl -fs http://127.0.0.1:47811/health > $OUT/logs/s02-health.out && break; perl -e "select(undef,undef,undef,0.5)"; done
run s03-status $NEW -- status
kill -TERM $(pgrep -f "cli.js studio start --bind 127.0.0.1 --port 47811"); wait
sqlite3 $WS/.amc/evidence.sqlite "select group_concat(version, ' ') from schema_migrations" > $OUT/ledger-migrations.txt
