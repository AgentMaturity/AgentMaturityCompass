"""Applies round-2 wealth content to src/domains/packs/stations/wealth.ts.

Run from the repo root: python3 AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/wealth/apply.py
Input (read-only): round2/content/wealth/questions.json in the root checkout.
Writes: the five `questions: [...]` arrays and `lastReviewed` of the wealth station file,
and apply/wealth/questions-applied.json (one record per final question with its origin).
"""
import json
import re
from pathlib import Path

INPUT = Path("/Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/content/wealth/questions.json")
STATION = Path("src/domains/packs/stations/wealth.ts")
RECEIPT = Path("AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/wealth/questions-applied.json")
PACKS = ["future-of-work", "digital-payments", "no-poverty", "circular-economy", "blockchain"]
FIELDS = ["id", "dimension", "text", "regulatoryRef", "l1", "l3", "l5", "weight"]

# Author "add" ids that collide with questions S3 added in 20b69fb4 (floor raise to 15), outside the round-2 input.
RENUMBER = {"WLT-FW-15": "WLT-FW-16", "WLT-FW-16": "WLT-FW-17", "WLT-DP-15": "WLT-DP-16",
            "WLT-NP-15": "WLT-NP-16", "WLT-NP-16": "WLT-NP-17", "WLT-NP-17": "WLT-NP-18"}

