#!/bin/zsh
# Mutation checks: break one thing, run the focused test, restore, re-run.
set -u
WT=/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-10
SP=/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad
cd $WT
REG=src/compliance/regulatory/register.json
CLS=src/compliance/euAiActClassifier.ts
SCR=scripts/check-regulatory-currency.mjs
cp $REG $SP/m.reg; cp $CLS $SP/m.cls; cp $SCR $SP/m.scr

run() { npx vitest run "$1" 2>&1 | grep -E "Tests " | tail -1; }
sub() { node -e 'const fs=require("fs");const [p,a,b]=process.argv.slice(1);const s=fs.readFileSync(p,"utf8");if(!s.includes(a))throw new Error("anchor missing: "+a);fs.writeFileSync(p,s.replace(a,b));' "$@"; }
restore() { cp $SP/m.reg $REG; cp $SP/m.cls $CLS; cp $SP/m.scr $SCR; }

T=tests/regulatoryCurrencyRegister.test.ts
echo "M1 keyDate url -> non-official host"
sub $REG '"url": "https://leg.colorado.gov/bills/hb26-1263", "retrievedAt": "2026-10-04T05:12:00Z"' '"url": "https://example.com/hb26-1263", "retrievedAt": "2026-10-04T05:12:00Z"'
echo "  RED:   $(run $T)"; restore; echo "  GREEN: $(run $T)"

echo "M2 supersedes -> unknown entry id"
sub $REG '"supersedes": ["us-co-sb24-205"]' '"supersedes": ["us-co-sb24-999"]'
echo "  RED:   $(run $T)"; restore; echo "  GREEN: $(run $T)"

echo "M3 affectedPacks -> unknown pack id"
sub $REG '"affectedPacks": ["digital-health-record"' '"affectedPacks": ["no-such-pack"'
echo "  RED:   $(run $T)"; restore; echo "  GREEN: $(run $T)"

echo "M4 CN obligation asserted as verified"
node -e 'const fs=require("fs");const p=process.argv[1];const r=JSON.parse(fs.readFileSync(p,"utf8"));const e=r.entries.find(x=>x.id==="cn-pipl");e.agentObligations[0].verified=true;fs.writeFileSync(p,JSON.stringify(r,null,2));' $REG
echo "  RED:   $(run $T)"; restore; echo "  GREEN: $(run $T)"

echo "M5 classifier drops a register date"
sub $CLS '  publicAuthorityHighRiskDeadline: "2030-08-02",
' ''
echo "  RED:   $(run tests/euAiActTimeline.test.ts)"; restore; echo "  GREEN: $(run tests/euAiActTimeline.test.ts)"

echo "M6 currency script loses its duplicate-id check"
sub $SCR '    if (ids.has(entry?.id)) errors.push(`duplicate entry id ${entry.id}`);' '    // mutated'
echo "  RED:   $(run $T)"; restore; echo "  GREEN: $(run $T)"

echo "M7 docs table loses one entry row"
cp docs/COMPLIANCE_FRAMEWORKS.md $SP/m.doc
node -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,"utf8").split("\n").filter(l=>!l.startsWith("| European Health Data Space Regulation — ")).join("\n"));' docs/COMPLIANCE_FRAMEWORKS.md
echo "  RED:   $(run tests/regulatoryCurrency.test.ts)"; cp $SP/m.doc docs/COMPLIANCE_FRAMEWORKS.md; echo "  GREEN: $(run tests/regulatoryCurrency.test.ts)"

cmp $REG $SP/m.reg && cmp $CLS $SP/m.cls && cmp $SCR $SP/m.scr && cmp docs/COMPLIANCE_FRAMEWORKS.md $SP/m.doc && echo "all restored byte-identical"
git status --short
