#!/bin/sh
# P2-09 ledger field encryption, switched on by the chart (ledgerEncryption.enabled) before Studio starts.
# It runs the owner steps of docs/EVIDENCE_STORAGE.md "Ledger encryption" and nothing else:
#   1. refuse unless the signed ops policy verifies (an edited, unsigned policy is never re-signed here);
#   2. set opsPolicy.encryption.ledgerEncryptionEnabled: true and re-sign, when it is not on yet;
#   3. create data key version 1, wrapped at <provider>/<key ref>, and encrypt existing rows, when there is no data key.
# Any failure exits non-zero, so the container stops before Studio: Studio never runs with the policy on and no data key.
# A key file that was deleted is not quietly replaced: the P1-08 high-water mark refuses a new sequence 1.
# Usage: ledger-encryption.sh <workspace> <provider> <key ref>
set -eu
workspace=$1
provider=$2
ref=$3
cd "$workspace"
AMC_VAULT_PASSPHRASE=$(cat "$AMC_VAULT_PASSPHRASE_FILE")
export AMC_VAULT_PASSPHRASE
amc ops verify
if ! amc ops print | node -e 'process.exit(JSON.parse(require("fs").readFileSync(0, "utf8")).opsPolicy.encryption.ledgerEncryptionEnabled === true ? 0 : 1)'; then
  # JSON is YAML: `amc ops sign` signs these bytes and loadOpsPolicy parses them.
  amc ops print | node -e '
    const fs = require("fs");
    const policy = JSON.parse(fs.readFileSync(0, "utf8"));
    policy.opsPolicy.encryption.ledgerEncryptionEnabled = true;
    fs.writeFileSync(".amc/ops-policy.yaml", JSON.stringify(policy, null, 2) + "\n");'
  amc ops sign
fi
if [ ! -e .amc/keys/ledger-dek.json ]; then
  amc evidence-stores encrypt --key-provider "$provider" --key-ref "$ref"
fi
