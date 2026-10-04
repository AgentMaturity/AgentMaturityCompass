"""Re-labels '// GAP-x: <citation>' comments above questions whose regulatoryRef changed."""
import json, re
S = '/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/envapply/'
TS = '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/src/domains/packs/stations/environment.ts'
before = {q['id']: q for p in json.load(open(S + 'before.json')).values() for q in p['questions']}
after = {q['id']: q for p in json.load(open(S + 'after.json')).values() for q in p['questions']}
lines = open(TS).read().split('\n')
changed = []
for i, line in enumerate(lines):
    m = re.search(r"q\(\s*['\"](ENV-[A-Z]+-\d+)['\"]", line) or (re.match(r"\s*q\($", line) and re.search(r"['\"](ENV-[A-Z]+-\d+)['\"]", lines[i + 1]))
    if not m: continue
    qid = m.group(1)
    if qid not in before or before[qid]['regulatoryRef'] == after[qid]['regulatoryRef']: continue
    c = re.match(r"(\s*// GAP-[^:]+: )(.*)$", lines[i - 1])
    if c:
        lines[i - 1] = c.group(1) + after[qid]['regulatoryRef']
        changed.append(qid)
open(TS, 'w').write('\n'.join(lines))
print(changed)
