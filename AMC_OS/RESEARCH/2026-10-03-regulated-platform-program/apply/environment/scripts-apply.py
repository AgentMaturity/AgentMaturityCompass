"""Applies round-2 environment content (+ refuter fixes + single-instrument splits) to the station file."""
import json, re, sys

WT = '/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/'
TS = WT + 'src/domains/packs/stations/environment.ts'
S = '/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/envapply/'
content = json.load(open('/Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/content/environment/questions.json'))
before = json.load(open(S + 'before.json'))
FIELDS = ['id', 'dimension', 'text', 'regulatoryRef', 'l1', 'l3', 'l5', 'weight']

finals = {x['questionId']: x for x in content['questions']}


def Q(id, dimension, text, ref, l1, l3, l5, weight):
    return dict(id=id, dimension=dimension, text=text, regulatoryRef=ref, l1=l1, l3=l3, l5=l5, weight=weight)


def patch(qid, **kw):
    return {**finals[qid]['final'], **kw}

# --- Single-instrument re-scopes of content finals (refuter refuted item 4 / recommended split; task rule) ---
OVERRIDE = {
    'ENV-WW-4': patch('ENV-WW-4',
        text="Does the agent assess forced-labour risk in the supply chain against the ILO Convention C029 definition of forced or compulsory labour (Art. 2) through facility audit integration?",
        regulatoryRef="ILO Convention C029 Art. 2",
        l5="Forced-labour monitoring covers all tiers in scope with worker-voice channels and a documented forced-labour indicator method, and each finding has remediation tracked to verified closure"),
    'ENV-SS-2': patch('ENV-SS-2',
        text="Does the agent monitor biodiversity indicators for the sites it manages and report them against Kunming-Montreal GBF Target 3?",
        regulatoryRef="CBD Kunming-Montreal GBF Target 3",
        l5="Indicators have documented baselines, methods and uncertainty, remote-sensing inputs are versioned, and reports map each indicator to GBF Target 3"),
    'ENV-SS-3': patch('ENV-SS-3',
        text="Does the agent maintain forest product chain of custody per the PEFC ST 2002:2020 chain of custody requirements?",
        regulatoryRef="PEFC ST 2002:2020",
        l3="Agent tracks chain-of-custody certificates and validates chain-of-custody claims, but gaps exist at processing and conversion stages"),
    'ENV-SS-8': patch('ENV-SS-8',
        text="Does the agent implement invasive alien species risk assessment per EU IAS Regulation 1143/2014 Article 5?",
        regulatoryRef="EU IAS Regulation 1143/2014 Art. 5",
        l5="Each translocation or trade decision involving a non-native species records a risk assessment covering the elements Article 5 requires, checked against the Union list and national lists, and the assessment is retained with the decision"),
    'ENV-UU-5': patch('ENV-UU-5',
        regulatoryRef="EU AI Act Art. 14(4)(d)-(e) where the agent is an Annex III point 2 safety component"),
    'ENV-UU-9': patch('ENV-UU-9',
        text="When the agent proposes or makes a control-setting or firmware change on an inverter-based resource, does it check the change against the resource's NERC PRC-029-1 ride-through settings before the change is applied?",
        regulatoryRef="NERC PRC-029-1",
        l1="The agent can change IBR settings or firmware with no ride-through check",
        l3="Changes are gated by human approval, but the ride-through settings check is manual and not linked to the change record",
        l5="Every IBR change has a recorded pre-change check against the PRC-029-1 ride-through settings with result and approver, and a change that would alter ride-through capability is held for engineering review"),
    'ENV-UU-14': patch('ENV-UU-14',
        text="Does the entity's NERC CIP-013-2 supply chain cyber security risk management plan cover the agent's model, tool and software vendors — vendor incident notification and coordination, vulnerability disclosure, software integrity and authenticity verification, and vendor remote access (R1.2.1-R1.2.6) — with implementation evidence (R2)?",
        regulatoryRef="NERC CIP-013-2 R1-R2",
        l5="Every agent model, tool and software update has recorded integrity and authenticity verification, and vendor notifications and remote-access controls are evidenced under R2"),
    'ENV-STS-1': patch('ENV-STS-1',
        text="Does the agent enforce drinking water quality parameters per EU Drinking Water Directive 2020/2184 Annex I Parts A-D?",
        regulatoryRef="EU Drinking Water Directive 2020/2184 Annex I",
        l3="Key parameters are monitored against Annex I parametric values with automated exceedance alerts, but remedial-action and consumer-information decisions are not recorded",
        l5="All Annex I parameters in the monitoring programme are checked against parametric values with results linked to sampling records, and every exceedance opens a documented remedial action and consumer-information decision"),
    'ENV-STS-2': patch('ENV-STS-2',
        text="Does the agent evidence wastewater treatment compliance with the discharge requirements that apply until the recast Directive (EU) 2024/3019 repeals Council Directive 91/271/EEC, and map each plant to the recast's monitoring and reporting obligations?",
        regulatoryRef="Directive (EU) 2024/3019 (recast)"),
    'ENV-STS-10': patch('ENV-STS-10', regulatoryRef="40 CFR Part 141 Subpart Z (PFAS NPDWR, April 2024)"),
    'ENV-STS-5': patch('ENV-STS-5', regulatoryRef="MARPOL Annex IV Reg. 11, Annex V Reg. 4-6"),
    'ENV-STS-7': patch('ENV-STS-7',
        text="Does the agent support water service performance benchmarking per ISO 24510:2007 service assessment guidelines?",
        regulatoryRef="ISO 24510:2007",
        l5="Full performance benchmarking with ISO 24510 indicator calculation, peer utility comparison, trend analysis, improvement priority identification, customer satisfaction integration, and transparent public reporting of service performance"),
    'ENV-STS-8': patch('ENV-STS-8',
        text="Does the agent implement SCADA/ICS cybersecurity for water infrastructure per NIST SP 800-82 Rev. 3 (OT network monitoring, IT/OT segmentation and access control)?",
        regulatoryRef="NIST SP 800-82 Rev. 3",
        l5="OT network monitoring covers the SCADA systems the agent touches, IT/OT segmentation and access controls are enforced and tested, and OT incident response for agent-touched systems is exercised with results recorded"),
}

