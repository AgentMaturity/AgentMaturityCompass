"""Break each guard, run its focused test (expect RED), restore, re-run (expect GREEN). Writes mutations.json."""
import json, os, re, subprocess, sys

ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
CONTROLS = "tests/frameworksControls.test.ts"
ALIASES = "tests/packFrameworkAliases.test.ts"

MUTATIONS = [
    ("alias eu-dora -> DORA", "src/compliance/frameworks/aliases.ts", '"eu-dora": "DORA", ', "", ALIASES),
    ("schema: paraphrase cannot be verified", "src/compliance/mappingSchema.ts",
     '.refine((row) => row.textKind !== "paraphrase" || !row.verified,', '.refine((row) => true || !row.verified,', CONTROLS),
    ("schema: unverified control must say why", "src/compliance/mappingSchema.ts",
     ".refine((row) => row.verified || row.unverifiedReason !== undefined,", ".refine((row) => true || row.unverifiedReason !== undefined,", CONTROLS),
    ("mapping id exists", "src/compliance/frameworks/controls/dora.ts", '"mappingId": "dora_art5_governance"', '"mappingId": "dora_art5_governance_x"', CONTROLS),
    ("category is a family category", "src/compliance/frameworks/controls/dora.ts",
     '"category": "Art. 5 Governance and organisation"', '"category": "Art. 5 Governance"', CONTROLS),
    ("official publisher host", "src/compliance/frameworks/controls/nis2.ts", "https://eur-lex.europa.eu/", "https://eur-lex.example.org/", CONTROLS),
    ("framework without a verified control", "src/compliance/frameworks/controls/dora.ts",
     '"controlId": "RTS-2025/1190", "framework": "DORA"', '"controlId": "RTS-2025/1190", "framework": "KR_AI_BASIC_ACT"', CONTROLS),
    ("ISO 42005 descoped", "src/compliance/frameworks/controls/dora.ts",
     '"title": "Internal governance and control framework for ICT risk"', '"title": "Internal governance (ISO/IEC 42005) for ICT risk"', CONTROLS),
    ("HIPAA rows marked proposed", "src/compliance/frameworks/controls/hhsHti1Hipaa.ts", '"status": "proposed"', '"status": "law"', CONTROLS),
    ("per-framework counts pinned", "src/compliance/frameworks/controls.ts", "  ...usStateAiLawControls,\n", "", CONTROLS),
]


def run(test):
    proc = subprocess.run(["npx", "vitest", "run", test], cwd=ROOT, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    summary = re.search(r"Tests\s+([^\n]+)", out)
    return proc.returncode, (summary.group(1).strip() if summary else out[-300:])


results = []
for name, path, old, new, test in MUTATIONS:
    full = f"{ROOT}/{path}"
    original = open(full).read()
    count = original.count(old)
    assert count >= 1, f"{name}: pattern not found in {path}"
    open(full, "w").write(original.replace(old, new, 1))
    try:
        red_rc, red = run(test)
    finally:
        open(full, "w").write(original)
    green_rc, green = run(test)
    results.append({"guard": name, "mutation": f"{path}: replace first {old!r} with {new!r}", "test": test,
                    "red": f"exit {red_rc}: {red}", "restoredGreen": f"exit {green_rc}: {green}",
                    "ok": red_rc != 0 and green_rc == 0})
    print(json.dumps(results[-1]))
json.dump(results, open(f"{HERE}/mutations.json", "w"), indent=2)
sys.exit(0 if all(r["ok"] for r in results) else 1)
