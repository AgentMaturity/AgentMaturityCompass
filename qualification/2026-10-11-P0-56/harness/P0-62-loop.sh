#!/bin/bash
# P0-62: runs 02..20 of the Studio lane, each in a fresh container (run 01 ran by hand with the same command).
SP=/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa
export DOCKER_CONTEXT=colima-amc-s7f
for i in $(seq -w 2 20); do
  D=$SP/P0-62-out/run-$i; mkdir -p $D; S=$(date +%s)
  docker run --rm -v $SP/P0-62-stage:/stage:ro -v $D:/out amc-p062-studio:arm64 bash /stage/harness/p0-62-studio-once.sh \
    756bd6977dce19f4ef781bdb492c38d6777964f7 21190c7da41e9fc5bf87e168416b34085f223df8cf80425e420557011ebc0340 \
    8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165 > $D/container.log 2>&1
  echo "run-$i container exit $? $(( $(date +%s)-S ))s $(tail -1 $D/studio.log 2>/dev/null)" >> $SP/P0-62-out/progress.txt
done
echo finished >> $SP/P0-62-out/progress.txt
