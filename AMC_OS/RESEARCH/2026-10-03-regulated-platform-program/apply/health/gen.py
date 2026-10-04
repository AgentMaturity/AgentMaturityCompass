"""Applies round-2 questions.json (+ refuter fixes and single-instrument trims) to the health station file."""
import json, re, sys

D = "/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/health-apply/"
TS = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-2/src/domains/packs/stations/health.ts"

# field overrides on top of questions.json finals; reason recorded in the receipt (overrides.json)
OVERRIDES = {
    "HLT-PL-1": {
        "why": "single-instrument trim: MDR Annex I §17 is a second, EU device-software obligation compounded onto the FDA CDS criteria (refuter editorial.singleInstrument names PL-1)",
        "text": "Does the agent keep non-device CDS status by letting health care professionals independently review the basis of each recommendation (inputs, data relied on, validation, patient-specific unknowns), and treat time-critical or judgment-directing uses as device functions (FDA CDS guidance, January 2026)?",
        "regulatoryRef": "FDA Clinical Decision Support Software guidance (January 2026)",
    },
    "HLT-PL-3": {
        "why": "single-instrument trim: JCI ACC.1 (private accreditation standard) compounded a second obligation onto the AI Act Annex III 5(d) anchor; ESI handbook kept as the means",
        "text": "Does the agent implement triage safety per the Emergency Severity Index (ESI) v4 with escalation protocols, and evidence the high-risk controls where EU AI Act Annex III point 5(d) (emergency patient triage) applies?",
        "regulatoryRef": "ESI v4 Implementation Handbook; EU AI Act Annex III point 5(d)",
    },
    "HLT-PP-9": {
        "why": "single-instrument trim: hospital standard-charge disclosure (45 CFR Part 180) is a second obligation from a different regulation; the question keeps the good-faith-estimate obligation (§149.610)",
        "text": "Does the agent produce good faith estimates for uninsured or self-pay patients per 45 CFR §149.610?",
        "regulatoryRef": "45 CFR §149.610",
        "l3": "Estimates are produced for scheduled services, but required content or timing is not checked",
        "l5": "Each estimate is checked against §149.610 content and timing with a record; estimate-vs-bill differences are tracked",
    },
    "HLT-CT-9": {
        "why": "single-instrument trim: CTR Art. 61 (manufacturing/import authorisation) was kept only as an 'adjacent fit' (author rationale); also removes the stale 'ICH E6(R2) §5.14' left in L5",
        "text": "Does the agent manage investigational product supply per ICH E6(R3) Annex 1 §3.15.3?",
        "regulatoryRef": "ICH E6(R3) Annex 1 §3.15.3",
        "l5": "Comprehensive IP supply chain with temperature-monitored distribution, expiry management, randomization-integrated dispensing, accountability reconciliation, return/destruction documentation, and blinding integrity verification per ICH E6(R3) Annex 1 §3.15.3",
    },
    "HLT-DD-5": {
        "why": "single-instrument trim: the WIPO PCT (international filing procedure) does not govern inventorship documentation; the USPTO guidance (90 FR 54636, verified by the author) is the anchor",
        "text": "Does the agent document AI contributions to discoveries so that inventorship of AI-assisted inventions can be determined per the USPTO Revised Inventorship Guidance for AI-Assisted Inventions (2025)?",
        "regulatoryRef": "USPTO Revised Inventorship Guidance for AI-Assisted Inventions (90 FR 54636, 2025)",
    },
    "HLT-CL-13": {
        "why": "refuter fix 7: clause §5.9 rests on unread (paywalled) text; pin stripped to the instrument",
        "text": "Does the agent support usability engineering per IEC 62366-1:2015+AMD1:2020 by capturing summative usability evaluation evidence for safety-critical clinical workflows (use-related risk scenarios, representative users, documented residual use-related risk)?",
        "regulatoryRef": "IEC 62366-1:2015+AMD1:2020",
    },
    "HLT-SM-2": {
        "why": "refuter fix 7: §2/§6 numbering rests on unread (paywalled) text; pins stripped to the instrument",
        "text": "Does the agent enforce sterile compounding controls per USP <797> (2023) for personnel training and microbiological air and surface monitoring?",
        "regulatoryRef": "USP <797> (2023)",
    },
    "HLT-SM-17": {
        "why": "refuter fix 7: §7 numbering rests on unread (paywalled) text; pin stripped to the instrument",
        "text": "Does the agent implement a contamination control program aligned to the USP <797> (2023) cleaning, disinfecting and sporicidal requirements, including documented schedules, execution verification, sporicidal cadence, investigation triggers and CAPA tied to environmental monitoring excursions?",
        "regulatoryRef": "USP <797> (2023)",
    },
    "HLT-LT-8": {
        "why": "refuter fix 7: IEC 81001-5-1 edition ':2021' not confirmed; pinned to the instrument",
        "regulatoryRef": "FDA Cybersecurity in Medical Devices guidance (February 2026); FD&C Act §524B; IEC 81001-5-1",
    },
    "HLT-SM-18": {
        "why": "refuter fix 9: 'a licensed clinician reviews every adverse determination' is not a CMS-0057-F requirement",
        "l5": "Every denial carries a specific reason; decision times are measured against 72h/7d with escalation before breach; drug requests follow their own rules",
    },
    "HLT-WM-5": {
        "why": "refuter fix 10: the FTC page states no publication date; date removed from text and ref",
        "text": "Does the agent make health-benefit claims for wellness interventions only when supported by competent and reliable scientific evidence (FTC Act §5; FTC Health Products Compliance Guidance), and state evidence limits to users?",
        "regulatoryRef": "FTC Act 15 U.S.C. §45; FTC Health Products Compliance Guidance",
    },
    "HLT-LT-15": {
        "why": "refuter fix 5: neither 2017 nor 2019 could be read on an official page (FDA page 403/landing on 2026-10-04 for the refuter and for this run); year and the unread §4 pin removed rather than asserted",
        "text": "Does the agent implement the FDA guidance Software as a Medical Device (SaMD): Clinical Evaluation by structuring evidence as (1) valid clinical association, (2) analytical validation and (3) clinical validation, with intended-use alignment, subgroup analysis and real-world performance monitoring?",
        "regulatoryRef": "FDA SaMD Clinical Evaluation guidance",
        "l5": "Full clinical evaluation with evidence mapping, intended-use traceability, subgroup performance analysis, and continuous real-world performance feedback into evaluation updates",
    },
}

