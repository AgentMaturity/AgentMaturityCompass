set -euo pipefail
case "local" in
  local)
    ACTION_REPOSITORY=$(CDPATH= cd -- "$GITHUB_ACTION_PATH/.." && pwd)
    pnpm --dir "$ACTION_REPOSITORY" install --frozen-lockfile
    pnpm --dir "$ACTION_REPOSITORY" run build
    npm install -g "$ACTION_REPOSITORY"
    ;;
  1.2.0)
    curl -fsSL https://agentmaturity.co/install.sh | sh
    ;;
  *)
    echo "Unsupported AMC release input. This preview action currently verifies only 1.2.0 or local." >&2
    exit 1
    ;;
esac
