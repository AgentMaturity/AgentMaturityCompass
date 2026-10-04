import json, sys, shutil
from collections import Counter, defaultdict
S = '/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/edu-apply'
OUT = '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/education/'
sys.path.insert(0, S)
from decisions import RENAME, NARROW, SPLITS

built = json.load(open(S + '/built.json'))
q = json.load(open(S + '/questions.json'))
recs = {r['questionId']: r for r in q['questions']}

per_pack = defaultdict(Counter)
for pack, qid, action in built['log']:
    per_pack[pack][action.split(' ')[0]] += 1

applied = []
for pack, final in built['packs'].items():
    for f in final:
        orig = next((k for k, v in RENAME.items() if v == f['id']), f['id'])
        r = recs.get(orig)
        split_parent = next((p for p, s in SPLITS.items() if s['id'] == f['id']), None)
        entry = {'pack': pack, 'final': f}
        if split_parent:
            s = SPLITS[split_parent]
            entry.update(action='split', splitFrom=split_parent, sources=[s['source']])
        elif r is None or (orig != f['id'] and False):
            entry.update(action='head-only keep (added at HEAD by 20b69fb4)')
        else:
            if r['action'] == 'add' and orig in ('EDU-ST-15', 'EDU-DA-14') and f['id'] == orig:
                entry.update(action='head-only keep (added at HEAD by 20b69fb4)')
            else:
                entry.update(action=r['action'], authorRationale=r['rationale'], sources=r.get('sources', []))
                if orig != f['id']: entry['renamedFrom'] = orig
        if f['id'] in NARROW:
            entry['applyChange'] = NARROW[f['id']]['why']
        applied.append(entry)

result = {
    'track': 'round-2 content apply, education station (k12-pm3, higher-education, skills-training, specialized-education, differently-abled)',
    'startHead': '67d73223897008ca4ed8baf81c970020b4bf944d',
    'worktree': '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3',
    'branch': 'worktree-wf_b05b1ca6-169-3',
    'ranAt': '2026-10-04',
    'inputs': 'round2/content/education/{questions.json,deep-questions.json,assurance-anchors.json,summary.md,review.json}; research/education/digest.json; research/pack-quality/education.json (read from the root checkout, read-only)',
    'actionsPerPack': {p: dict(c) for p, c in per_pack.items()},
    'measurements': built['measurements'],
    'appliedQuestions': applied,
    'droppedOrMerged': [{'pack': p, 'id': i, 'action': a, 'rationale': recs[i]['rationale']} for p, i, a in built['log'] if a.startswith(('drop', 'merge'))],
}
json.dump(result, open(OUT + 'questions-applied.json', 'w'), indent=1, ensure_ascii=False)
for f in ('build.py', 'decisions.py', 'snapshot-education.mts', 'mutations.sh', 'mutations.log', 'patches.py', 'receipt.py'):
    shutil.copy(S + '/' + f, OUT + f)
print({p: dict(c) for p, c in per_pack.items()})
print(len(applied))
