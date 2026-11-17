#!/bin/sh
# Agent Maturity Compass Studio for Linux: sh amc-studio.sh [--demo | --stop | --add-to-menu]
# Starts AMC Studio in your own workspace (or the view-only demo), then opens the Compass Console in your browser.
# --add-to-menu adds Agent Maturity Compass Studio, with its icon, to your applications menu.
# Built and unit-tested on macOS only; not yet run on a Linux desktop (docs/DESKTOP_PACKAGES.md).
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
ICON_NAME=agent-maturity-compass-studio

add_to_menu() {
  # A .desktop Exec value is quoted; these characters would need escapes that differ between desktops.
  case "$HERE" in
    *'"'*|*'`'*|*'$'*|*'\'*|*'%'*)
      echo "This folder's path has a character a menu entry cannot hold (\" \` \$ \\ %). Move the folder, then try again." >&2
      exit 1 ;;
  esac
  for SIZE in 48 128 256 512; do
    mkdir -p "$DATA_HOME/icons/hicolor/${SIZE}x${SIZE}/apps"
    cp "$HERE/icons/hicolor/${SIZE}x${SIZE}/apps/$ICON_NAME.png" "$DATA_HOME/icons/hicolor/${SIZE}x${SIZE}/apps/$ICON_NAME.png"
  done
  mkdir -p "$DATA_HOME/applications"
  ENTRY="$DATA_HOME/applications/$ICON_NAME.desktop"
  {
    printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Version=1.0' 'Name=Agent Maturity Compass Studio'
    printf '%s\n' 'Comment=Build, run and check AI agents for regulated work.'
    printf 'Exec="%s/amc-studio.sh"\n' "$HERE"
    printf 'Icon=%s\n' "$ICON_NAME"
    printf '%s\n' 'Terminal=true' 'Categories=Development;' 'StartupNotify=false'
  } >"$ENTRY"
  chmod 644 "$ENTRY"
  if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1 || true; fi
  echo "Added Agent Maturity Compass Studio to your applications menu ($ENTRY)."
  echo "It starts AMC from this folder, so keep the folder where it is."
}

case "${1:-}" in
  "") MODE=workspace ;;
  --demo) MODE=demo ;;
  --stop) MODE=stop ;;
  --add-to-menu) add_to_menu; exit 0 ;;
  *) echo "Usage: sh amc-studio.sh [--demo | --stop | --add-to-menu]" >&2; exit 2 ;;
esac

WORK=$(mktemp -d)
# Ctrl+C reaches launch-studio.sh too (same terminal), which stops what it started; this script then reports and exits.
trap 'rm -rf "$WORK"' EXIT
trap 'INTERRUPTED=1' INT TERM HUP
INTERRUPTED=0

echo "Agent Maturity Compass Studio"
{ sh "$HERE/launch-studio.sh" "$MODE"; echo "$?" >"$WORK/status"; } | while IFS= read -r LINE; do
  case "$LINE" in
    AMC_STATUS=*) printf '%s\n' "${LINE#AMC_STATUS=}" ;;
    AMC_NODE=*) printf 'Using %s\n' "${LINE#AMC_NODE=}" ;;
    AMC_ERROR=*) printf 'Problem: %s\n' "${LINE#AMC_ERROR=}" ;;
    AMC_STUDIO_URL=*) printf '%s\n' "${LINE#AMC_STUDIO_URL=}" >"$WORK/url" ;;
  esac
done

STATUS=$(cat "$WORK/status" 2>/dev/null || echo 1)
if [ "$INTERRUPTED" = 1 ]; then echo "Stopped."; exit 130; fi
if [ "$MODE" = stop ]; then echo "AMC is stopped. Your records stay on this computer."; exit "$STATUS"; fi
if [ "$STATUS" != 0 ] || [ ! -s "$WORK/url" ]; then
  printf '%s' "Press Enter to close this window. "
  read -r _ || true
  exit 1
fi
URL=$(cat "$WORK/url")
echo "The Compass Console is at $URL"
echo "AMC keeps running after you close this window. To stop it: sh \"$HERE/amc-studio.sh\" --stop"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || echo "Open that address in your browser."
else
  echo "Open that address in your browser."
fi
