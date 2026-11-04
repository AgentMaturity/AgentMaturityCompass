#!/bin/bash
# P0-62 validation: the same Studio lane with this branch's tarball (tarball from cfb8f87f9, harness and source tree at 9239cb96f), 20 fresh containers.
SP=/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa
export DOCKER_CONTEXT=colima-amc-s7f
for i in $(seq -w 1 20); do
  D=$SP/P0-62-out-branch/run-$i; mkdir -p $D; S=$(date +%s)
  docker run --rm -v $SP/P0-62-stage-branch:/stage:ro -v $D:/out amc-p062-studio:arm64 bash /stage/harness/p0-62-studio-once.sh \
    9239cb96fc287db6f0df4811da43e81a522f2738 b6a15334544d4bbe0de43607d9143e17c1f61e96e9e654e3aa21d4aba870de5c \
    8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165 > $D/container.log 2>&1
  echo "run-$i container exit $? $(( $(date +%s)-S ))s $(tail -1 $D/studio.log 2>/dev/null)" >> $SP/P0-62-out-branch/progress.txt
done
echo finished >> $SP/P0-62-out-branch/progress.txt
