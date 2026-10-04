import json, re, sys
from collections import defaultdict
ASP = re.compile(r"\b(autonomous(ly)?|fully autonomous|predict(ive|s|ion)?|cryptographic(ally)?|blockchain(-anchored)?|AI-powered|self-evolving|fully automated|immutable|sub-second)\b", re.I)
packs = json.load(open(sys.argv[1]))
out = {}
for pid, p in packs.items():
    qs = p['questions']
    tw = sum(q['weight'] for q in qs)
    dims = defaultdict(lambda: [0, 0])
    for q in qs:
        dims[q['dimension']][0] += 1; dims[q['dimension']][1] += q['weight']
    top = max(dims.items(), key=lambda kv: kv[1][1])
    out[pid] = {
        'riskTier': p['riskTier'], 'n': len(qs), 'totalWeight': tw,
        'weightRange': [min(q['weight'] for q in qs), max(q['weight'] for q in qs)],
        'dimensions': {k: {'count': v[0], 'weight': v[1], 'weightShare': round(v[1] / tw, 3)} for k, v in sorted(dims.items())},
        'largestDimension': [top[0], round(top[1][1] / tw, 3)],
        'compoundRefs': [q['id'] for q in qs if ';' in q['regulatoryRef']],
        'aspirationalLevelIds': [q['id'] for q in qs if any(ASP.search(q[k]) for k in ('l1', 'l3', 'l5'))],
    }
json.dump(out, open(sys.argv[2], 'w'), indent=1)
for pid, s in out.items():
    print(pid, s['riskTier'], 'n=', s['n'], 'tw=', s['totalWeight'], 'range', s['weightRange'], 'top', s['largestDimension'], 'compound', s['compoundRefs'], 'asp', s['aspirationalLevelIds'])