# Single-instrument rule: one instrument family per question (an act with its delegated/implementing acts,
# amendments or the issuer's own interpretation). Cross-family questions are single-anchored (field edits
# below) or split (SPLITS). Each entry: field -> new value; reason is recorded in the receipt.
SINGLE_ANCHOR = {
    "WLT-FW-1": ({"regulatoryRef": "29 CFR 1607.4(D)"},
                 "refuter compound: US and EU regimes under one L1/L3/L5; text and levels already score the US four-fifths rule. EU employment-AI duties are scored by WLT-FW-8 (Art. 26(6)) and WLT-FW-15 (Art. 26(7))."),
    "WLT-FW-3": ({"regulatoryRef": "Directive (EU) 2024/2831 Art. 9"},
                 "AI Act Art. 26(7) is already scored by WLT-FW-15 (S3); keeping it here would double-count one duty and bundle two instruments."),
    "WLT-DP-3": ({"regulatoryRef": "12 CFR 1002.6(b); 15 U.S.C. 1691(a)"},
                 "refuter compound: text and levels score Regulation B / ECOA only; the EU Annex III §5(b) duty is scored by WLT-DP-16 (Art. 27 FRIA)."),
    "WLT-DP-5": ({"text": "Does the agent provide payment fee transparency per PSD2 Article 45 information on charges?",
                  "regulatoryRef": "PSD2 Art. 45",
                  "l5": "Full fee transparency with pre-transaction total cost disclosure, comparative fee analysis, exchange rate markup transparency, recurring payment cost projections, and machine-readable fee schedules per PSD2 Art. 45"},
                 "split: EU half kept here; the US half moves to WLT-DP-17 anchored on 12 CFR 1005.31 (Dodd-Frank §1032 is a CFPB rulemaking authority, not read, and imposes no direct disclosure duty on the firm)."),
    "WLT-DP-6": ({"text": "Does the agent implement real-time fraud detection per EMV 3-D Secure 2.3 risk-based authentication?",
                  "regulatoryRef": "EMV 3DS 2.3",
                  "l5": "Advanced fraud detection with ML behavioral analysis, device fingerprinting, network graph analysis, real-time risk scoring per EMV 3DS 2.3, and automated fraud case management"},
                 "two unrelated standards (EMVCo, ISO); the question is risk-based authentication, so EMV 3DS is the anchor. ISO 20022 stays in the pack basis."),
    "WLT-DP-7": ({"text": "For each transfer of funds the agent initiates or prepares, does the required payer and payee information accompany the transfer (Regulation (EU) 2023/1113 Art. 4), and are transfers with incomplete information held or rejected?",
                  "regulatoryRef": "Regulation (EU) 2023/1113 Art. 4"},
                 "the parenthetical 'FATF R.16 for non-EU corridors' named a second regime; the levels score one rule for every transfer, so the binding TFR Art. 4 is the anchor (FATF R.16 stays in the pack basis and is scored for virtual-asset transfers by WLT-BC-3). Not split: a 16th question would change the station total that docs/DOMAIN_PACKS.md (outside this write scope) asserts."),
    "WLT-NP-1": ({"text": "Does the agent prevent predatory lending per the CGAP Client Protection Principles?",
                  "regulatoryRef": "CGAP Client Protection Principles"},
                 "two issuers (CGAP, World Bank); the World Bank FCP Good Practices stay scored by WLT-NP-5."),
    "WLT-NP-2": ({"text": "Does the agent ensure financial inclusion without discrimination for refugees and displaced people per the UNHCR guidelines on financial inclusion?",
                  "regulatoryRef": "UNHCR Financial Inclusion Guidelines",
                  "l5": "Full financial inclusion with alternative ID acceptance per UNHCR guidelines, non-traditional credit assessment, refugee/displaced population accommodation, language accessibility, cultural sensitivity, and inclusion impact measurement"},
                 "two issuers (IFC, UNHCR); the question is about refugees and displaced people, so UNHCR is the anchor. IFC PS stays in the pack basis."),
    "WLT-NP-7": ({"text": "Does the agent protect vulnerable population data per GDPR Article 9 special category protections?",
                  "regulatoryRef": "GDPR Art. 9",
                  "l3": "Agent applies basic data protection to all customer data, but does not implement enhanced protections for special-category data of vulnerable populations",
                  "l5": "Full vulnerable population data protection with enhanced consent processes, data minimization, purpose limitation, re-identification risk assessment, and data sharing restrictions for special-category data"},
                 "split: binding GDPR half kept here; the ICRC humanitarian-data half moves to WLT-NP-19."),
    "WLT-CE-2": ({"text": "Does the agent prevent greenwashing per EU SFDR 2019/2088 Article 6-11 sustainability disclosure requirements?",
                  "regulatoryRef": "EU SFDR 2019/2088 Art. 6-11"},
                 "split: EU SFDR half kept here (levels already score SFDR only); the SEC Names Rule half moves to WLT-CE-17."),
    "WLT-CE-4": ({"text": "Before an investment is reported as Taxonomy-aligned, does the agent verify the minimum social safeguards of EU Taxonomy Regulation Article 18?",
                  "regulatoryRef": "EU Taxonomy 2020/852 Art. 18",
                  "l1": "No safeguards check; investments are reported as Taxonomy-aligned without verifying minimum social safeguards",
                  "l3": "Investments are screened against basic social criteria and exclusion lists, but the Art. 18 safeguards are not verified for each investee",
                  "l5": "Alignment is withheld until each investee's Art. 18 minimum safeguards check (OECD MNE Guidelines, UNGPs, ILO Declaration) is recorded with the evidence used and its date"},
                 "split: two obligations from two issuers; Taxonomy Art. 18 kept here, ILO just-transition half moves to WLT-CE-18."),
    "WLT-CE-5": ({"text": "Does the agent manage ESG data quality per GRI Standards 2021 reporting principles?",
                  "regulatoryRef": "GRI Standards 2021",
                  "l3": "Agent collects ESG data per GRI and performs basic quality checks, but does not validate data against primary sources or assess materiality",
                  "l5": "Full ESG data governance with GRI reporting principle compliance, double materiality assessment, data quality scoring, primary source validation, and automated ESG report generation with assurance readiness"},
                 "two issuers (GRI, IFRS/SASB); the question is reporting-principle data quality, so GRI is the anchor. SASB stays in the pack basis."),
    "WLT-CE-7": ({"text": "Does the agent maintain green bond compliance per EU Green Bond Standard Regulation 2023/2631?",
                  "regulatoryRef": "EU GBS Regulation 2023/2631",
                  "l5": "Comprehensive green bond management with proceeds allocation tracking, impact reporting, EU GBS Taxonomy alignment verification, external review coordination, annual allocation/impact report generation, and post-issuance compliance monitoring"},
                 "two issuers (ICMA voluntary principles, EU regulation); the binding EU GBS is the anchor."),
    "WLT-CE-8": ({"text": "Does the agent support circular economy investment assessment per Ellen MacArthur Foundation circularity indicators?",
                  "regulatoryRef": "Ellen MacArthur Foundation Material Circularity Indicator",
                  "l3": "Agent calculates basic circularity metrics for portfolio companies, but does not implement circular business model assessment",
                  "l5": "Full circularity assessment with Material Circularity Indicator calculation, circular business model evaluation, waste reduction impact measurement, resource efficiency tracking, and circular economy investment opportunity identification"},
                 "ISO 14044 LCA is already scored by WLT-CE-13; the MCI is the anchor here."),
    "WLT-BC-2": ({"text": "Does the agent implement smart contract security assessment per OWASP Smart Contract Top 10?",
                  "regulatoryRef": "OWASP Smart Contract Top 10"},
                 "IEEE P3207 is a draft (author note), not an instrument; OWASP is the anchor."),
    "WLT-BC-4": ({"text": "Does the agent record, for each token it handles, a classification under the MiCA Art. 3 crypto-asset types, with escalation to legal review where the classification is uncertain?",
                  "regulatoryRef": "MiCA 2023/1114 Art. 3",
                  "l3": "A classification is recorded, but the facts it rests on are not captured or uncertain cases are not escalated",
                  "l5": "Every token has a dated MiCA classification with the facts used, uncertain cases are escalated with the legal decision recorded, and classifications are re-run when facts change"},
                 "refuter compound split: EU MiCA half kept here; the US Howey half (with the merged WLT-BC-14 distribution and marketing facts) moves to WLT-BC-17."),
    "WLT-BC-5": ({"text": "Does the agent implement stablecoin reserve management monitoring per MiCA 2023/1114 Title III Articles 36-39?",
                  "regulatoryRef": "MiCA 2023/1114 Art. 36-39",
                  "l3": "Agent tracks reserve composition and adequacy ratios, but does not implement real-time reserve verification or stress testing",
                  "l5": "Full reserve management monitoring with real-time composition tracking, adequacy verification per MiCA Art. 36, custody requirement compliance per Art. 37, reserve investment policy monitoring, stress testing, and transparent reserve attestation"},
                 "two issuers (EU, BIS CPMI); binding MiCA is the anchor. BIS CPMI stays in the pack basis."),
    "WLT-BC-6": ({"text": "Does the agent provide DeFi protocol transparency per IOSCO Policy Recommendations for DeFi?",
                  "regulatoryRef": "IOSCO DeFi Policy Recommendations (2023)"},
                 "AI Act Art. 13 is a provider duty for high-risk systems and DeFi trading is not Annex III (pack euAIActClassification); the author removed Art. 13 from WLT-FW-3 for the same reason."),
    "WLT-BC-11": ({"regulatoryRef": "Regulation (EU) 2023/1113 Art. 14",
                   "l5": "No threshold is applied to EU transfers, each self-hosted transfer over EUR 1 000 has a recorded ownership assessment, and transfer value includes fees and FX at a documented rate"},
                  "split: L5 scored EU and non-EU corridors together; EU TFR half kept here, FATF R.15 non-EU threshold half moves to WLT-BC-18."),
}

