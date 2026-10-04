"""Builds result.json from the measured files in this directory plus decisions.json.
Run from the repo root: python3 AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/build-result.py"""
import json
from collections import Counter
from pathlib import Path

H = Path(__file__).parent
before = json.load(open(H / "before.json"))
after = json.load(open(H / "after.json"))
log = json.load(open(H / "apply-log.json"))
mut = json.load(open(H / "mutations-assurance-result.json")) + json.load(open(H / "mutations-content-result.json"))
keys = ("n", "weightTotal", "weightMin", "weightMax", "dimensionCount", "largestDimensionShareOfWeightPct", "dimensions", "refParts")
balance = {
    a["id"]: {
        "riskTier": a["riskTier"],
        "before_HEAD_67d73223": {k: b[k] for k in keys},
        "after": {k: a[k] for k in keys},
        "floor15": a["meetsFloor"],
        "validatorErrors": a["validatorErrors"],
        "multiInstrumentRefsAfter": a["multiInstrumentRefs"],
    }
    for b, a in zip(before["packs"], after["packs"])
}
result = {
    "track": "mobility round-2 content apply",
    "base": "67d73223897008ca4ed8baf81c970020b4bf944d",
    "contentCandidate": "febdc748328880563ce763593e73a618f4c9ffab",
    "worktree": "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-5",
    "branch": "worktree-wf_b05b1ca6-169-5",
    "freshClone": "/private/tmp/claude-501/-Users-sid-AgentMaturityCompass/39a2e918-fc29-48df-9148-bb8801c84571/scratchpad/mob-clone at febdc748",
    "environment": "Darwin arm64, Node v25.5.0, pnpm 10.33.0; pnpm install --frozen-lockfile --prefer-offline in worktree and clone",
    "ranAt": "2026-10-04",
    "actionCounts": dict(Counter(r["action"] for r in log)),
    "questionsInOut": {"in": sum(p["n"] for p in before["packs"]), "out": sum(p["n"] for p in after["packs"])},
    "balance": balance,
    "tierWeightsAllPacks": after["tierWeights"],
    "deep": {"before": before["deepMobility"], "after": after["deepMobility"]},
    "catalogueAdded": ["eu-gsr", "eu-ads-ir", "eu-efti", "eu-cpr-2024", "eu-gdp-guidelines", "edpb-gl-4-2019", "nist-sp-800-207", "nist-sp-800-218"],
    "probeAfter": json.load(open(H / "probe-after.json")),
    "mutations": mut,
    "tests": {
        "freshClone_focused17Files": "17 files, 489 passed / 489",
        "worktree_typecheck": "pnpm typecheck exit 0; pnpm typecheck:tests exit 0 (after all source edits, before the content commit)",
    },
    **json.load(open(H / "decisions.json")),
}
(H / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(result["actionCounts"], result["questionsInOut"])
