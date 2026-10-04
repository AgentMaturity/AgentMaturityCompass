"""Apply the round-2 framework mappings as clause-level controls.

Reads (read-only) round2/frameworks/<fw>/mapping.json from the root checkout and the built-in
mapping ids from the worktree's src/compliance/builtInMappings.ts; writes
src/compliance/frameworks/controls/<file>.ts and counts.json next to this script.

Usage: python3 gen-controls.py <worktree-root>
Binding refuter fixes applied here are listed in FIXES and echoed into counts.json.
"""
import hashlib, json, os, re, sys
from collections import Counter

ROUND2 = "/Users/sid/AgentMaturityCompass/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/frameworks"
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
FRAMEWORKS = set(re.findall(r'"([A-Z0-9_]+)"', open(f"{ROOT}/src/compliance/frameworks.ts").read().split("export interface")[0]))
REGISTRY = open(f"{ROOT}/src/compliance/builtInMappings.ts").read()
MAPPING_FRAMEWORK = dict(re.findall(r'id: "([^"]+)",\s*framework: "([A-Z0-9_]+)"', REGISTRY))

# (input dir, output file, export name, status of the text by framework)
INPUTS = [
    ("dora", "dora.ts", "doraControls", {"DORA": "law"}),
    ("nis2", "nis2.ts", "nis2Controls", {"NIS2": "law"}),
    ("nist-ai-600-1", "nistAi600_1.ts", "nistAi600_1Controls", {"NIST_AI_600_1": "guidance", "NIST_AI_RMF": "guidance"}),
    ("us-state-ai-laws", "usStateAiLaws.ts", "usStateAiLawControls", {"CO_AI_ACT": "law", "TX_TRAIGA": "law", "CA_AI_LAWS": "law"}),
    # HIPAA rows quote the Security Rule NPRM (90 FR 898): a proposed rule, not in force.
    ("hhs-onc-fda", "hhsHti1Hipaa.ts", "hhsHti1HipaaControls", {"HHS_HTI_1": "law", "HIPAA": "proposed"}),
]

FIXES = {
    "dora": [
        "coverage 'supporting' redefined (mappingSchema.ts frameworkControlSchema comment) to cover same-framework mappings written for another clause; counts split into other-framework-only vs same-framework-supporting (refuter fix 1)",
        "amcControls line refs, S3/S6 commit pins and gap strings are not carried; mapping ids are checked against this HEAD by tests/frameworksControls.test.ts (refuter fixes 3-5)",
        "RTS-2025/1190 paraphrase set verified:false with its reason (paraphrase cannot be string-checked; HHS refuter convention)",
        "calendar not carried, so the CDR 2024/1502 Art. 7 application-date and CDR 2024/1505 source fixes (2, 6) have no registry text to correct; recorded in docs/COMPLIANCE_MAPS.md",
    ],
    "nis2": [
        "IR rows carry only the EUR-Lex OJ PDF they were read from; the truncated cellar XHTML is dropped (refuter fix 3)",
        "obligations-for-agents.json not applied (OBL-16/17/19 and mapsTo fixes have no registry target)",
    ],
    "nist-ai-600-1": [
        "'uncommitted-s6' statuses, S6 pins and counts labels are not carried; every mapping id is checked against this HEAD (refuter fixes 2-3)",
        "textExtraction 'raw' pinpoints and the EO 14434 row are not carried (refuter fixes 1, 4)",
        "rows roll up as the author declared: risk rows -> NIST_AI_600_1 risk categories, subcategory rows -> NIST_AI_RMF functions",
        "coverage 'indirect' -> 'supporting' (same definition: adjacent signal only)",
    ],
    "us-state-ai-laws": [
        "NYC_LL144 (4 rows) and IL_HRA_AI (2 rows) not applied: neither is a framework id; IL has no verified row; a new family needs tests/frameworkBreadth.test.ts, outside this run's write scope",
        "the IL-AIPA alias and NYC rule title fixes therefore have no registry target",
        "coverage 'indirect' -> 'supporting'",
    ],
    "hhs-onc-fda": [
        "same-framework 'supporting' rows kept under the amended definition (refuter fix 1, option b)",
        "trailing ' [..]' dropped from HTI1-170.315(b)(11)(v)(A) (refuter fix 4)",
        "FDA rows (13) not applied: no FDA framework id",
        "HIPAA rows carry status 'proposed' (Security Rule NPRM, 90 FR 898)",
        "obligations-for-agents.json not applied",
    ],
}


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def text_of(row):
    text = row.get("officialText") or row.get("paraphrase")
    if row["controlId"] == "HTI1-170.315(b)(11)(v)(A)":
        text = re.sub(r"\s*\[\.\.\]\s*$", "", text)
    return text


