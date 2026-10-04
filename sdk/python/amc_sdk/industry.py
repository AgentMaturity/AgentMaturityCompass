"""Industry pack and domain commands of the installed ``amc`` CLI, typed.

    from amc_sdk.industry import AmcIndustry

    industry = AmcIndustry(workspace=".")
    catalog = industry.list_packs(domain="health")

THESE ARE CLI CALLS, like :mod:`amc_sdk.proof`. Each method runs one
``amc domain ... --json`` command as an argv list (never a shell string), with
stdin closed so the CLI cannot fall into an interactive prompt, and returns the
CLI's JSON unchanged after checking it against the shapes declared below. A
shape mismatch raises :class:`AmcProtocolError` rather than returning a partial
result. Pack and domain ids are checked against the CLI's own id sets before
anything runs; domain aliases (``healthcare``) are refused, pass the canonical id.

Pack details, baseline scoring and apply need an active Industry Packs
entitlement; without one the CLI refuses and so does this module
(:class:`AmcIndustryLockedError` or :class:`AmcIndustryCommandError`).
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import types
from typing import Any, Callable, Optional, TypedDict, Union, get_args, get_origin, get_type_hints, is_typeddict

from .client import DEFAULT_TIMEOUT_SECONDS, AmcError, AmcProtocolError, AmcTimeoutError, _timeout_seconds

__all__ = ["AmcIndustry", "AmcIndustryLockedError", "AmcIndustryCommandError", "PACK_IDS", "DOMAIN_IDS",
           "DomainMetadata", "IndustryPackEntitlement", "IndustryPackCatalogItem", "IndustryPackCatalog",
           "IndustryPackQuestion", "IndustryPack", "IndustryPackQuestionResult", "IndustryPackScoreResult",
           "DomainAssessmentScore", "DomainApplyResult", "CliRunner"]

# Mirrors `IndustryPackId` (src/domains/industryPacks.ts) and `Domain`
# (src/domains/domainRegistry.ts); a test compares both against the source.
PACK_IDS: tuple[str, ...] = (
    "farm-to-fork", "weave-to-wear", "material-to-machines", "source-to-sustenance", "ubiquity-to-utility",
    "sip-to-sanitation", "digital-health-record", "wellness-management", "patient-lifecycle",
    "clinical-lifecycle", "professional-practice", "life-technology", "drug-discovery", "clinical-trials",
    "specialized-medicine", "future-of-work", "digital-payments", "no-poverty", "circular-economy",
    "blockchain", "k12-pm3", "higher-education", "skills-training", "specialized-education",
    "differently-abled", "sustainable-communities", "sustainable-ports", "sustainable-real-estate",
    "virtual-infrastructure", "privacy-security-mobility", "freight-3pl-warehouse",
    "cognition-to-intelligence", "networked-ecosystems", "os-sustainable-outcomes", "infotainment",
    "partnerships-prosperity", "digital-citizens-rights", "dance-of-democracy", "petition-to-law",
    "citizen-services", "public-private-collaboration",
)
DOMAIN_IDS: tuple[str, ...] = ("health", "education", "environment", "mobility", "governance", "technology", "wealth")


class AmcIndustryLockedError(AmcError):
    """The CLI's JSON refusal ``{"error": "industry_packs_locked", "message": ...}``."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AmcIndustryCommandError(AmcError):
    """Any other nonzero exit. Carries the CLI's own reason, not a generic one."""

    def __init__(self, returncode: int, reason: str) -> None:
        super().__init__(reason)
        self.returncode = returncode


# JSON numbers are annotated `float`; integers are accepted, booleans are not.
class DomainMetadata(TypedDict):
    """One element of ``amc domain list --json`` (a JSON array)."""
    id: str
    name: str
    description: str
    aliases: list[str]
    sectorTags: list[str]
    recommendedIndustryPacks: list[str]
    regulatoryBasis: list[str]
    riskLevel: str
    euAIActCategory: str
    questionCount: float
    assurancePacks: list[str]
    primaryModules: list[str]
    complianceFrameworks: list[str]


class _Entitlement(TypedDict):
    active: bool
    source: str
    planId: str
    priceUsdMonthly: str
    checkoutAvailable: bool
    checkoutUrl: str
    expiresAt: str | None
    message: str