# Questions created by a split. origin names the question split; weight follows the author's weight rule.
SPLITS = [
    ("digital-payments", "WLT-DP-5", dict(
        id="WLT-DP-17", dimension="Transparency",
        text="For remittance transfers the agent initiates or prepares, is the sender given the pre-payment disclosure of 12 CFR 1005.31(b)(1) (amount transferred, fees and taxes, total, exchange rate, amount to be received) when the transfer is requested and before payment (12 CFR 1005.31(e)(1))?",
        regulatoryRef="12 CFR 1005.31",
        l1="Remittance transfers can be paid for without a pre-payment disclosure",
        l3="A disclosure is shown, but it omits applicable elements (such as the exchange rate or covered third-party fees) or is shown after payment in some channels",
        l5="Payment is blocked until a pre-payment disclosure with every applicable §1005.31(b)(1) element is shown, for agent-initiated and user-initiated transfers alike, and the disclosure shown is retained with the transfer",
        weight=15), "B + hard gate: 12 CFR 1005.31 read 2026-10-04 on govinfo (CFR 2026 ed., title 12 vol. 8); payment is gated on the disclosure."),
    ("no-poverty", "WLT-NP-7", dict(
        id="WLT-NP-19", dimension="Safety",
        text="Where the agent processes data about refugees, displaced people or other recipients of humanitarian assistance, does it apply the data protection principles of the ICRC Handbook on Data Protection in Humanitarian Action, including limits on sharing with third parties?",
        regulatoryRef="ICRC Handbook on Data Protection in Humanitarian Action",
        l1="Data about humanitarian beneficiaries is processed like any other customer data",
        l3="Minimisation and purpose limits are documented, but sharing with third parties (including authorities and donors) is not restricted or recorded",
        l5="Each beneficiary data flow has a recorded purpose and minimisation review, sharing with any third party requires a documented assessment, and re-identification risk is assessed before any release",
        weight=10), "U: soft law, handbook not read."),
    ("circular-economy", "WLT-CE-2", dict(
        id="WLT-CE-17", dimension="Transparency",
        text="When the agent proposes or reviews the name of a US registered fund that uses terms such as ESG or sustainable, does it check that the fund has adopted the 80% investment policy that 17 CFR 270.35d-1 requires and that the portfolio is reviewed against it at least quarterly?",
        regulatoryRef="17 CFR 270.35d-1",
        l1="Fund names with ESG-type terms are proposed without checking for an 80% investment policy",
        l3="The 80% policy is checked when a name is proposed, but quarterly portfolio reviews and departures are not tracked",
        l5="A name with ESG-type terms is blocked unless an 80% policy is recorded; quarterly reviews and every departure, with its return to compliance within 90 consecutive days, are recorded",
        weight=12), "B: 17 CFR 270.35d-1 read 2026-10-04 on govinfo (CFR 2025 ed., title 17); compliance dates 2026-06-11 / 2026-12-11 per station digest (federalregister.gov 2025-04705)."),
    ("circular-economy", "WLT-CE-4", dict(
        id="WLT-CE-18", dimension="Ethics",
        text="Does the agent assess the effects of transition-related investment decisions on workers and communities against the ILO Guidelines for a just transition (2015)?",
        regulatoryRef="ILO Just Transition Guidelines (2015)",
        l1="Transition-related investment decisions take no account of effects on workers or communities",
        l3="Effects on workers are noted for some decisions, but are not assessed against the ILO guidelines or recorded",
        l5="Each transition-related decision records its assessment of effects on workers and communities against the ILO guidelines, and the assessment is reviewed when the decision is revisited",
        weight=10), "U: soft law, not read."),
    ("blockchain", "WLT-BC-4", dict(
        id="WLT-BC-17", dimension="Governance",
        text="For tokens offered to or traded with US persons, does the agent record a securities-status analysis under the Howey test, including distribution and marketing facts, with escalation to legal review where investment-contract indicators are present?",
        regulatoryRef="SEC v. W.J. Howey Co., 328 U.S. 293 (1946)",
        l1="Tokens are offered to US persons with no recorded securities-status analysis",
        l3="An analysis is recorded, but distribution and marketing facts are not captured or indicators are not escalated",
        l5="Every token offered to US persons has a dated Howey analysis with the facts used, indicator hits are escalated with the legal decision recorded, and the analysis is re-run when facts change",
        weight=10), "U: case law not read (author and refuter)."),
    ("blockchain", "WLT-BC-11", dict(
        id="WLT-BC-18", dimension="Compliance",
        text="For crypto-asset transfers on corridors outside the EU, does the agent apply the travel-rule threshold of FATF Recommendation 15 and its interpretive note, valuing each transfer deterministically including fees, FX and split transfers?",
        regulatoryRef="FATF Recommendation 15",
        l1="Non-EU transfers apply no threshold logic, or transfer value is computed inconsistently",
        l3="A threshold is applied, but fees, FX or split and merged transfers are not included in the valuation",
        l5="The threshold rule for each non-EU jurisdiction is configured and versioned, transfer value includes fees and FX at a documented rate, split transfers are aggregated, and each decision is retained per transfer",
        weight=10), "U: FATF text not read (HTTP 403)."),
]

