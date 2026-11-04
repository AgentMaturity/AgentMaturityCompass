#!/bin/bash
# P0-31 Linux ARM64 cell. Runs inside an official node:<22|24>-bookworm container pinned by digest.
# /stage (read-only): rc.tgz, rc.bundle (git bundle of the RC commit), harness/. /out (read-write): summaries.
# Usage (inside the container, as root): linux-cell.sh <rc-sha> <tarball-sha256> <cli-sha256> [python]
# STEPS (environment) limits the run, for example STEPS="studio" to repeat one lane; default: every lane.
set -u
STEPS=${STEPS:-packed-install qualify crash studio rows}
want() { [[ " $STEPS " == *" $1 "* ]]; }
RC=$1 TSHA=$2 CSHA=$3 PY=${4:-}
OUT=/out W=/work
mkdir -p $W/out && chown -R node:node $W
step() { local name=$1; shift; local s=$(date +%s); "$@" > $OUT/$name.log 2>&1; local e=$?; echo "exit $e duration $(( $(date +%s)-s ))s" >> $OUT/$name.log; echo "$name exit $e"; }
asnode() { su node -s /bin/bash -c "$*"; }
{
  uname -a; cat /etc/os-release | head -2; echo "node $(node -v) npm $(npm -v)"; python3 --version
  echo "kernel.apparmor_restrict_unprivileged_userns=$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo n/a)"
} > $OUT/environment.txt 2>&1
step apt bash -c "apt-get update -qq && apt-get install -y -qq --no-install-recommends bubblewrap python3-venv"
{ bwrap --version; sha256sum /usr/bin/bwrap; stat -c '%U %a' /usr/bin/bwrap; dpkg -s bubblewrap | grep -E '^Version'; } >> $OUT/environment.txt 2>&1
asnode "git clone -q /stage/rc.bundle $W/src && git -C $W/src checkout -q $RC && git -C $W/src rev-parse HEAD" >> $OUT/environment.txt 2>&1
asnode "mkdir -p $W/pkg && tar -xzf /stage/rc.tgz -C $W/pkg"
NPMCLI=/usr/local/lib/node_modules/npm/bin/npm-cli.js
want packed-install && step packed-install asnode "cd $W/src && node scripts/packed-install-check.mjs --tarball /stage/rc.tgz"
want qualify && step qualify asnode "cd $W/pkg/package && npm_execpath=$NPMCLI node $W/src/scripts/qualify-platform.mjs --out $W/out/qualify/report.json"
want crash && step crash asnode "cd $W/src && node scripts/installed-crash-recovery-check.mjs --artifact /stage/rc.tgz --artifact-sha256 $TSHA --cli-sha256 $CSHA --source $RC --source-tree $W/src --out $W/out/crash"
# Studio browser: Playwright and Chromium for linux-arm64 (allowed by the item's decisions), then the committed harness.
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
want studio && step playwright bash -c "mkdir -p $W/pw && cd $W/pw && npm init -y >/dev/null && npm install --no-audit --no-fund @playwright/test@1.62.1 && npx playwright install --with-deps chromium && chown -R node:node $W/pw /ms-playwright"
SHELL_BIN=$(ls -d /ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell /ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell 2>/dev/null | head -1)
NODE_BIN=$(readlink -f "$(command -v node)")
want studio && step studio asnode "cd $W/src && PLAYWRIGHT_BROWSERS_PATH=/ms-playwright python3 $W/src/scripts/installed-studio-browser-check.py --artifact /stage/rc.tgz --artifact-sha256 $TSHA --source $RC --source-tree $W/src --shared-checkout /stage --node $NODE_BIN --node-sha256 \$(sha256sum $NODE_BIN | cut -d' ' -f1) --node-version \$(node -v) --npm $NPMCLI --npm-sha256 \$(sha256sum $NPMCLI | cut -d' ' -f1) --cli-sha256 $CSHA --dependency-root $W/pw --browser-executable $SHELL_BIN --browser-sha256 \$(sha256sum $SHELL_BIN | cut -d' ' -f1) --out $W/out/studio"
want rows && step rows asnode "cd $W && node /stage/harness/run-rows.mjs --tarball /stage/rc.tgz --tarball-sha256 $TSHA --cli-sha256 $CSHA --out $W/out/rows"
if [ "$PY" = python ]; then
  step python asnode "bash /stage/harness/python-lane.sh $W/src $W/python python3"
fi
# Copy summaries only (raw workspaces, keys and logs stay in the container and are discarded).
cp -r $W/out/qualify $OUT/qualify 2>/dev/null
mkdir -p $OUT/crash $OUT/studio/browser $OUT/rows
cp $W/out/crash/receipt.json $OUT/crash/ 2>/dev/null
cp $W/out/studio/fixture-run-receipt.json $OUT/studio/ 2>/dev/null; cp $W/out/studio/browser/receipt.json $OUT/studio/browser/ 2>/dev/null
mkdir -p $OUT/studio/logs; cp $W/out/studio/command-*.log $OUT/studio/logs/ 2>/dev/null   # harness-scrubbed command logs, for diagnosis
cp -r $W/out/rows/rows $W/out/rows/summary.json $OUT/rows/ 2>/dev/null
echo done
