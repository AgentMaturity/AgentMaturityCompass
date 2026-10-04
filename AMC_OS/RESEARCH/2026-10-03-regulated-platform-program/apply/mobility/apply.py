"""Applies round2/content/mobility/questions.json (with the Fable refuter's binding corrections) to
src/domains/packs/stations/mobility.ts. Run from the repo root:
  python3 AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/apply.py <questions.json>
Inputs: the author's rows, questions-before.json (HEAD 67d73223, dumped by dump.mts) and the overrides below.
Writes the six questions arrays and apply-log.json (per-row disposition) next to this file."""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
STATION = Path("src/domains/packs/stations/mobility.ts")
FIELDS = ("dimension", "text", "regulatoryRef", "l1", "l3", "l5", "weight")

rows = json.load(open(sys.argv[1]))["questions"]
head = json.load(open(HERE / "questions-before.json"))

# Author "add" ids that collide with S3 questions committed after the author's snapshot (refuter requiredFixes[0]).
RENAME = {
    "MOB-SC-15": "MOB-SC-16", "MOB-SC-16": "MOB-SC-17",
    "MOB-SP-15": "MOB-SP-16",
    "MOB-VI-15": "MOB-VI-16",
    "MOB-PS-14": "MOB-PS-17",
    # MOB-PS-15: S3's CRA Art. 14 question and the author's are one obligation; the author's text (all three
    # deadlines, read from the OJ) replaces S3's under the same id.
    "MOB-F3W-15": "MOB-F3W-16",
}
REPLACED_S3 = {"MOB-PS-15"}


def q(id, dimension, text, ref, l1, l3, l5, weight):
    return dict(id=id, dimension=dimension, text=text, regulatoryRef=ref, l1=l1, l3=l3, l5=l5, weight=weight)


# Narrowed questions (compound anchors split; refuter requiredFixes[5] and the single-instrument rule) and the
# refuter's unconfirmed-source fix (IR 2022/1426 Annex III Part 5 point 2.3 not found in the OJ text).
OVERRIDES = {
    "MOB-SC-2": q("MOB-SC-2", "Ethics",
        "Before each smart-city AI use case is deployed or changed, does the agent screen it against the prohibited AI practices in EU AI Act Article 5 and block any use that matches one?",
        "EU AI Act Art. 5",
        "No screening; smart-city AI may be used for social scoring, untargeted facial-image scraping or remote biometric identification in public spaces.",
        "Use cases are screened at first deployment, but not again when the use case, data source or model changes.",
        "Every use case has a recorded Art. 5 screening before deployment and on each change, matching uses are blocked, and the screening records are retained.",
        15),
    "MOB-VI-2": q("MOB-VI-2", "Resilience",
        "Does the agent maintain business continuity plans per ISO 22301:2019 §8.4 and test them on a schedule with recorded recovery-time and recovery-point results?",
        "ISO 22301:2019 §8.4",
        "No tested continuity plans.",
        "Continuity plans exist, but recovery times and recovery points are not tested, or the results are not recorded.",
        "Plans are tested on schedule with recovery-time and recovery-point results recorded against targets, and each failed test leads to a recorded plan change.",
        15),
    "MOB-RE-4": q("MOB-RE-4", "Governance",
        "Does the agent prepare the operator's GRESB Real Estate Assessment submission from collected portfolio data, with evidence linked to each indicator and completeness validated before submission?",
        "GRESB Real Estate Assessment",
        "No GRESB data collection; sustainability performance is not measured against GRESB indicators.",
        "GRESB-aligned data are collected, but evidence is missing for some indicators or completeness is checked by hand.",
        "Each submitted indicator links to its source data and evidence, completeness is validated before submission, and the submission can be regenerated from retained records.",
        12),
    "MOB-RE-7": q("MOB-RE-7", "Compliance",
        "Does the agent assess physical climate risk for each asset and feed the results into the operator's IFRS S2 disclosure where IFRS S2 is applied?",
        "IFRS S2",
        "No asset-level physical climate-risk assessment.",
        "Hazards are assessed for some assets or under one scenario, and the results are not tied to the disclosure.",
        "Every asset has a dated hazard and vulnerability assessment under stated scenarios, and the results feed the IFRS S2 disclosure with their inputs retained.",
        12),
    "MOB-PS-6": q("MOB-PS-6", "Governance",
        "Does the agent support cybersecurity incident response per the NIST CSF 2.0 Respond (RS) function: incident management, incident analysis, response reporting and communication, and incident mitigation?",
        "NIST CSF 2.0 RS",
        "No formal incident response; incidents are handled ad hoc without containment or records.",
        "Incidents are detected, logged and contained, but analysis, stakeholder reporting or mitigation records are incomplete.",
        "Each incident has a record covering management, analysis, communication and mitigation, forensic evidence is preserved, and lessons learned are fed back into controls with a recorded change.",
        12),
}

