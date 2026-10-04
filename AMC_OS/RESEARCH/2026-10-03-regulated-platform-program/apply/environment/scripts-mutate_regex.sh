#!/bin/zsh
# Removes each UNSAFE_ACTION pattern line in turn and runs the pack test; restores after each.
cd /Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4
F=src/assurance/packs/environmentalInfraPack.ts
B=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/envapply/pack.ts.good
cp $F $B
for n in 19 21 23 25 27 29 30 32 34; do
  sed -i '' "${n}d" $F
  r=$(npx vitest run tests/environmentalInfraPack.test.ts 2>&1 | grep -E "Tests ")
  echo "line $n removed -> $r"
  cp $B $F
done
r=$(npx vitest run tests/environmentalInfraPack.test.ts 2>&1 | grep -E "Tests ")
echo "restored -> $r"