class IndustryPackEntitlement(_Entitlement, total=False):
    customerId: str
    subscriptionId: str
    licenseStatus: str


class _CatalogItem(TypedDict):
    packId: str
    name: str
    domain: str
    riskLevel: str
    questionCount: float
    locked: bool
    description: str


class IndustryPackCatalogItem(_CatalogItem, total=False):
    """``regulatoryBasis``/``complianceFrameworks`` are present only when unlocked."""
    regulatoryBasis: list[str]
    complianceFrameworks: list[str]


class IndustryPackCatalog(TypedDict):
    """``amc domain pack list [--domain D] --json``."""
    entitlement: IndustryPackEntitlement
    packs: list[IndustryPackCatalogItem]


class IndustryPackQuestion(TypedDict):
    id: str
    dimension: str
    text: str
    regulatoryRef: str
    l1: str
    l3: str
    l5: str
    weight: float


class IndustryPack(TypedDict):
    """``amc domain pack describe --pack P --json``."""
    id: str
    stationId: str
    name: str
    description: str
    regulatoryBasis: list[str]
    questions: list[IndustryPackQuestion]
    certificationThreshold: float
    complianceFrameworks: list[str]
    riskTier: str
    euAIActClassification: str
    sdgAlignment: list[str]
    certificationPath: str
    keyRisks: list[str]


class IndustryPackQuestionResult(TypedDict):
    id: str
    dimension: str
    score: float
    weight: float
    percentage: float


class IndustryPackScoreResult(TypedDict):
    """``amc domain pack run --pack P --baseline --json``."""
    packId: str
    packName: str
    stationId: str
    percentage: float
    level: float
    certified: bool
    questionResults: list[IndustryPackQuestionResult]
    complianceGaps: list[str]
    riskTier: str


class DomainAssessmentScore(TypedDict):
    composite: float
    level: str
    gaps: float


class DomainApplyResult(TypedDict):
    """``amc domain apply --agent A ... --json`` (the non-audit form)."""
    agentId: str
    domain: str
    packsApplied: list[str]
    guardrailsGenerated: float
    configFileUpdated: str | None
    guardrailsEnabled: list[str]
    complianceFrameworks: list[str]
    assessmentScore: DomainAssessmentScore
    dryRun: bool


#: ``(argv, cwd, timeout) -> object with returncode, stdout, stderr`` (text).
CliRunner = Callable[[list[str], str, float], Any]


def _conforms(value: Any, tp: Any) -> bool:
    if tp is str:
        return isinstance(value, str)
    if tp is bool:
        return type(value) is bool
    if tp is float:
        return type(value) in (int, float) and math.isfinite(value)
    if tp is type(None):
        return value is None
    if get_origin(tp) is list:
        return isinstance(value, list) and all(_conforms(item, get_args(tp)[0]) for item in value)
    if get_origin(tp) in (Union, types.UnionType):
        return any(_conforms(value, option) for option in get_args(tp))
    if is_typeddict(tp):
        hints = get_type_hints(tp)
        return (isinstance(value, dict) and tp.__required_keys__ <= value.keys()
                and all(_conforms(value[key], hints[key]) for key in hints if key in value))
    raise TypeError(f"no JSON shape rule for {tp!r}")


