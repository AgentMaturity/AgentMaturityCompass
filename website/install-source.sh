#!/bin/sh
# Agent Maturity Compass: install or update the current source build on macOS or Linux, without sudo.
#
#   curl -fsSL https://agentmaturity.co/install-source.sh | sh
#   curl -fsSL https://agentmaturity.co/install-source.sh | sh -s -- --ref <tag or full commit id>
#
# What it does: checks for git and Node.js, fetches AgentMaturity/AgentMaturityCompass from GitHub over https,
# installs dependencies from the lockfile with the pnpm version package.json names (through Corepack), builds,
# and links `amc` into ~/.amc-source/bin. It adds one marked PATH line to your shell profile if it is not there.
# Running it again updates: the new build is made beside the old one, and only a finished build replaces it.
# Remove it: delete the folder ~/.amc-source and the line marked "AMC source install" from your shell profile.
# Everything is in one function called on the last line, so a download cut short runs nothing.

amc_source_install() {
  set -eu
  (set -o pipefail) 2>/dev/null && set -o pipefail

  repo="https://github.com/AgentMaturity/AgentMaturityCompass.git"
  ref="HEAD"
  modify_path=1
  marker="# AMC source install: adds amc to PATH"

  fail() { printf 'AMC install stopped: %s\n' "$1" >&2; exit 1; }
  say() { printf '%s\n' "$1"; }

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo) [ "$#" -ge 2 ] || fail "--repo needs a value"; repo=$2; shift 2 ;;
      --ref) [ "$#" -ge 2 ] || fail "--ref needs a value"; ref=$2; shift 2 ;;
      --no-modify-path) modify_path=0; shift ;;
      -h|--help)
        say "Usage: sh install-source.sh [--ref <branch, tag or full commit id>] [--repo <https URL or local folder>] [--no-modify-path]"
        say "Installs the current AMC source build into ~/.amc-source and puts amc on your PATH."
        say "Default: the default branch of https://github.com/AgentMaturity/AgentMaturityCompass."
        say "Remove it: delete ~/.amc-source and the line marked \"AMC source install\" in your shell profile."
        return 0 ;;
      *) fail "unknown option $1 (see --help)" ;;
    esac
  done

  [ -n "${HOME:-}" ] && [ -d "$HOME" ] || fail "HOME is not set to a folder"
  prefix="$HOME/.amc-source"

  case "$repo" in
    https://*) ;;
    *) [ -d "$repo" ] || fail "--repo must be an https URL or a folder that exists: $repo"
       repo=$(CDPATH= cd -- "$repo" && pwd) ;;
  esac
  case "$ref" in
    ""|-*|*..*|*[!A-Za-z0-9._/-]*) fail "--ref must be a branch, a tag or a full commit id: $ref" ;;
  esac

  # An empty or relative PATH entry means "the current folder": drop them, so no node, git or corepack is taken
  # from wherever this runs.
  clean_path=""
  old_ifs=$IFS; IFS=:; set -f
  for entry in $PATH; do
    case "$entry" in /*) clean_path="${clean_path:+$clean_path:}$entry" ;; esac
  done
  set +f; IFS=$old_ifs
  PATH=$clean_path; export PATH

  command -v git >/dev/null 2>&1 || fail "git is needed to fetch the source. Install it (macOS: xcode-select --install; Linux: your package manager) and run this again."
  node_found=$(command -v node 2>/dev/null || true)
  case "$node_found" in
    /*) ;;
    *) fail "AMC needs Node.js 20, 22 or 24, and none was found on this computer. Install Node.js 22 or 24 from https://nodejs.org and run this again." ;;
  esac
  corepack_bin=$(command -v corepack 2>/dev/null || true)
  case "$corepack_bin" in
    /*) ;;
    *) fail "Corepack was not found next to Node.js $node_found. Node.js 25 and later no longer include it; install Node.js 22 or 24 from https://nodejs.org and run this again." ;;
  esac
  # Every later node call, the build's own scripts and the amc launcher use this one checked Node.js.
  PATH="$(dirname "$node_found"):$PATH"; export PATH

  say ""
  say "amc_ source install"
  say "Fetching $repo ($ref)"
  mkdir -p "$prefix/builds"
  work="$prefix/builds/.partial-$$"
  rm -rf -- "$work"
  # A failure anywhere below leaves the current install alone; this removes only the half-made build.
  trap 'rm -rf -- "$work"' EXIT
  trap 'exit 130' HUP INT TERM
  git init -q "$work"
  GIT_ALLOW_PROTOCOL=https:file GIT_TERMINAL_PROMPT=0 git -C "$work" fetch -q --depth 1 -- "$repo" "$ref" \
    || fail "could not fetch $ref from $repo. Check the address and the ref (a commit id must be the full 40 characters)."
  git -C "$work" checkout -q --detach FETCH_HEAD
  commit=$(git -C "$work" rev-parse HEAD)

  # The one Node.js rule is package.json engines.node (">=N") of the commit being built.
  node_min=$(cd "$work" && "$node_found" -p 'String((/^>=\s*(\d+)/.exec(require("./package.json").engines.node) || [])[1] || "")' 2>/dev/null || true)
  case "$node_min" in ""|*[!0-9]*) fail "package.json at $commit has no engines.node rule of the form >=N" ;; esac
  node_version=$("$node_found" --version 2>/dev/null | LC_ALL=C tr -cd 'A-Za-z0-9.+-' | cut -c1-40)
  node_major=$("$node_found" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if ! [ "$node_major" -ge "$node_min" ] 2>/dev/null; then
    fail "AMC needs Node.js $node_min or newer, and the one found on this computer is Node.js ${node_version:-unknown} ($node_found). Install a newer Node.js from https://nodejs.org and run this again."
  fi
  say "Using Node.js $node_version ($node_found)"

  current=""
  [ -L "$prefix/current" ] && current=$(basename "$(readlink "$prefix/current")")
  if [ "$current" = "$commit" ] && [ -x "$prefix/current/dist/cli.js" ]; then
    say "Commit $commit is already installed; nothing to build."
  else
    say "Building commit $commit (this takes a few minutes)"
    if [ "$(uname -s)" = "Linux" ]; then
      for tool in python3 make g++; do
        command -v "$tool" >/dev/null 2>&1 || say "Note: $tool is missing. It is needed only if a prebuilt better-sqlite3 cannot be downloaded."
      done
    fi
    # pnpm comes from Corepack at the version package.json names; its download, the package store and the npm and
    # pnpm caches stay in the prefix.
    if ! (cd "$work" \
      && export COREPACK_HOME="$prefix/corepack" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
         XDG_DATA_HOME="$prefix/data" XDG_CACHE_HOME="$prefix/cache" XDG_STATE_HOME="$prefix/state" \
         npm_config_cache="$prefix/npm-cache" npm_config_update_notifier=false \
      && "$corepack_bin" pnpm install --frozen-lockfile \
      && "$corepack_bin" pnpm run build \
      && "$node_found" dist/cli.js --version >/dev/null); then
      if [ -n "$current" ]; then
        fail "the build of $commit failed (see the lines above). Your previous AMC, commit $current, is still installed and works."
      fi
      fail "the build of $commit failed (see the lines above). Nothing was installed."
    fi
    rm -rf -- "$prefix/builds/$commit"
    mv -- "$work" "$prefix/builds/$commit"
    ln -sfn "builds/$commit" "$prefix/current"
    # Keep the build just replaced, for going back by hand; remove older ones (only inside builds/).
    for old in "$prefix"/builds/*; do
      name=$(basename "$old")
      [ "$name" = "$commit" ] || [ "$name" = "$current" ] || rm -rf -- "$old"
    done
  fi
  mkdir -p "$prefix/bin"
  # A small launcher that names the checked Node.js by its full path; dist/cli.js's own "#!/usr/bin/env node" line
  # would take whatever node comes first on PATH, which can be one in the current folder. It replaces the symlink
  # that older installs have (mv, so nothing is written through the symlink into dist/cli.js).
  quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
  # A version manager's per-shell node path can vanish later; then say so and name the fix, not "exec: not found".
  {
    printf '#!/bin/sh\n'
    printf '[ -x %s ] || { printf '\''%%s\\n'\'' %s %s >&2; exit 1; }\n' "$(quote "$node_found")" \
      "$(quote "The Node.js AMC was installed with is gone: $node_found")" \
      "$(quote "Run the AMC install command again to use the Node.js you have now.")"
    printf 'exec %s %s "$@"\n' "$(quote "$node_found")" "$(quote "$prefix/current/dist/cli.js")"
  } > "$prefix/bin/.amc-new"
  chmod 755 "$prefix/bin/.amc-new"
  mv -f -- "$prefix/bin/.amc-new" "$prefix/bin/amc"
  version=$("$prefix/bin/amc" --version 2>/dev/null || echo unknown)

  path_line="export PATH=\"\$HOME/.amc-source/bin:\$PATH\" $marker"
  if [ "$modify_path" = 1 ]; then
    case "$(basename "${SHELL:-sh}")" in
      zsh) profile="$HOME/.zshrc" ;;
      bash) if [ "$(uname -s)" = "Darwin" ]; then profile="$HOME/.bash_profile"; else profile="$HOME/.bashrc"; fi ;;
      fish) profile=""; say "PATH: fish does not read a profile line; run once: fish_add_path $prefix/bin" ;;
      *) profile="$HOME/.profile" ;;
    esac
    if [ -z "$profile" ]; then :
    elif [ -f "$profile" ] && grep -qF "$marker" "$profile"; then
      say "PATH: $profile already has the AMC line."
    else
      printf '\n%s\n' "$path_line" >> "$profile"
      say "PATH: added one line to $profile (marked \"AMC source install\")."
    fi
  else
    say "PATH: not changed (--no-modify-path). Add this line to your shell profile: $path_line"
  fi
  other=$(command -v amc 2>/dev/null || true)
  if [ -n "$other" ] && [ "$other" != "$prefix/bin/amc" ]; then
    say "Note: another amc is at $other. New terminals use this one first."
  fi

  say ""
  say "AMC $version is installed from commit $commit ($repo)."
  say "It is in $prefix. To remove it, delete that folder and the marked line in your shell profile."
  say "Next step: open a new terminal (or run: export PATH=\"$prefix/bin:\$PATH\"), go to your project folder and type: amc"
}

amc_source_install "$@"
