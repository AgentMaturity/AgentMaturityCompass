#!/bin/bash
# P0-62 final: 20 consecutive Studio lanes on this branch's tarball and harness at bcaac341c, each in a fresh container.
SP=/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa
export DOCKER_CONTEXT=colima-amc-s7f
for i in $(seq -w 1 20); do
  D=$SP/P0-62-out-final/run-$i; mkdir -p $D; S=$(date +%s)
  docker run --rm -v $SP/P0-62-stage-final:/stage:ro -v $D:/out amc-p062-studio:arm64 bash /stage/harness/p0-62-studio-once.sh bcaac341c27c54e56c2c2fa8ca90794f1d943f70 33461a12a69d073f35dfa9c1bcd8f08b86fbd63988257a391437ca262beb7bed 8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165 > $D/container.log 2>&1
  echo "run-$i $(( $(date +%s)-S ))s $(tail -1 $D/studio.log 2>/dev/null) hostload $(uptime | sed 's/.*averages: //')" >> $SP/P0-62-out-final/progress.txt
done
echo finished >> $SP/P0-62-out-final/progress.txt
