#!/bin/bash
# P0-62: one Studio lane run of P0-31's linux-cell.sh (STEPS=studio), in a FRESH container from an image that
# already holds the lane's apt packages and Playwright/Chromium (baked once, so 20 runs do not re-download them).
# The studio step's command is linux-cell.sh's, unchanged. /stage (ro): rc.tgz, rc.bundle, harness/. /out (rw).
# Usage (inside the container, as root): p0-62-studio-once.sh <rc-sha> <tarball-sha256> <cli-sha256>
set -u
RC=$1 TSHA=$2 CSHA=$3
OUT=/out W=/work
mkdir -p $W/out && chown -R node:node $W
step() { local name=$1; shift; local s=$(date +%s); "$@" > $OUT/$name.log 2>&1; local e=$?; echo "exit $e duration $(( $(date +%s)-s ))s" >> $OUT/$name.log; echo "$name exit $e"; }
asnode() { su node -s /bin/bash -c "$*"; }
{ uname -a; echo "node $(node -v) npm $(npm -v)"; echo "loadavg $(cat /proc/loadavg)"; echo "nproc $(nproc)"; } > $OUT/environment.txt 2>&1
asnode "git clone -q /stage/rc.bundle $W/src && git -C $W/src checkout -q $RC && git -C $W/src rev-parse HEAD" >> $OUT/environment.txt 2>&1
NPMCLI=/usr/local/lib/node_modules/npm/bin/npm-cli.js
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
SHELL_BIN=$(ls -d /ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell /ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell 2>/dev/null | head -1)
NODE_BIN=$(readlink -f "$(command -v node)")
step studio asnode "cd $W/src && PLAYWRIGHT_BROWSERS_PATH=/ms-playwright python3 $W/src/scripts/installed-studio-browser-check.py --artifact /stage/rc.tgz --artifact-sha256 $TSHA --source $RC --source-tree $W/src --shared-checkout /stage --node $NODE_BIN --node-sha256 \$(sha256sum $NODE_BIN | cut -d' ' -f1) --node-version \$(node -v) --npm $NPMCLI --npm-sha256 \$(sha256sum $NPMCLI | cut -d' ' -f1) --cli-sha256 $CSHA --dependency-root /pw --browser-executable $SHELL_BIN --browser-sha256 \$(sha256sum $SHELL_BIN | cut -d' ' -f1) --out $W/out/studio"
echo "loadavg-after $(cat /proc/loadavg)" >> $OUT/environment.txt
mkdir -p $OUT/studio/browser $OUT/studio/logs
cp $W/out/studio/fixture-run-receipt.json $OUT/studio/ 2>/dev/null; cp $W/out/studio/browser/receipt.json $OUT/studio/browser/ 2>/dev/null
cp $W/out/studio/command-*.log $OUT/studio/logs/ 2>/dev/null   # harness-scrubbed command logs, for diagnosis
# Also keep the demo daemon log; /out is local scratch and this log is not committed to the receipt.
cp $W/out/studio/demo/.amc/studio/logs/studio.log $OUT/studio/logs/demo-studio.log 2>/dev/null
echo done