def convert(name, row, statuses):
    framework = row.get("s6Framework") or row.get("framework")
    if framework not in statuses:
        return None, f"{row['controlId']}: framework {framework!r} is not applied from {name}"
    assert framework in FRAMEWORKS, framework
    verified = bool(row["verified"])
    reason = None
    if row["textKind"] == "paraphrase":
        verified = False
        reason = "paraphrase; cannot be string-checked against the source. " + (row.get("verificationNote") or row.get("textNote") or "")
    elif not verified:
        reason = row.get("verificationNote") or row.get("textNote")
    mappings = []
    for m in row["amcControls"]:
        mid = m["mappingId"]
        if mid not in MAPPING_FRAMEWORK:
            raise SystemExit(f"{name} {row['controlId']}: mapping {mid} is not in builtInMappings.ts")
        mappings.append({"mappingId": mid, "coverage": "partial" if m["coverage"] == "partial" else "supporting"})
    out = {
        "controlId": row["controlId"],
        "framework": framework,
        "category": row.get("category") or row.get("s6Category"),
        "title": row["title"],
        "text": text_of(row),
        "textKind": row["textKind"],
        "status": statuses[framework],
        "sourceUrl": row["sourceUrl"],
        "retrievedAt": row["retrievedAt"],
        "verified": verified,
    }
    if reason:
        out["unverifiedReason"] = reason.strip()
    out["mappings"] = mappings
    return out, None


def counts_for(rows):
    by = {}
    for fw in sorted({r["framework"] for r in rows}):
        rs = [r for r in rows if r["framework"] == fw]
        mapped = [r for r in rs if r["mappings"]]
        with_partial = [r for r in mapped if any(m["coverage"] == "partial" for m in r["mappings"])]
        supporting_only = [r for r in mapped if r not in with_partial]
        same_fw = [r for r in supporting_only if any(MAPPING_FRAMEWORK[m["mappingId"]] == fw for m in r["mappings"])]
        by[fw] = {
            "controls": len(rs), "mapped": len(mapped), "unmapped": len(rs) - len(mapped),
            "mappedWithPartial": len(with_partial),
            "supportingOnlyWithSameFrameworkMapping": len(same_fw),
            "supportingOnlyOtherFrameworksOnly": len(supporting_only) - len(same_fw),
            "verified": sum(r["verified"] for r in rs), "unverified": sum(not r["verified"] for r in rs),
            "textKind": dict(Counter(r["textKind"] for r in rs)),
            "distinctMappingIds": len({m["mappingId"] for r in rs for m in r["mappings"]}),
        }
    return by


def main():
    report = {"inputs": {}, "skipped": {}, "fixes": FIXES, "byFramework": {}, "files": {}}
    all_rows = []
    for name, out_file, export, statuses in INPUTS:
        path = f"{ROUND2}/{name}/mapping.json"
        report["inputs"][name] = {"mappingJsonSha256": sha256(path), "reviewJsonSha256": sha256(f"{ROUND2}/{name}/review.json")}
        rows, skipped = [], []
        for row in json.load(open(path))["controls"]:
            converted, why = convert(name, row, statuses)
            (rows.append(converted) if converted else skipped.append(why))
        report["skipped"][name] = skipped
        all_rows += rows
        lines = [
            f"// Applied from AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/frameworks/{name}/mapping.json",
            "// by apply/frameworks/gen-controls.py (2026-10-04). Change the generator and re-run it; do not hand-edit rows.",
            'import type { FrameworkControl } from "../../mappingSchema.js";',
            "",
            f"export const {export}: FrameworkControl[] = [",
            *[f"  {json.dumps(r, ensure_ascii=False)}," for r in rows],
            "];",
            "",
        ]
        target = f"{ROOT}/src/compliance/frameworks/controls/{out_file}"
        open(target, "w").write("\n".join(lines))
        report["files"][out_file] = {"rows": len(rows), "lines": len(lines)}
    report["byFramework"] = counts_for(all_rows)
    report["total"] = {"controls": len(all_rows), "verified": sum(r["verified"] for r in all_rows), "mapped": sum(bool(r["mappings"]) for r in all_rows)}
    json.dump(report, open(f"{HERE}/counts.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"byFramework": report["byFramework"], "total": report["total"], "skipped": {k: len(v) for k, v in report["skipped"].items()}}, indent=1))


main()
