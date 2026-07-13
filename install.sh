#!/usr/bin/env sh
# Agent Maturity Compass verified release installer for macOS and Linux.
set -eu

PINNED_AMC_RELEASE_VERSION="1.1.1"
REQUESTED_AMC_RELEASE_VERSION=${AMC_RELEASE_VERSION:-}
REQUESTED_AMC_RELEASE_BASE_URL=${AMC_RELEASE_BASE_URL:-}
AMC_RELEASE_VERSION="$PINNED_AMC_RELEASE_VERSION"
AMC_RELEASE_BASE_URL="https://github.com/AgentMaturity/AgentMaturityCompass/releases/download/v${AMC_RELEASE_VERSION}"

if [ "${AMC_INSTALL_TEST_MODE:-0}" = "1" ]; then
  AMC_RELEASE_VERSION=${REQUESTED_AMC_RELEASE_VERSION:?AMC_RELEASE_VERSION is required in test mode}
  AMC_RELEASE_BASE_URL=${REQUESTED_AMC_RELEASE_BASE_URL:?AMC_RELEASE_BASE_URL is required in test mode}
fi

fail() {
  printf 'AMC install failed: %s\n' "$1" >&2
  exit 1
}

download() {
  source_url=$1
  destination=$2
  if [ "${AMC_INSTALL_TEST_MODE:-0}" = "1" ]; then
    curl -fsSL "$source_url" -o "$destination"
  else
    curl --proto '=https' --tlsv1.2 -fsSL "$source_url" -o "$destination"
  fi
}

sha256_file() {
  target=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$target" | awk '{print $1}'
    return
  fi
  fail "sha256sum or shasum is required"
}

detect_platform() {
  if [ "${AMC_INSTALL_TEST_MODE:-0}" = "1" ] && [ -n "${AMC_INSTALL_PLATFORM:-}" ]; then
    printf '%s\n' "$AMC_INSTALL_PLATFORM"
    return
  fi
  os=$(uname -s)
  arch=$(uname -m)
  case "$os:$arch" in
    Darwin:arm64|Darwin:x86_64) printf '%s\n' "macos-universal" ;;
    Linux:x86_64|Linux:amd64) printf '%s\n' "linux-x64" ;;
    Linux:*) fail "Linux architecture $arch is not packaged yet; use the source install documented at https://agentmaturity.co/docs/" ;;
    *) fail "unsupported platform $os/$arch; use https://agentmaturity.co/docs/" ;;
  esac
}

printf '\n'
printf 'amc_ install\n'
printf 'Evidence over claims. Verified release %s.\n\n' "$AMC_RELEASE_VERSION"

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"

if [ "${AMC_INSTALL_TEST_MODE:-0}" != "1" ]; then
  command -v node >/dev/null 2>&1 || fail "Node.js 20 or 22 LTS is required: https://nodejs.org"
  command -v npm >/dev/null 2>&1 || fail "npm is required"
  node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
  [ "$node_major" -ge 20 ] || fail "Node.js 20 or newer is required; found $(node --version)"
fi

platform=$(detect_platform)
archive_name="amc-${AMC_RELEASE_VERSION}-${platform}.tar.gz"
package_root="amc-${AMC_RELEASE_VERSION}-${platform}"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/amc-install.XXXXXX")
trap 'rm -rf "$tmp_dir"' 0 HUP INT TERM

download "${AMC_RELEASE_BASE_URL}/SHA256SUMS" "$tmp_dir/SHA256SUMS"
download "${AMC_RELEASE_BASE_URL}/${archive_name}" "$tmp_dir/${archive_name}"

expected=$(awk -v asset="$archive_name" '$2 == asset { print $1 }' "$tmp_dir/SHA256SUMS")
[ -n "$expected" ] || fail "SHA256SUMS does not contain ${archive_name}"
printf '%s' "$expected" | grep -Eq '^[0-9a-fA-F]{64}$' || fail "invalid SHA-256 entry for ${archive_name}"
actual=$(sha256_file "$tmp_dir/${archive_name}")
[ "$actual" = "$expected" ] || fail "checksum mismatch for ${archive_name}"

if tar -tzf "$tmp_dir/${archive_name}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  fail "unsafe archive path in ${archive_name}"
fi
if ! tar -tzf "$tmp_dir/${archive_name}" | awk -v prefix="${package_root}/" 'index($0, prefix) != 1 { bad = 1 } END { exit bad }'; then
  fail "archive contains files outside ${package_root}"
fi

mkdir -p "$tmp_dir/unpacked"
tar -xzf "$tmp_dir/${archive_name}" -C "$tmp_dir/unpacked"
installer="$tmp_dir/unpacked/${package_root}/install.sh"
[ -f "$installer" ] || fail "release archive is missing install.sh"
[ ! -L "$installer" ] || fail "release installer must not be a symbolic link"

sh "$installer"

printf '\nAMC %s installed from a verified GitHub release.\n' "$AMC_RELEASE_VERSION"
printf 'Run: amc --version && amc doctor\n'
printf 'Docs: https://agentmaturity.co/docs/\n'
