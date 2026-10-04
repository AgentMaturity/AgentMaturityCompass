"""Appends the 8 round-2 health deep questions (renumbered 51-58, re-sourced on govinfo/europa.eu) to deep/health.ts."""
import json

D = "/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/health-apply/"
TS = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-2/src/domains/deep/health.ts"
R2 = "round-2 author and refuter (round2/content/health/review.json, 2026-10-04)"

SOURCES = {
    "healthcare-deep-01": {
        "title": "Federal Register 89 FR 7496 (FR Doc. 2024-01709), Medical Devices; Quality System Regulation Amendments, final rule",
        "url": "https://www.govinfo.gov/content/pkg/FR-2024-02-02/html/2024-01709.htm",
        "verified": True,
        "note": f"Effective date (2 February 2026) and incorporation of ISO 13485 by reference read on govinfo; the current §820.10 and §820.35 headings were read on the eCFR structure by the {R2}. ISO 13485 clause text not read (paywalled).",
    },
    "healthcare-deep-02": {
        "title": "21 CFR §11.10 Controls for closed systems, (e) audit trails (CFR 2025 edition)",
        "url": "https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol1/xml/CFR-2025-title21-vol1-sec11-10.xml",
        "verified": True,
    },
    "healthcare-deep-03": {
        "title": "45 CFR §92.210 Nondiscrimination in the use of patient care decision support tools, (b) and (c) (CFR 2024 edition)",
        "url": "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol1/xml/CFR-2024-title45-vol1-sec92-210.xml",
        "verified": True,
    },
    "healthcare-deep-06": {
        "title": "Federal Register 89 FR 8758 (FR Doc. 2024-00895), CMS Interoperability and Prior Authorization final rule (CMS-0057-F)",
        "url": "https://www.govinfo.gov/content/pkg/FR-2024-02-08/html/2024-00895.htm",
        "verified": True,
        "note": "Read on govinfo: specific reason for denial; 72-hour expedited and 7-calendar-day standard decision timeframes with 2026 compliance dates; the prior authorization policies do not apply to drugs of any type.",
    },
    "healthcare-deep-07": {
        "title": "European Medicines Agency, ICH E6 Good clinical practice - scientific guideline (E6(R3) Principles and Annex 1, effective 23 July 2025)",
        "url": "https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline",
        "verified": True,
        "note": f"Current version and EU effective dates read on the EMA page; the Annex 1 headings 4.2.2, 4.2.4 and 4.3 were read in the ICH Step 4 PDF by the {R2}. The EMA PDF did not render to text in this run.",
    },
    "healthcare-deep-08": {
        "title": "45 CFR §170.315(b)(11)(vi) Intervention risk management (CFR 2024 edition, revised as of 2024-10-01)",
        "url": "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec170-315.xml",
        "verified": True,
        "note": "(b)(11)(vi) text read on govinfo; HTI-5 (90 FR 60970) proposes removing it and is not final (Federal Register API, read by the round-2 author 2026-10-04).",
    },
}

# refuter fix 9 applied consistently: CMS-0057-F does not require clinician review of every adverse determination
DEEP06_CRITERIA = ["Specific denial reason on every denial", "Decision clock per request type", "Drug requests separated from items and services", "Decision notice sent to the provider for every decision"]
DEEP06_EVIDENCE = ["denial_notice_sample", "decision_time_report", "request_type_mapping", "provider_notice_log"]

KEYS = ["id", "industry", "station", "packIds", "regulation", "section", "question", "evaluationCriteria", "levels", "evidenceTypes", "source"]


def lit(v):
    return json.dumps(v, ensure_ascii=False)


def main():
    d = json.load(open(D + "deep-questions.json"))
    out, renum = [], {}
    for i, q in enumerate(d["questions"]):
        old = q["id"]
        q = {k: q[k] for k in KEYS}  # drops packLinks (not in DeepIndustryQuestion)
        q["id"] = f"healthcare-deep-{51 + i}"
        renum[old] = q["id"]
        src = dict(SOURCES.get(old, q["source"]))
        src["retrievedAt"] = "2026-10-04"
        q["source"] = {k: src[k] for k in ["title", "url", "retrievedAt", "verified", "note"] if k in src}
        if old == "healthcare-deep-06":
            q["evaluationCriteria"], q["evidenceTypes"] = DEEP06_CRITERIA, DEEP06_EVIDENCE
        q["levels"] = {int(k): v for k, v in q["levels"].items()}
        lines = ["  {"]
        for k in KEYS:
            v = q[k]
            if k == "levels":
                v = "{ " + ", ".join(f"{n}: {lit(t)}" for n, t in v.items()) + " }"
            elif k == "source":
                v = "{ " + ", ".join(f"{sk}: {lit(sv)}" for sk, sv in v.items()) + " }"
            else:
                v = lit(v)
            lines.append(f"    {k}: {v},")
        lines.append("  },")
        out.append("\n".join(lines))
    src = open(TS).read()
    marker = "\n];\n"
    assert src.endswith(marker)
    header = "  // Round 2 (2026-10-04): non-HIPAA health controls, numbered after the generated healthcare-hipaa-deep-04..50.\n"
    src = src[: -len(marker)] + "\n" + header + "\n".join(out) + marker
    open(TS, "w").write(src)
    json.dump(renum, open(D + "deep-renumbering.json", "w"), indent=1)
    print(renum)


main()