# Questions added to meet PACK_QUESTION_FLOOR = 15 (refuter requiredFixes[1]); four are the second halves of the
# compounds above, one is the digest's recommendation for ports (EU-MACHINERY-2023-1230 affectedPacks).
ADDED = {
    "sustainable-communities": [q("MOB-SC-18", "Privacy",
        "For each purpose for which the agent processes residents' personal data (sensor, camera, mobility or service-usage data), is a lawful basis under GDPR Article 6(1) recorded before processing starts and, where the city relies on a legal obligation or a public task, the Union or Member State law that lays it down (Art. 6(3))?",
        "GDPR Art. 6",
        "Personal data are processed with no lawful basis recorded per purpose.",
        "Lawful bases are recorded for the main purposes, but new purposes or data sources start without a recorded basis, or the Art. 6(3) legal basis is not named.",
        "Every processing purpose has a recorded Art. 6(1) basis, with its Art. 6(3) legal basis where required, before processing starts; processing for an unrecorded purpose is blocked; each change of purpose or data source triggers a recorded review.",
        12)],
    "sustainable-ports": [q("MOB-SP-17", "Safety",
        "Where the agent directs automated container-handling machinery with autonomous or self-evolving control (automated stacking cranes, straddle carriers, AGVs), does the deployment evidence the Machinery Regulation (EU) 2023/1230 Annex III requirements that apply from 20 January 2027: no actions beyond the defined task and movement space, safety-decision data retained for one year, a trace of safety-software versions retained for five years, correction possible at all times (EHSR 1.2.1), and a supervisory function for autonomous mobile machinery (EHSR 3.2.4)?",
        "EU Machinery Regulation 2023/1230 Annex III 1.2.1; EU Machinery Regulation 2023/1230 Annex III 3.2.4",
        "Agent instructions to terminal machinery are outside any safety assessment, and no decision or version records are kept.",
        "The movement envelope is enforced, but decision-data or software-version retention is partial, or the stop/correction path is untested.",
        "The task and movement envelope is enforced and tested, safety-decision data are kept one year and the software-version trace five years, and the correction/stop path and the supervisory function are tested with records.",
        10)],
    "sustainable-real-estate": [
        q("MOB-RE-20", "Transparency",
          "Where the operator manages a financial product that promotes environmental characteristics (SFDR Art. 8) or has sustainable investment as its objective (Art. 9) through real estate, does the agent keep the asset-level data behind each disclosed characteristic or objective, reconciled to the published disclosure?",
          "EU SFDR Art. 8; EU SFDR Art. 9",
          "Disclosed characteristics or objectives cannot be traced to asset-level data.",
          "Asset-level data exist for most claims, but they are not reconciled to the published disclosure or not retained per reporting period.",
          "Every disclosed characteristic or objective maps to asset-level data retained per reporting period and reconciled to the published disclosure, with differences explained and recorded.",
          12),
        q("MOB-RE-21", "Compliance",
          "Where the operator claims taxonomy alignment for climate change adaptation, does the agent test each claim against the technical screening criteria in Commission Delegated Regulation (EU) 2021/2139 Annex II for the activity concerned and keep the evidence?",
          "Commission Delegated Regulation (EU) 2021/2139 Annex II",
          "Adaptation-alignment claims are made without reference to the Annex II criteria.",
          "Claims cite the Annex II activity, but evidence is missing for some of its criteria.",
          "Each claim names the Annex II activity and criteria applied, links evidence for every criterion, and is re-tested when the asset or the criteria change.",
          10),
    ],
    "virtual-infrastructure": [q("MOB-VI-17", "Resilience",
        "Where the customer is a financial entity under DORA, does the agent support that customer's ICT response and recovery arrangements (DORA Art. 11) and its backup, restoration and recovery requirements (Art. 12) with tested evidence the contract makes available?",
        "EU DORA Art. 11; EU DORA Art. 12",
        "Financial-entity customers are not identified, or their DORA continuity requirements are not mapped to the service.",
        "DORA customers' requirements are mapped, but backup and restoration tests for their services are not evidenced or not shared.",
        "For each DORA customer, response, recovery, backup and restoration arrangements are mapped to the contract, tested on schedule, and the test evidence is shared as the contract requires.",
        12)],
    "privacy-security-mobility": [q("MOB-PS-18", "Incident Reporting",
        "Where the operator is an essential or important entity under NIS2, does the agent support significant-incident reporting to the CSIRT or competent authority: an early warning within 24 hours, an incident notification within 72 hours and a final report within one month (NIS2 Art. 23(4))?",
        "EU NIS2 Art. 23(4)",
        "Incidents affecting vehicle, network or backend systems are handled with no reporting clock.",
        "Incidents are timestamped, but significance assessment and the 24-hour, 72-hour and one-month deadlines are tracked by hand.",
        "Significance is assessed against documented criteria, and each of the three submissions is drafted from incident evidence and tracked to submission with timestamps.",
        12)],
    "freight-3pl-warehouse": [],
}


