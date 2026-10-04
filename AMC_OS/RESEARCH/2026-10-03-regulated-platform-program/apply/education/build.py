"""Builds the education station question lists from questions.json + decisions.py and
rewrites the `questions: [...]` blocks of src/domains/packs/stations/education.ts."""
import json, re, sys
from collections import Counter
sys.path.insert(0, '/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/edu-apply')
from decisions import RENAME, NARROW, SPLITS

S = '/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/edu-apply'
WT = '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3'
STATION = WT + '/src/domains/packs/stations/education.ts'
KEYS = ['id', 'dimension', 'text', 'regulatoryRef', 'l1', 'l3', 'l5', 'weight']

d = json.load(open(S + '/questions.json'))
head = json.load(open(S + '/head.json'))
recs = {r['questionId']: r for r in d['questions']}

out, log = {}, []
for pack in head['packs']:
    qs = []
    for hq in pack['questions']:
        r = recs.get(hq['id'])
        if r is None or r['action'] == 'add':  # add ids EDU-ST-15/EDU-DA-14 collide with HEAD questions
            qs.append(dict(hq)); log.append((pack['id'], hq['id'], 'head-only (keep)'))
        elif r['action'] in ('keep', 'rewrite'):
            qs.append(dict(r['final'])); log.append((pack['id'], hq['id'], r['action']))
        else:
            log.append((pack['id'], hq['id'], r['action'] + (' -> ' + r['mergedInto'] if r.get('mergedInto') else '')))
    for r in d['questions']:
        if r['packId'] == pack['id'] and r['action'] == 'add':
            f = dict(r['final']); f['id'] = RENAME.get(f['id'], f['id'])
            qs.append(f); log.append((pack['id'], f['id'], 'add' + (' (renamed from %s)' % r['questionId'] if f['id'] != r['questionId'] else '')))
    final = []
    for f in qs:
        o = NARROW.get(f['id'])
        if o:
            f = {k: o.get(k, f[k]) for k in KEYS}
        final.append(f)
        s = SPLITS.get(f['id'])
        if s:
            final.append({k: s[k] for k in KEYS}); log.append((pack['id'], s['id'], 'split from ' + f['id']))
    ids = [f['id'] for f in final]
    assert len(ids) == len(set(ids)), ids
    for f in final:
        assert list(f) == KEYS and isinstance(f['weight'], int) and all(f[k] for k in KEYS), f
    out[pack['id']] = final

src = open(STATION).read()
for pid, final in out.items():
    start = src.index('id: "%s"' % pid)
    qstart = src.index('questions: [', start) + len('questions: [')
    qend = src.index('\n  ]\n};', qstart)
    body = '\n' + '\n'.join('    q(%s),' % ', '.join(json.dumps(f[k], ensure_ascii=False) for k in KEYS) for f in final)
    src = src[:qstart] + body + src[qend:]
    lr = src.index('lastReviewed: "2026-10-03"', start)
    src = src[:lr] + 'lastReviewed: "2026-10-04"' + src[lr + len('lastReviewed: "2026-10-03"'):]
open(STATION, 'w').write(src)

def balance(questions):
    total = sum(q['weight'] for q in questions)
    c, w = Counter(), Counter()
    for q in questions:
        c[q['dimension']] += 1; w[q['dimension']] += q['weight']
    return {dim: {'count': c[dim], 'weightShare': round(w[dim] / total, 3)} for dim in sorted(c)}

before = {p['id']: p['questions'] for p in head['packs']}
meas = {pid: {
    'riskTier': next(p['riskTier'] for p in head['packs'] if p['id'] == pid),
    'questionsBefore': len(before[pid]), 'questionsAfter': len(final),
    'weightTotalBefore': sum(q['weight'] for q in before[pid]), 'weightTotalAfter': sum(q['weight'] for q in final),
    'weightMinMaxAfter': [min(q['weight'] for q in final), max(q['weight'] for q in final)],
    'balanceBefore': balance(before[pid]), 'balanceAfter': balance(final),
} for pid, final in out.items()}
json.dump({'packs': out, 'log': log, 'measurements': meas}, open(S + '/built.json', 'w'), indent=1, ensure_ascii=False)
for pid, m in meas.items():
    print(pid, m['questionsBefore'], '->', m['questionsAfter'], 'weights', m['weightTotalBefore'], '->', m['weightTotalAfter'], m['weightMinMaxAfter'])
print(Counter(a.split(' ')[0] for _, _, a in log))
