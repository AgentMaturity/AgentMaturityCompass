#!/bin/bash
# P0-62 A/B probe: `amc up --demo` / `amc down` cycles from one installed tarball, with N busy loops loading the CPUs.
# Usage (inside a fresh container, as root): updemo-ab.sh <tarball in /stage> <busy-loops> <cycles>
set -u
TGZ=$1 BUSY=$2 CYCLES=$3
for i in $(seq 1 $BUSY); do (while :; do :; done) & done
su node -s /bin/bash -c "
set -u; W=/tmp/probe; mkdir -p \$W/inst \$W/home; cd \$W/inst; echo '{\"name\":\"p\",\"private\":true}' > package.json
HOME=\$W/home npm install --no-audit --no-fund --loglevel=error /stage/$TGZ >/dev/null 2>&1 || exit 9
CLI=\$W/inst/node_modules/agent-maturity-compass/dist/cli.js
echo \"tarball $TGZ busy $BUSY nproc \$(nproc) cli \$(sha256sum \$CLI | cut -c1-12)\"
for i in \$(seq 1 $CYCLES); do
  D=\$W/demo\$i; mkdir -p \$D \$W/h\$i; P=\$((30000+i*10))
  ENV=\"HOME=\$W/h\$i AMC_WORKSPACE_DIR=\$D AMC_STUDIO_PORT=\$P AMC_HOST_PORT=\$P AMC_GATEWAY_PORT=\$((P+1)) AMC_PROXY_PORT=\$((P+2)) AMC_TOOLHUB_PORT=\$((P+3)) AMC_METRICS_PORT=\$((P+4)) AMC_BIND=127.0.0.1 AMC_HOST_BIND=127.0.0.1 AMC_ENABLE_NOTARY=0 AMC_VAULT_REMEMBER=0 CI=1 NO_COLOR=1\"
  cd \$D; S=\$(date +%s%N); env \$ENV node \$CLI up --demo --no-open --no-baseline > \$W/up\$i.log 2>&1; E=\$?; MS=\$(( (\$(date +%s%N)-S)/1000000 ))
  echo \"cycle \$i up exit \$E \${MS}ms loadavg \$(cut -d' ' -f1 /proc/loadavg) :: \$(grep -E 'daemon|Studio API' \$W/up\$i.log | head -1)\"
  env \$ENV node \$CLI down > /dev/null 2>&1; sleep 1
done"
