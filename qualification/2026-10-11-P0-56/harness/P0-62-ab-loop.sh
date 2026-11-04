#!/bin/bash
# P0-62: interleaved Studio lanes, int (3f241d5b6) vs this branch (9239cb96f harness, cfb8f87f9 tarball), same host conditions.
SP=/Users/sid/AgentMaturityCompass-worktrees/s7fccbbfa
export DOCKER_CONTEXT=colima-amc-s7f
CSHA=8b9ec22158bcb23a0f0123e1b12abfce1d9cd1675ba9c9f3aad6b54019ac9165
for i in 1 2 3 4 5 6; do
  for v in int branch; do
    if [ $v = int ]; then ST=$SP/P0-62-stage-int; C=3f241d5b6dd442c14008d8a29127a5d58bace39a; else ST=$SP/P0-62-stage-branch; C=9239cb96fc287db6f0df4811da43e81a522f2738; fi
    TSHA=$(shasum -a 256 $ST/rc.tgz | cut -d' ' -f1)
    D=$SP/P0-62-out-ab/$v-$i; mkdir -p $D; S=$(date +%s)
    docker run --rm -v $ST:/stage:ro -v $D:/out amc-p062-studio:arm64 bash /stage/harness/p0-62-studio-once.sh $C $TSHA $CSHA > $D/container.log 2>&1
    echo "$v-$i $(( $(date +%s)-S ))s $(tail -1 $D/studio.log 2>/dev/null) hostload $(uptime | sed 's/.*averages: //')" >> $SP/P0-62-out-ab/progress.txt
  done
done
echo finished >> $SP/P0-62-out-ab/progress.txt