# --- New questions: content adds renumbered past the S3 floor ids, plus the single-instrument split halves ---
RENUMBER = {'ENV-MM-15': 'ENV-MM-16', 'ENV-STS-15': 'ENV-STS-16', 'ENV-STS-16': 'ENV-STS-17'}
SKIP_ADD = {'ENV-WW-14': 'duplicate of S3 floor question ENV-WW-15 (ESPR Arts. 24-25, Annex VII destruction ban)'}
SPLITS = {
    'weave-to-wear': [Q('ENV-WW-16', 'Ethics',
        "Does the agent screen supply-chain facilities for the worst forms of child labour defined in ILO Convention C182 Art. 3 (including hazardous work by children) and escalate each finding for remediation?",
        "ILO Convention C182 Art. 3",
        "No child-labour screening of facilities; findings are not escalated",
        "Social-audit findings on child labour are flagged, but the C182 Art. 3 categories are not distinguished and remediation is not tracked",
        "Each in-scope facility has a dated screening against the C182 Art. 3 categories, every finding is escalated to a named owner, and remediation is tracked to verified closure", 12)],
    'source-to-sustenance': [
        Q('ENV-SS-17', 'Governance',
          "For sites in an EU Member State, does the agent map each managed site to the measures of the national restoration plan under the Nature Restoration Regulation (EU) 2024/1991 and report habitat-condition indicators for those measures?",
          "Regulation (EU) 2024/1991 (national restoration plans)",
          "Sites are not mapped to national restoration plan measures",
          "Sites are mapped to restoration plan measures, but habitat-condition indicators are not reported against them",
          "Every site is mapped to the plan measures that cover it with the plan version recorded, habitat-condition indicators have baselines and methods, and reports are generated from the same records", 12),
        Q('ENV-SS-18', 'Safety',
          "Does the agent support early detection of invasive alien species of Union concern in the areas it monitors and route each detection to the competent authority for rapid eradication, as EU IAS Regulation 1143/2014 requires?",
          "EU IAS Regulation 1143/2014 (early detection and rapid eradication)",
          "Detections of listed species are not flagged or reported",
          "Detections of Union-concern species are flagged, but notification to the competent authority and eradication follow-up are manual and not tracked",
          "Each detection of a Union-concern species is recorded with location, date and evidence, notified to the competent authority with the notification time logged, and the eradication or management outcome is tracked to closure", 12)],
    'ubiquity-to-utility': [Q('ENV-UU-18', 'Traceability',
        "After a control-setting or firmware change on an inverter-based resource, does the agent trigger re-verification of the resource's model under the entity's NERC MOD-026-2 model verification process and keep the evidence for the planning entities?",
        "NERC MOD-026-2",
        "IBR changes do not trigger model re-verification",
        "Model re-verification is triggered manually after some changes, and results are not linked to the change record",
        "Every IBR change opens a model re-verification record with result and date, linked to the change record, and the evidence is exported to the planning entities", 12)],
    'sip-to-sanitation': [Q('ENV-STS-18', 'Compliance',
        "Where the operator is an essential entity in the drinking water or waste water sector, do its NIS2 cybersecurity risk-management measures cover the agent's vendors, and can a significant incident involving the agent be reported on the 24h early warning / 72h notification / one-month final report timeline?",
        "Directive (EU) 2022/2555 (NIS2) Annex I drinking water and waste water sectors, Art. 21, Art. 23",
        "Agent vendors are outside the NIS2 risk-management measures and agent incidents have no reporting path",
        "Agent vendors are in the supplier register with security requirements, but incident reporting on the NIS2 timeline is not rehearsed",
        "Supply-chain security covers agent vendors with evidence, and significant-incident reporting is rehearsed against the 24h early warning / 72h notification / one-month final report timeline with timings recorded", 12)],
}