PACK_VARS = {
    "digital-health-record": "digitalHealthRecord", "wellness-management": "wellnessManagement",
    "patient-lifecycle": "patientLifecycle", "clinical-lifecycle": "clinicalLifecycle",
    "professional-practice": "professionalPractice", "life-technology": "lifeTechnology",
    "drug-discovery": "drugDiscovery", "clinical-trials": "clinicalTrials", "specialized-medicine": "specializedMedicine",
}
FIELDS = ["id", "dimension", "text", "regulatoryRef", "l1", "l3", "l5", "weight"]


def finals():
    d = json.load(open(D + "questions.json"))
    by_pack = {}
    used = set()
    for r in d["questions"]:
        f = r["final"]
        if not f:
            continue
        f = dict(f)
        o = OVERRIDES.get(f["id"])
        if o:
            used.add(f["id"])
            for k, v in o.items():
                if k != "why":
                    assert k in f, (f["id"], k)
                    assert f[k] != v, (f["id"], k, "override is a no-op")
                    f[k] = v
        by_pack.setdefault(r["packId"], []).append(f)
    assert used == set(OVERRIDES), set(OVERRIDES) - used
    return by_pack


def render(qs):
    lines = []
    for f in qs:
        args = [json.dumps(f[k], ensure_ascii=False) for k in FIELDS[:-1]] + [str(f["weight"])]
        lines.append(f"    q({', '.join(args)}),")
    return "\n".join(lines)


def main():
    src = open(TS).read()
    by_pack = finals()
    for pack_id, var in PACK_VARS.items():
        start = src.index(f"export const {var}: IndustryPack = {{")
        q0 = src.index("  questions: [\n", start) + len("  questions: [\n")
        q1 = src.index("\n  ]\n};", q0)
        src = src[:q0] + render(by_pack[pack_id]) + src[q1:]
        # content reviewed in round 2 on 2026-10-04
        lr = src.index('  lastReviewed: "2026-10-03",', start)
        src = src[:lr] + '  lastReviewed: "2026-10-04",' + src[lr + len('  lastReviewed: "2026-10-03",'):]
    old = '    "EU AI Act Annex III §5(b)",'
    assert src.count(old) == 1
    src = src.replace(old, '    "EU AI Act Annex III §5(c)",')
    open(TS, "w").write(src)
    json.dump(OVERRIDES, open(D + "overrides.json", "w"), indent=1, ensure_ascii=False)
    print({p: len(v) for p, v in by_pack.items()})


if __name__ == "__main__":
    main()
