#!/bin/sh
# P0-36 step 4: does the extraction 1.1.1 used escape its output directory with this host's tar?
# 1.1.1 ran `tar -xzf <archive> -C <outDir>` (no -P) at the 17 sites cb6bba21 replaced. This script builds five
# hostile archives in a fresh temp directory, extracts each exactly that way, and reports whether a file appeared
# outside <outDir>. It writes nothing outside its temp directory. Run it on every tar a 1.1.1 user could have:
# macOS bsdtar, GNU tar (Linux), and the tar inside the quickstart image.
set -u
T=$(mktemp -d "${TMPDIR:-/tmp}/amc-p036-tar.XXXXXX")
mkdir -p "$T/victim" "$T/gen"
echo original > "$T/victim/target.txt"
python3 - "$T" <<'EOF'
import io, sys, tarfile
root = sys.argv[1]; victim = root + "/victim"
def add(t, name, typ=tarfile.REGTYPE, link=""):
    ti = tarfile.TarInfo(name); ti.type = typ; ti.linkname = link
    data = b"escaped" if typ == tarfile.REGTYPE else b""
    ti.size = len(data); t.addfile(ti, io.BytesIO(data) if data else None)
def make(name, *members):
    with tarfile.open(f"{root}/gen/{name}.tgz", "w:gz") as t:
        for m in members: add(t, *m)
make("dotdot", ("../victim/dotdot.txt",))
make("absolute", (victim + "/absolute.txt",))
make("symlink-abs", ("l", tarfile.SYMTYPE, victim), ("l/via-abs-symlink.txt",))
make("symlink-rel", ("l", tarfile.SYMTYPE, "../victim"), ("l/via-rel-symlink.txt",))
make("hardlink", ("h", tarfile.LNKTYPE, victim + "/target.txt"), ("h",))
EOF
tar --version 2>&1 | head -1
escaped=0
for a in dotdot absolute symlink-abs symlink-rel hardlink; do
  rm -rf "$T/out"; mkdir "$T/out"
  tar -xzf "$T/gen/$a.tgz" -C "$T/out" >/dev/null 2>&1; code=$?
  if [ "$(ls "$T/victim")" != "target.txt" ] || [ "$(cat "$T/victim/target.txt")" != "original" ]; then
    echo "$a: ESCAPED (tar exit $code)"; escaped=1
    rm -rf "$T/victim"; mkdir "$T/victim"; echo original > "$T/victim/target.txt"
  else
    echo "$a: contained (tar exit $code)"
  fi
done
rm -rf "$T"
exit $escaped
