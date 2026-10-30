"""Industry pack / domain wrappers: argv construction, refusal and JSON contract.

Every test except the last uses a stubbed runner, so no CLI is needed. The last
test runs the real built CLI (``dist/cli.js``) and is skipped when it is absent.
It checks the locked paths, or the unlocked shapes when the environment carries
an Industry Packs licence that verifies against a key pinned in ``AMC_HOME``'s
trust list; this suite never creates a licence itself.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
from types import SimpleNamespace

import pytest

try:
    import amc_sdk  # noqa: F401
except ModuleNotFoundError:  # running from a checkout without an install
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from amc_sdk import AmcError, AmcProtocolError, AmcTimeoutError
from amc_sdk import industry
from amc_sdk.industry import (
    DOMAIN_IDS, PACK_IDS, AmcIndustry, AmcIndustryCommandError, AmcIndustryLockedError,
)

REPO = Path(__file__).resolve().parents[3]
BIN = ["amc-test-bin"]

ENTITLEMENT = {
    "planId": "industry-packs-monthly", "priceUsdMonthly": "9.99", "checkoutAvailable": False,
    "checkoutUrl": None, "licenseVerificationConfigured": False, "expiresAt": None, "active": False,
    "source": "none", "message": "locked",
}
CATALOG_ITEM = {"packId": "farm-to-fork", "name": "Farm to Fork", "domain": "environment",
                "riskLevel": "very-high", "questionCount": 16, "locked": True, "description": "d",
                "regulatoryBasis": ["r"], "complianceFrameworks": ["f"]}
DOMAIN = {"id": "health", "name": "Health", "description": "d", "aliases": ["healthcare"],
          "sectorTags": [], "recommendedIndustryPacks": ["clinical-trials"], "regulatoryBasis": [],
          "riskLevel": "critical", "euAIActCategory": "high-risk", "questionCount": 1,
          "assurancePacks": [], "primaryModules": [], "complianceFrameworks": []}
QUESTION = {"id": "HLT-CT-1", "dimension": "Safety", "text": "t", "regulatoryRef": "r",
            "l1": "a", "l3": "b", "l5": "c", "weight": 10}
PACK = {"id": "clinical-trials", "stationId": "health", "name": "Clinical Trials", "description": "d",
        "regulatoryBasis": [], "questions": [QUESTION], "certificationThreshold": 80,
        "complianceFrameworks": [], "riskTier": "critical", "euAIActClassification": "high-risk",
        "sdgAlignment": [], "certificationPath": "p", "keyRisks": []}
# Shapes as `amc domain pack run --baseline --json` and `amc domain apply --dry-run --json` print them (2026-10-18).
STATUS = {"applicability": {"state": "unresolved", "reason": "no applicability decision recorded"},
          "evidence": "incomplete", "result": "not_evaluated", "enforcement": {"state": "none"}, "review": "pending"}
SCORE = {"packId": "clinical-trials", "packName": "Clinical Trials", "stationId": "health",
         "percentage": None, "level": None, "notEvaluatedQuestionIds": ["HLT-CT-1"],
         "selfAssessment": {"complete": False, "answered": 0, "total": 1},
         "claimKind": "self_reported", "eligibleLevel": None, "questionResults": [], "complianceGaps": [],
         "riskTier": "critical", "statusDimensions": STATUS, "claimLabel": "Claim: Self-reported · Result: not evaluated"}
ANSWERED = {**SCORE, "percentage": 50, "level": 2, "notEvaluatedQuestionIds": [], "eligibleLevel": 1,
            "selfAssessment": {"complete": True, "answered": 1, "total": 1},
            "questionResults": [{"id": "HLT-CT-1", "dimension": "Safety", "score": 5, "weight": 10, "percentage": 50}],
            "complianceGaps": ["HLT-CT-1 (Safety): L3"]}
APPLY = {"agentId": "a", "domain": "health", "packsApplied": ["clinical-trials"], "guardrailsGenerated": 3,
         "configFileUpdated": None, "guardrailsProposed": ["clinical-trials:HLT-CT-1"], "guardrailsEnabled": [],
         "complianceFrameworks": ["EU_AI_ACT"], "assessment": {"status": "not_evaluated", "reasons": ["no run"]},
         "dryRun": True, "operatingProfile": {"station": "health", "riskTier": "critical", "path": "p",
                                              "written": False, "consistency": {"ok": True, "violations": []}}}


class Runner:
    def __init__(self, returncode: int = 0, stdout: object = "", stderr: str = "") -> None:
        self.calls: list[tuple[list[str], str, float]] = []
        self.result = SimpleNamespace(returncode=returncode, stdout=stdout if isinstance(stdout, str) else json.dumps(stdout), stderr=stderr)

    def __call__(self, argv: list[str], cwd: str, timeout: float):
        self.calls.append((argv, cwd, timeout))
        return self.result


def client(tmp_path: Path, runner: Runner) -> AmcIndustry:
    return AmcIndustry(workspace=str(tmp_path), amc_bin=BIN, runner=runner)


def test_list_domains_argv_cwd_and_result(tmp_path: Path) -> None:
    runner = Runner(stdout=[DOMAIN])
    assert client(tmp_path, runner).list_domains() == [DOMAIN]
    assert runner.calls == [([*BIN, "domain", "list", "--json"], os.path.realpath(tmp_path), 120.0)]


def test_list_packs_with_and_without_domain(tmp_path: Path) -> None:
    runner = Runner(stdout={"entitlement": ENTITLEMENT, "packs": [CATALOG_ITEM]})
    sdk = client(tmp_path, runner)
    assert sdk.list_packs()["packs"] == [CATALOG_ITEM]
    sdk.list_packs(domain="health")
    assert [call[0] for call in runner.calls] == [
        [*BIN, "domain", "pack", "list", "--json"],
        [*BIN, "domain", "pack", "list", "--domain", "health", "--json"],
    ]


def test_describe_and_score_argv(tmp_path: Path) -> None:
    runner = Runner(stdout=PACK)
    assert client(tmp_path, runner).describe_pack("clinical-trials") == PACK
    runner2 = Runner(stdout=SCORE)
    assert client(tmp_path, runner2).score_pack_baseline("clinical-trials") == SCORE
    assert runner.calls[0][0] == [*BIN, "domain", "pack", "describe", "--pack", "clinical-trials", "--json"]
    assert runner2.calls[0][0] == [*BIN, "domain", "pack", "run", "--pack", "clinical-trials", "--baseline", "--json"]


def test_apply_argv_composition(tmp_path: Path) -> None:
    runner = Runner(stdout=APPLY)
    result = client(tmp_path, runner).apply("a", domain="health", pack_id="clinical-trials", dry_run=True,
                                            compliance=["EU_AI_ACT", "ISO_42001"], file="agent.yaml")
    assert result == APPLY
    assert runner.calls[0][0] == [*BIN, "domain", "apply", "--agent", "a", "--domain", "health",
                                  "--pack", "clinical-trials", "--dry-run", "--compliance", "EU_AI_ACT",
                                  "--compliance", "ISO_42001", "--file", "agent.yaml", "--json"]
    client(tmp_path, runner).apply("a", pack_id="clinical-trials")
    assert runner.calls[1][0] == [*BIN, "domain", "apply", "--agent", "a", "--pack", "clinical-trials", "--json"]


@pytest.mark.parametrize("call", [
    lambda sdk: sdk.describe_pack("clinical-trials; rm -rf /"),
    lambda sdk: sdk.describe_pack("nope"),
    lambda sdk: sdk.score_pack_baseline("$(id)"),
    lambda sdk: sdk.list_packs(domain="healthcare"),
    lambda sdk: sdk.list_packs(domain="health && id"),
    lambda sdk: sdk.apply("a", domain="wealth`id`"),
    lambda sdk: sdk.apply("a", pack_id="CLINICAL-TRIALS"),
    lambda sdk: sdk.apply(""),
    lambda sdk: sdk.apply("a\0b", domain="health"),
    lambda sdk: sdk.apply("a", domain="health", compliance=["ok", ""]),
    lambda sdk: sdk.apply("a", domain="health", file="x\0y"),
    lambda sdk: sdk.describe_pack(["clinical-trials"]),
])
def test_unknown_or_invalid_ids_are_refused_before_running(tmp_path: Path, call) -> None:
    runner = Runner(stdout=PACK)
    with pytest.raises(ValueError):
        call(client(tmp_path, runner))
    assert runner.calls == []


def test_shell_metacharacters_in_an_id_stay_one_argv_element(tmp_path: Path) -> None:
    hostile = "a; rm -rf / && $(whoami) `id` | cat > x 'q' \"d\" *"
    runner = Runner(stdout=APPLY)
    client(tmp_path, runner).apply(hostile, domain="health", file="--json; echo $HOME")
    argv = runner.calls[0][0]
    assert isinstance(argv, list)
    assert argv[argv.index("--agent") + 1] == hostile
    assert argv[argv.index("--file") + 1] == "--json; echo $HOME"
    assert argv.count(hostile) == 1 and len(argv) == len(BIN) + 9


def test_default_runner_never_uses_a_shell(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    def fake_run(*args, **kwargs):
        seen["args"], seen["kwargs"] = args, kwargs
        return SimpleNamespace(returncode=0, stdout=json.dumps(APPLY), stderr="")

    monkeypatch.setattr(industry.subprocess, "run", fake_run)
    hostile = "x;id"
    AmcIndustry(workspace=str(tmp_path), amc_bin=BIN).apply(hostile, domain="health")
    argv = seen["args"][0] if seen["args"] else seen["kwargs"]["args"]
    assert isinstance(argv, list) and hostile in argv
    assert seen["kwargs"].get("shell", False) is False
    # A child that inherits a TTY would prompt interactively and hang.
    assert seen["kwargs"]["stdin"] is subprocess.DEVNULL
    assert seen["kwargs"]["cwd"] == os.path.realpath(tmp_path)


def test_default_runner_timeout_and_launch_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def expire(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=kwargs["timeout"])

    monkeypatch.setattr(industry.subprocess, "run", expire)
    with pytest.raises(AmcTimeoutError):
        AmcIndustry(workspace=str(tmp_path), amc_bin=BIN, timeout=0.5).list_domains()

    def missing(*args, **kwargs):
        raise FileNotFoundError("no such executable")

    monkeypatch.setattr(industry.subprocess, "run", missing)
    with pytest.raises(AmcProtocolError):
        AmcIndustry(workspace=str(tmp_path), amc_bin=BIN).list_domains()


def test_locked_json_refusal_is_typed(tmp_path: Path) -> None:
    runner = Runner(returncode=1, stdout={"error": "industry_packs_locked", "message": "Industry Packs are locked."})
    with pytest.raises(AmcIndustryLockedError) as caught:
        client(tmp_path, runner).describe_pack("clinical-trials")
    assert caught.value.message == "Industry Packs are locked."


def test_other_nonzero_exit_carries_the_cli_reason(tmp_path: Path) -> None:
    runner = Runner(returncode=1, stdout="List available packs\n", stderr="Pack not found: x\n")
    with pytest.raises(AmcIndustryCommandError) as caught:
        client(tmp_path, runner).apply("a", domain="health")
    assert caught.value.returncode == 1 and "Pack not found" in str(caught.value)
    assert isinstance(caught.value, AmcError) and not isinstance(caught.value, AmcIndustryLockedError)
    # A locked-looking payload on a zero exit is not a refusal and not a pack either.
    with pytest.raises(AmcProtocolError):
        client(tmp_path, Runner(stdout={"error": "industry_packs_locked", "message": "m"})).describe_pack("clinical-trials")


@pytest.mark.parametrize("method,stdout", [
    ("list_domains", "not json"),
    ("list_domains", {"id": "health"}),
    ("list_domains", [{**DOMAIN, "aliases": "healthcare"}]),
    ("list_packs", {"packs": [CATALOG_ITEM]}),
    ("list_packs", {"entitlement": ENTITLEMENT, "packs": [{k: v for k, v in CATALOG_ITEM.items() if k != "locked"}]}),
    ("list_packs", {"entitlement": {k: v for k, v in ENTITLEMENT.items() if k != "licenseVerificationConfigured"},
                    "packs": [CATALOG_ITEM]}),
    ("describe_pack", {**PACK, "questions": [{k: v for k, v in QUESTION.items() if k != "weight"}]}),
    ("score_pack_baseline", {**SCORE, "level": True}),
    ("score_pack_baseline", {k: v for k, v in SCORE.items() if k != "claimKind"}),
    ("score_pack_baseline", {k: v for k, v in SCORE.items() if k != "statusDimensions"}),
    ("score_pack_baseline", {**SCORE, "statusDimensions": {k: v for k, v in STATUS.items() if k != "result"}}),
    ("score_pack_baseline", {**SCORE, "eligibleLevel": "1"}),
    ("score_pack_baseline", {k: v for k, v in SCORE.items() if k != "selfAssessment"}),
    ("score_pack_baseline", {k: v for k, v in SCORE.items() if k != "notEvaluatedQuestionIds"}),
    ("score_pack_baseline", {**SCORE, "percentage": "n/a"}),
    ("apply", {**APPLY, "assessment": {"status": "not_evaluated"}}),
    ("apply", {k: v for k, v in APPLY.items() if k != "guardrailsProposed"}),
    ("apply", {**APPLY, "configFileUpdated": 3}),
])
def test_contract_drift_fails_closed(tmp_path: Path, method: str, stdout: object) -> None:
    sdk = client(tmp_path, Runner(stdout=stdout))
    args = {"describe_pack": ("clinical-trials",), "score_pack_baseline": ("clinical-trials",),
            "apply": ("a",)}.get(method, ())
    kwargs = {"domain": "health"} if method == "apply" else {}
    with pytest.raises(AmcProtocolError):
        getattr(sdk, method)(*args, **kwargs)


def test_optional_keys_are_accepted(tmp_path: Path) -> None:
    active = {**ENTITLEMENT, "active": True, "source": "env", "licenseStatus": "active", "customerId": "c"}
    unlocked = {**CATALOG_ITEM, "locked": False}
    runner = Runner(stdout={"entitlement": active, "packs": [unlocked]})
    assert client(tmp_path, runner).list_packs()["packs"][0]["regulatoryBasis"] == ["r"]
    scored = {**ANSWERED, "statusDimensions": {**STATUS, "enforcement": {"state": "enforced", "boundary": "b"}}}
    assert client(tmp_path, Runner(stdout=scored)).score_pack_baseline("clinical-trials")["eligibleLevel"] == 1


def test_score_result_carries_the_claim_and_no_certified_field() -> None:
    hints = industry.IndustryPackScoreResult.__required_keys__
    assert {"claimKind", "statusDimensions", "claimLabel", "selfAssessment", "eligibleLevel", "notEvaluatedQuestionIds"} <= hints
    assert "certified" not in industry.IndustryPackScoreResult.__annotations__


def test_constructor_refuses_bad_bin_and_workspace(tmp_path: Path) -> None:
    for bad in ([], [""], ["amc", "a\0b"], 3):
        with pytest.raises(ValueError):
            AmcIndustry(workspace=str(tmp_path), amc_bin=bad)
    with pytest.raises(ValueError):
        AmcIndustry(workspace="")
    for bad_timeout in (0, -1, float("nan"), "5"):
        with pytest.raises(ValueError):
            AmcIndustry(workspace=str(tmp_path), timeout=bad_timeout)


def _ts_union(path: Path, type_name: str) -> set[str]:
    source = path.read_text(encoding="utf-8")
    body = re.search(rf"export type {type_name} =(.*?);", source, re.S)
    assert body, f"{type_name} not found in {path}"
    return set(re.findall(r'"([^"]+)"', body.group(1)))


@pytest.mark.skipif(not (REPO / "src/domains/industryPacks.ts").exists(), reason="checkout source absent")
def test_id_allowlists_match_the_cli_source() -> None:
    assert set(PACK_IDS) == _ts_union(REPO / "src/domains/industryPacks.ts", "IndustryPackId")
    assert set(DOMAIN_IDS) == _ts_union(REPO / "src/domains/domainRegistry.ts", "Domain")


CLI = REPO / "dist" / "cli.js"


@pytest.mark.skipif(not CLI.exists(), reason="dist/cli.js absent; run pnpm build to exercise the real CLI")
def test_installed_cli_contract(tmp_path: Path) -> None:
    sdk = AmcIndustry(workspace=str(tmp_path), amc_bin=["node", str(CLI)], timeout=120.0)
    domains = sdk.list_domains()
    assert {item["id"] for item in domains} == set(DOMAIN_IDS)
    catalog = sdk.list_packs()
    assert {item["packId"] for item in catalog["packs"]} == set(PACK_IDS)
    health = sdk.list_packs(domain="health")
    assert {item["domain"] for item in health["packs"]} == {"health"}
    if catalog["entitlement"]["active"]:
        # A licence from the environment: the unlocked shapes, against the real CLI.
        assert sdk.describe_pack("clinical-trials")["id"] == "clinical-trials"
        scored = sdk.score_pack_baseline("clinical-trials")
        assert scored["claimKind"] == "self_reported" and scored["statusDimensions"]["result"] == "not_evaluated"
        assert scored["selfAssessment"]["answered"] == 0 and scored["eligibleLevel"] is None
        assert scored["percentage"] is None and scored["level"] is None and scored["complianceGaps"] == []
        assert len(scored["notEvaluatedQuestionIds"]) == scored["selfAssessment"]["total"]
        assert sdk.apply("probe", pack_id="clinical-trials", dry_run=True)["dryRun"] is True
        assert sorted(os.listdir(tmp_path)) == []
        return
    with pytest.raises(AmcIndustryLockedError):
        sdk.describe_pack("clinical-trials")
    with pytest.raises(AmcIndustryLockedError):
        sdk.score_pack_baseline("clinical-trials")
    with pytest.raises(AmcIndustryCommandError):
        sdk.apply("probe", pack_id="clinical-trials", dry_run=True)
    assert sorted(os.listdir(tmp_path)) == []