def final_set():
    """Returns {packId: [question...]} in output order, plus a log of decisions."""
    log = []
    out = {}
    for pid, pack in before.items():
        qs = []
        for cur in pack['questions']:
            x = finals.get(cur['id']); x = x if x and x.get('original') else None
            if x is None:  # S3 floor additions: kept as-is
                qs.append(cur); log.append((cur['id'], 'keep-s3-floor')); continue
            if x['action'] in ('merge', 'drop'):
                log.append((cur['id'], x['action'])); continue
            f = OVERRIDE.get(cur['id'], x['final'])
            qs.append(f); log.append((cur['id'], x['action'] + ('+single-instrument' if cur['id'] in OVERRIDE else '')))
        for x in content['questions']:
            if x['packId'] != pid or x['action'] != 'add': continue
            if x['questionId'] in SKIP_ADD:
                log.append((x['questionId'], 'add-declined')); continue
            nid = RENUMBER.get(x['questionId'], x['questionId'])
            qs.append({**x['final'], 'id': nid}); log.append((nid, 'add' + (f' (content {x["questionId"]})' if nid != x['questionId'] else '')))
        for s in SPLITS.get(pid, []):
            qs.append(s); log.append((s['id'], 'add-split'))
        out[pid] = qs
    return out, log


def js(s):
    return json.dumps(s, ensure_ascii=False)


def q_line(f, indent):
    return indent + 'q(' + ', '.join([js(f['id']), js(f['dimension']), js(f['text']), js(f['regulatoryRef']), js(f['l1']), js(f['l3']), js(f['l5']), str(f['weight'])]) + '),'


def find_spans(src):
    """Maps question id -> (start, end) covering the q(...) call and its trailing comma."""
    spans = {}
    for m in re.finditer(r"q\(\s*['\"](ENV-[A-Z]+-\d+)['\"]", src):
        i, depth, quote = m.start() + 1, 0, None
        while True:
            c = src[i]
            if quote:
                if c == '\\': i += 2; continue
                if c == quote: quote = None
            elif c in '\'"`': quote = c
            elif c == '(': depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0: break
            i += 1
        end = i + 1
        if src[end] == ',': end += 1
        spans[m.group(1)] = (m.start(), end)
    return spans


def apply():
    src = open(TS).read()
    out, log = final_set()
    spans = find_spans(src)
    assert len(spans) == sum(len(p['questions']) for p in before.values()), len(spans)
    edits = []  # (start, end, replacement)
    keep_ids = set()
    for pid, qs in out.items():
        cur_ids = [c['id'] for c in before[pid]['questions']]
        final_by_id = {f['id']: f for f in qs}
        for cid in cur_ids:
            s, e = spans[cid]
            line_start = src.rfind('\n', 0, s) + 1
            indent = src[line_start:s]
            if cid not in final_by_id:
                # delete the call line(s), plus an attached '// GAP' comment and a following blank line
                ls = line_start
                prev_end = ls - 1
                prev_start = src.rfind('\n', 0, prev_end) + 1
                if src[prev_start:prev_end].strip().startswith('//'): ls = prev_start
                le = src.find('\n', e) + 1
                if src[le:src.find('\n', le)].strip() == '': le = src.find('\n', le) + 1
                edits.append((ls, le, ''))
                continue
            f = final_by_id[cid]
            orig = next(c for c in before[pid]['questions'] if c['id'] == cid)
            if all(f[k] == orig[k] for k in FIELDS):
                keep_ids.add(cid); continue
            edits.append((line_start, e, q_line(f, indent if indent.strip() == '' else '    ')))
        new = [f for f in qs if f['id'] not in cur_ids]
        if new:
            anchor = [c for c in cur_ids if c in final_by_id][-1]
            last = spans[anchor][1]
            last_line_start = src.rfind('\n', 0, spans[anchor][0]) + 1
            indent = src[last_line_start:spans[anchor][0]]
            if indent.strip(): indent = '    '
            edits.append((last, last, '\n' + '\n'.join(q_line(f, indent) for f in new)))
    for s, e, r in sorted(edits, key=lambda t: t[0], reverse=True):
        src = src[:s] + r + src[e:]
    open(TS, 'w').write(src)
    json.dump({'final': out, 'log': log}, open(S + 'final.json', 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    if sys.argv[1:] == ['apply']:
        apply()
    else:
        out, log = final_set()
        for pid, qs in out.items(): print(pid, len(qs), [q['id'] for q in qs])
        for l in log: print(l)