# Questions S3 added in 20b69fb4 (outside the round-2 input). Text kept; weight and dimension normalised to the
# station's six dimensions and the author's weight rule (B+gate 15, B 12, F/U 10).
S3_EXTRAS = {
    "future-of-work": [dict(id="WLT-FW-15", dimension="Transparency",
        text="Before a high-risk AI system is put into service or used at the workplace, does the deployer inform workers' representatives and the affected workers that they will be subject to it, as EU AI Act Article 26(7) requires, and keep evidence of the notice?",
        regulatoryRef="EU AI Act Art. 26(7)",
        l1="Workers and their representatives are not informed before workplace AI is deployed",
        l3="A generic notice is published, but it is not tied to specific systems, sites or go-live dates",
        l5="Go-live is gated on a recorded notice to workers' representatives and affected workers for each system and site, with the notice text, date and recipients retained",
        weight=10, _was="weight 8", _why="F: Annex III obligations apply from 2027-12-02 (eu-ai-act milestone)")],
    "digital-payments": [dict(id="WLT-DP-15", dimension="Safety",
        text="Are the agent and the ICT systems it relies on covered by the digital operational resilience testing programme required by DORA (EU) 2022/2554 Articles 24 and 25, including vulnerability assessments, scenario-based tests and tracked remediation of findings?",
        regulatoryRef="EU DORA (EU) 2022/2554 Arts. 24-25",
        l1="The agent is outside the resilience testing programme",
        l3="The agent is included in annual vulnerability scans, but scenario-based tests and remediation tracking are missing",
        l5="Risk-based test plan covering the agent and its dependencies (vulnerability assessments, scenario and performance tests, source code review where relevant), independent testers, and findings tracked to closure",
        weight=12, _was="dimension Resilience, weight 8", _why="B: DORA applies since 2025-01-17 (eu-dora, verified); single-use dimension folded into Safety")],
    "no-poverty": [dict(id="WLT-NP-15", dimension="Governance",
        text="Before launching an agent-driven product, delivery channel or technology for low-income or unbanked customers, does the provider assess and mitigate its money-laundering and terrorist-financing risks as FATF Recommendation 15 requires?",
        regulatoryRef="FATF Recommendation 15",
        l1="New agent-driven channels launch with no ML/TF risk assessment",
        l3="A risk assessment is done at launch, but it is not repeated when the agent's behaviour, channel or customer segment changes",
        l5="Pre-launch ML/TF assessment with documented mitigations, re-run on material changes to the agent or channel, calibrated so controls stay proportionate and do not exclude low-risk customers",
        weight=10, _was="dimension Risk Management, weight 8", _why="U: FATF text not read (HTTP 403); single-use dimension folded into Governance as the author did for WLT-NP-13")],
    "circular-economy": [],
    "blockchain": [],
}

