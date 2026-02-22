#!/usr/bin/env bash
set -euo pipefail

require_readable_file() {
  local var_name="$1"
  local file_path="${!var_name:-}"
  if [[ -z "$file_path" ]]; then
    echo "ERROR: $var_name is required but not set." >&2
    exit 1
  fi
  if [[ ! -r "$file_path" ]]; then
    echo "ERROR: $var_name points to a missing or unreadable file: $file_path" >&2
    exit 1
  fi
}

export AMC_WORKSPACE_DIR="${AMC_WORKSPACE_DIR:-/data/amc}"
export AMC_BIND="${AMC_BIND:-0.0.0.0}"
export AMC_STUDIO_PORT="${AMC_STUDIO_PORT:-3212}"
export AMC_GATEWAY_PORT="${AMC_GATEWAY_PORT:-3210}"
export AMC_PROXY_PORT="${AMC_PROXY_PORT:-3211}"
export AMC_TOOLHUB_PORT="${AMC_TOOLHUB_PORT:-3213}"
export AMC_LAN_MODE="${AMC_LAN_MODE:-true}"

mkdir -p "${AMC_WORKSPACE_DIR}"

if [[ -n "${AMC_VAULT_PASSPHRASE_FILE:-}" ]]; then
  require_readable_file "AMC_VAULT_PASSPHRASE_FILE"
fi
if [[ -n "${AMC_NOTARY_AUTH_SECRET_FILE:-}" ]]; then
  require_readable_file "AMC_NOTARY_AUTH_SECRET_FILE"
fi
if [[ -n "${AMC_NOTARY_PASSPHRASE_FILE:-}" ]]; then
  require_readable_file "AMC_NOTARY_PASSPHRASE_FILE"
fi

if [[ "${AMC_BOOTSTRAP:-0}" == "1" ]]; then
  require_readable_file "AMC_VAULT_PASSPHRASE_FILE"
  require_readable_file "AMC_BOOTSTRAP_OWNER_USERNAME_FILE"
  require_readable_file "AMC_BOOTSTRAP_OWNER_PASSWORD_FILE"
  if [[ "${AMC_ENABLE_NOTARY:-0}" == "1" ]] && [[ -z "${AMC_NOTARY_AUTH_SECRET_FILE:-}" ]] && [[ -z "${AMC_NOTARY_AUTH_SECRET:-}" ]]; then
    echo "ERROR: AMC_ENABLE_NOTARY=1 bootstrap requires AMC_NOTARY_AUTH_SECRET_FILE or AMC_NOTARY_AUTH_SECRET." >&2
    exit 1
  fi
  node /app/dist/cli.js bootstrap --workspace "${AMC_WORKSPACE_DIR}"
fi

exec node /app/dist/cli.js studio start \
  --workspace "${AMC_WORKSPACE_DIR}" \
  --bind "${AMC_BIND}" \
  --port "${AMC_STUDIO_PORT}"
