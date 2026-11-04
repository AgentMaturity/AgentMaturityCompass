#!/bin/bash
# P0-62 diagnosis: the branch tarball with one logging line added to the owner Studio's projection catch; stop at the first failed run.
SP=/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa; I=$SP/P0-62-instrumented
export DOCKER_CONTEXT=colima-amc-s7f
TSHA=$(shasum -a 256 $I/stage/rc.tgz | cut -d' ' -f1)
for i in 1 2 3 4 5 6 7 8; do
  D=$I/out/run-$i; mkdir -p $D
  docker run --rm -v $I/stage:/stage:ro -v $D:/out amc-p062-studio:arm64 bash /stage/harness/p0-62-studio-once.sh \
    9239cb96fc287db6f0df4811da43e81a522f2738 $TSHA 8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165 > $D/container.log 2>&1
  echo "diag run-$i $(tail -1 $D/studio.log) P062DIAG lines: $(grep -c P062DIAG $D/owner-server-private.log 2>/dev/null)" >> $I/progress.txt
  grep -q "exit 0 duration" $D/studio.log || break
done
echo finished >> $I/progress.txt