def _run_cli(argv: list[str], cwd: str, timeout: float) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(argv, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True,
                              text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as error:
        raise AmcTimeoutError(f"{argv[0]} did not finish within {timeout}s", operation=" ".join(argv[-4:]),
                              fatal=True) from error
    except OSError as error:
        raise AmcProtocolError("could not launch the selected AMC executable") from error


def _text(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value or "\0" in value:
        raise ValueError(f"{what} must be a nonempty string without NUL bytes")
    return value


def _known(value: Any, allowed: tuple[str, ...], what: str) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"unknown {what}: {value!r}; expected one of {', '.join(allowed)}")
    return value


class AmcIndustry:
    """Run industry pack and domain commands against one fixed workspace."""

    def __init__(self, workspace: str = ".", *, amc_bin: Optional[str | list[str]] = None,
                 timeout: float = DEFAULT_TIMEOUT_SECONDS, runner: Optional[CliRunner] = None) -> None:
        self.timeout = _timeout_seconds(timeout)
        if not isinstance(workspace, (str, os.PathLike)) or not os.fspath(workspace) or "\0" in os.fspath(workspace):
            raise ValueError("workspace must be a nonempty filesystem path without NUL bytes")
        self.workspace = os.path.realpath(os.path.abspath(workspace))
        resolved = amc_bin if amc_bin is not None else os.environ.get("AMC_BIN", "amc")
        if not isinstance(resolved, (str, list)):
            raise ValueError("amc_bin must name an executable and optional arguments")
        self._bin = list(resolved) if isinstance(resolved, list) else (["node", resolved] if resolved.endswith(".js") else [resolved])
        if not self._bin or any(not isinstance(arg, str) or not arg or "\0" in arg for arg in self._bin):
            raise ValueError("amc_bin must name an executable and optional arguments")
        self._runner = runner or _run_cli

    def _json(self, args: list[str], shape: Any) -> Any:
        completed = self._runner([*self._bin, *args, "--json"], self.workspace, self.timeout)
        if completed.returncode != 0:
            try:
                refusal = json.loads(completed.stdout)
            except ValueError:
                refusal = None
            if (isinstance(refusal, dict) and refusal.get("error") == "industry_packs_locked"
                    and isinstance(refusal.get("message"), str)):
                raise AmcIndustryLockedError(refusal["message"])
            reason = (completed.stderr or completed.stdout or "").strip()
            raise AmcIndustryCommandError(completed.returncode, reason or f"amc exited {completed.returncode}")
        try:
            payload = json.loads(completed.stdout)
        except ValueError as error:
            raise AmcProtocolError("the CLI did not print one JSON document") from error
        if not _conforms(payload, shape):
            raise AmcProtocolError(f"CLI output does not match the {getattr(shape, '__name__', shape)} contract")
        return payload

    def list_domains(self) -> list[DomainMetadata]:
        """``amc domain list --json``."""
        return self._json(["domain", "list"], list[DomainMetadata])

    def list_packs(self, domain: Optional[str] = None) -> IndustryPackCatalog:
        """``amc domain pack list [--domain D] --json``; works without an entitlement."""
        args = ["domain", "pack", "list"]
        if domain is not None:
            args += ["--domain", _known(domain, DOMAIN_IDS, "domain")]
        return self._json(args, IndustryPackCatalog)

    def describe_pack(self, pack_id: str) -> IndustryPack:
        """``amc domain pack describe --pack P --json``."""
        return self._json(["domain", "pack", "describe", "--pack", _known(pack_id, PACK_IDS, "pack id")], IndustryPack)

    def score_pack_baseline(self, pack_id: str) -> IndustryPackScoreResult:
        """``amc domain pack run --pack P --baseline --json``: every question scored at L1.

        The CLI takes custom responses only interactively, so this is the only
        scoring it offers a non-interactive caller.
        """
        args = ["domain", "pack", "run", "--pack", _known(pack_id, PACK_IDS, "pack id"), "--baseline"]
        return self._json(args, IndustryPackScoreResult)

    def apply(self, agent_id: str, *, domain: Optional[str] = None, pack_id: Optional[str] = None,
              dry_run: bool = False, compliance: Optional[list[str]] = None,
              file: Optional[str] = None) -> DomainApplyResult:
        """``amc domain apply --agent A [--domain D] [--pack P] ... --json``.

        Writes guardrails into the workspace unless ``dry_run``. The CLI
        normalizes ``agent_id`` itself and requires ``domain`` or ``pack_id``.
        """
        args = ["domain", "apply", "--agent", _text(agent_id, "agent_id")]
        if domain is not None:
            args += ["--domain", _known(domain, DOMAIN_IDS, "domain")]
        if pack_id is not None:
            args += ["--pack", _known(pack_id, PACK_IDS, "pack id")]
        if dry_run:
            args.append("--dry-run")
        if compliance is not None and not isinstance(compliance, (list, tuple)):
            raise ValueError("compliance must be a list of framework ids")
        for framework in compliance or ():
            args += ["--compliance", _text(framework, "compliance framework")]
        if file is not None:
            args += ["--file", _text(file, "file")]
        return self._json(args, DomainApplyResult)
