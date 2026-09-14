#!/bin/zsh
# Fresh-clone reproduction at a pinned candidate commit (brief §4 receipt rule).
# Usage: fresh-clone-validate.sh <commit> <dest-dir> <receipt-dir>
set -u
COMMIT="$1"; DEST="$2"; OUT="$3"
mkdir -p "$OUT"
step() { local id="$1"; shift; echo "=== $id: $* ===" | tee -a "$OUT/steps.log"; local start=$(date +%s); "$@" > "$OUT/$id.log" 2>&1; local code=$?; local end=$(date +%s); echo "$id exit=$code seconds=$((end-start))" | tee -a "$OUT/steps.log"; return $code; }
rm -rf "$DEST"
step clone git clone -q /Users/sid/AgentMaturityCompass "$DEST" --branch amc/gap-register-execution || exit 1
cd "$DEST" || exit 1
step checkout git checkout -q "$COMMIT" || exit 1
git rev-parse HEAD > "$OUT/commit.txt"; git status --porcelain > "$OUT/status-after-checkout.txt"
{ uname -a; node -v; pnpm -v; } > "$OUT/environment.txt" 2>&1
step install pnpm install --frozen-lockfile --prefer-offline
step build pnpm build
step typecheck-src npx tsc -p tsconfig.json --noEmit
step typecheck-tests npx tsc -p tsconfig.tests.json --noEmit
step openapi-check node scripts/update-native-task-openapi.mjs --check
step full-suite npx vitest run --reporter=default
( cd sdk/python && AMC_BIN="$DEST/dist/cli.js" step python-lanes python3.14 -m pytest tests -q -p no:cacheprovider; ls .amc >/dev/null 2>&1 && echo "python-left-workspace=yes" >> "$OUT/steps.log" || true )
step release-gate pnpm release:gate
git status --porcelain > "$OUT/status-after-run.txt"
echo "done" | tee -a "$OUT/steps.log"