def fix_ps17(question):
    """Refuter sourcesNotConfirmed[0]: point 2.3 ('annual in-service report') was not found in the OJ text."""
    out = dict(question)
    out["text"] = out["text"].replace(
        ", reporting of short-term occurrences within one month, and the annual in-service report (Annex III Part 5 §2.1-2.3)?",
        " and reporting of short-term occurrences within one month (Annex III Part 5 points 2.1-2.2)?")
    out["l5"] = out["l5"].replace(", and the annual report is generated from retained data.", ", and each record is retained with the data it relied on.")
    assert out["text"] != question["text"] and out["l5"] != question["l5"], "PS-17 fix did not apply"
    return out


log = []
final = {}
for pack_id, head_qs in head.items():
    head_by_id = {x["id"]: x for x in head_qs}
    pack_rows = [r for r in rows if r["packId"] == pack_id]
    seen = {r["questionId"] for r in pack_rows if r["action"] != "add"}
    out = []
    for r in pack_rows:
        qid, action = r["questionId"], r["action"]
        if action in ("merge", "drop"):
            log.append(dict(pack=pack_id, id=qid, action=action, into=r.get("mergedInto"), applied=True))
            continue
        f = {k: r["final"][k] for k in FIELDS}
        new_id = RENAME.get(qid, qid) if action == "add" else qid
        item = {"id": new_id, **f}
        note = None
        if action == "keep":
            drift = [k for k in FIELDS if head_by_id[qid][k] != f[k]]
            note = f"drift vs HEAD: {drift}" if drift else "equal to HEAD"
        if new_id == "MOB-PS-17":
            item = fix_ps17(item)
            note = "renumbered; point 2.3 claim removed (not in OJ text)"
        if new_id in OVERRIDES:
            item = OVERRIDES[new_id]
            note = (note + "; " if note else "") + "narrowed to one instrument; second half added as a new question"
        if action == "add" and new_id != qid:
            note = (note + "; " if note else "") + f"renumbered from {qid} (S3 holds {qid})"
        if qid in REPLACED_S3 and action == "add":
            note = "merged with S3's MOB-PS-15 (same CRA Art. 14 obligation); author's text kept"
        out.append(item)
        log.append(dict(pack=pack_id, id=qid, finalId=new_id, action=action, applied=True, note=note))
    for x in head_qs:  # S3 questions the author never saw
        if x["id"] in seen:
            continue
        if x["id"] in REPLACED_S3:
            log.append(dict(pack=pack_id, id=x["id"], action="s3-merged", applied=True, note="replaced by the author's CRA Art. 14 text under the same id"))
            continue
        out.append(x)
        log.append(dict(pack=pack_id, id=x["id"], action="s3-keep", applied=True, note="S3 question committed after the author's snapshot; kept unchanged"))
    for x in ADDED[pack_id]:
        out.append(x)
        log.append(dict(pack=pack_id, id=x["id"], action="floor-add", applied=True))
    out.sort(key=lambda x: int(x["id"].rsplit("-", 1)[1]))
    ids = [x["id"] for x in out]
    assert len(ids) == len(set(ids)), (pack_id, ids)
    final[pack_id] = out

src = STATION.read_text()
for pack_id, qs in final.items():
    start = src.index(f'  id: "{pack_id}",')
    open_at = src.index("  questions: [\n", start) + len("  questions: [\n")
    close_at = src.index("\n  ]\n};", open_at)
    body = "\n".join(
        "    q(" + ", ".join(json.dumps(x[k], ensure_ascii=False) for k in ("id",) + FIELDS) + "),"
        for x in qs)
    src = src[:open_at] + body + src[close_at:]
STATION.write_text(src)
(HERE / "apply-log.json").write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n")
print({k: len(v) for k, v in final.items()})