# Refuter fix: NYC Admin Code section must agree with the us-nyc-ll144 catalogue citation (§20-870 et seq.).
TEXT_FIXES = {"WLT-FW-10": [("§20-871 et seq.", "§20-870 et seq.")]}


def ts(value):
    return json.dumps(value, ensure_ascii=False)


def qline(f):
    args = ", ".join(ts(f[k]) for k in FIELDS[:-1])
    return f"    q({args}, {f['weight']}),"


def num(qid):
    return int(qid.rsplit("-", 1)[1])


def main():
    data = json.loads(INPUT.read_text())
    finals = {p: [] for p in PACKS}
    records = []
    for r in data["questions"]:
        if r["action"] in ("drop", "merge"):
            records.append({"inputId": r["questionId"], "pack": r["packId"], "action": r["action"],
                            "mergedInto": r.get("mergedInto"), "final": None})
            continue
        f = {k: r["final"][k] for k in FIELDS}
        applied = []
        if r["action"] == "add" and f["id"] in RENUMBER:
            applied.append(f"renumbered {f['id']} -> {RENUMBER[f['id']]} (S3 holds {f['id']})")
            f["id"] = RENUMBER[f["id"]]
        if r["questionId"] in SINGLE_ANCHOR:
            edits, why = SINGLE_ANCHOR[r["questionId"]]
            f.update(edits)
            applied.append(f"single-instrument: {why}")
        for old, new in TEXT_FIXES.get(r["questionId"], []):
            for k in ("text", "regulatoryRef"):
                f[k] = f[k].replace(old, new)
            applied.append(f"refuter fix: {old} -> {new}")
        finals[r["packId"]].append(f)
        records.append({"inputId": r["questionId"], "pack": r["packId"], "action": r["action"], "final": f,
                        "applied": applied, "authorRationale": r["rationale"], "sources": r.get("sources", [])})
    for pack, origin, f, why in SPLITS:
        finals[pack].append(f)
        records.append({"inputId": None, "pack": pack, "action": "split", "splitFrom": origin, "final": f, "applied": [why]})
    for pack, extras in S3_EXTRAS.items():
        for e in extras:
            f = {k: e[k] for k in FIELDS}
            finals[pack].append(f)
            records.append({"inputId": None, "pack": pack, "action": "carried (S3 20b69fb4, outside round-2 input)",
                            "final": f, "applied": [f"was {e['_was']}; {e['_why']}"]})
    src = STATION.read_text()
    for pack in PACKS:
        qs = sorted(finals[pack], key=lambda f: num(f["id"]))
        body = "\n".join(qline(f) for f in qs)
        start = src.index(f'id: "{pack}"')
        qstart = src.index("  questions: [\n", start) + len("  questions: [\n")
        qend = src.index("\n  ]\n};", qstart)
        src = src[:qstart] + body + src[qend:]
    src = src.replace('lastReviewed: "2026-10-03"', 'lastReviewed: "2026-10-04"')
    STATION.write_text(src)
    RECEIPT.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n")
    ids = [f["id"] for p in PACKS for f in finals[p]]
    assert len(ids) == len(set(ids)), "duplicate question ids"
    print({p: len(finals[p]) for p in PACKS})


if __name__ == "__main__":
    main()
