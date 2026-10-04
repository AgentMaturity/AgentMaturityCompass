"""Mutation checks for the wealth apply. Run from the repo root: python3 <this file>
Each mutation breaks one guard, runs the named test files (expect RED), restores the file
byte-for-byte and re-runs them (expect GREEN). Writes mutations.json next to this file."""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
SOX = "src/assurance/packs/financialSOXPack.ts"
WLT = "src/assurance/packs/wealthManagementMiFIDPack.ts"
DEEP = "src/domains/deep/wealth.ts"
STATION = "src/domains/packs/stations/wealth.ts"
FAIL_CLOSED = "tests/assurance/industryPackFailClosed.test.ts"
SOX_T = "tests/financialSOXPack.test.ts"
WLT_T = "tests/wealthManagementMiFIDPack.test.ts"

MUTATIONS = [
    ("SOX fail-closed: bypass gradeIndustryEvidence so an empty reply is graded directly", SOX,
     "validate: (response: string) => gradeIndustryEvidence(response, (text) => validateSOXResponse(text, seed.requires))",
     "validate: (response: string) => validateSOXResponse(response, seed.requires)", [FAIL_CLOSED]),
    ("MiFID fail-closed: bypass gradeIndustryEvidence so an empty reply is graded directly", WLT,
     "gradeIndustryEvidence(response, (text) => validateWealthResponse(text, seed.requires, seed.mustNot ?? []))",
     "validateWealthResponse(response, seed.requires, seed.mustNot ?? [])", [FAIL_CLOSED]),
    ("SOX refusal guard: REFUSAL matches everything", SOX,
     "const REFUSAL = /", "const REFUSAL = /|", [SOX_T]),
    ("SOX performed guard: PERFORMED never matches", SOX,
     "const PERFORMED = /", "const PERFORMED = /(?!)", [SOX_T]),
    ("SOX scenario control guard: requires ignored", SOX,
     "for (const [auditType, pattern, reason] of requires) {", "for (const [auditType, pattern, reason] of requires.slice(1)) {", [SOX_T]),
    ("MiFID refusal guard: REFUSAL matches everything", WLT,
     "const REFUSAL = /", "const REFUSAL = /|", [WLT_T]),
    ("MiFID performed guard: PERFORMED never matches", WLT,
     "const PERFORMED = /", "const PERFORMED = /(?!)", [WLT_T]),
    ("MiFID scenario control guard: requires ignored", WLT,
     "for (const [auditType, pattern, reason] of requires) {", "for (const [auditType, pattern, reason] of requires.slice(1)) {", [WLT_T]),
    ("MiFID mustNot guard: kill-switch refusal of the safe action ignored", WLT,
     "for (const [auditType, pattern, reason] of mustNot) {", "for (const [auditType, pattern, reason] of mustNot.slice(1)) {", [WLT_T]),
    ("Deep host guard: a deep source moved to ecfr.gov (outside the deep test host list)", DEEP,
     "https://www.govinfo.gov/content/pkg/CFR-2026-title12-vol8/xml/CFR-2026-title12-vol8-sec1002-9.xml",
     "https://www.ecfr.gov/current/title-12/section-1002.9", ["tests/deepIndustryPacksStations.test.ts"]),
    ("Pack floor: drop one wealth question (blockchain to 14)", STATION,
     '    q("WLT-BC-18", ', '    // q("WLT-BC-18", ', ["tests/industryPackDepthFloor.test.ts"]),
]


def run(tests):
    proc = subprocess.run(["npx", "vitest", "run", *tests], capture_output=True, text=True)
    tail = [l.strip() for l in proc.stdout.splitlines() if l.strip().startswith(("Tests", "Test Files"))]
    return proc.returncode, " | ".join(tail)


def main():
    results = []
    for name, path, old, new, tests in MUTATIONS:
        p = Path(path)
        original = p.read_bytes()
        text = original.decode()
        assert text.count(old) >= 1, f"{name}: anchor not found"
        p.write_text(text.replace(old, new, 1))
        try:
            red_code, red = run(tests)
        finally:
            p.write_bytes(original)
        green_code, green = run(tests)
        results.append({"guard": name, "file": path, "mutation": f"{old!r} -> {new!r}", "tests": tests,
                        "red": f"exit {red_code}: {red}", "restoredGreen": f"exit {green_code}: {green}",
                        "ok": red_code != 0 and green_code == 0})
        print(name, "RED" if red_code else "SURVIVED", "/", "GREEN" if green_code == 0 else "NOT GREEN")
    (HERE / "mutations.json").write_text(json.dumps(results, indent=1) + "\n")


if __name__ == "__main__":
    main()
