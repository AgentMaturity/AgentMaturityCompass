"""S4 — Software Bill of Materials (SBOM) generation, CVE watching, and fetch-execute detection.

Generates SBOMs from skill directories, detects supply-chain risks, checks for
known CVEs, and exports to CycloneDX / SPDX formats.

Usage::

    from amc.shield.s4_sbom import SBOMGenerator, CVEWatcher, FetchExecuteDetector
    from amc.shield.s4_sbom import export_cyclonedx_json, export_spdx_json

    gen = SBOMGenerator()
    sbom = gen.generate("/path/to/skill")

    watcher = CVEWatcher()
    alerts = watcher.check_known_cves(sbom)

    detector = FetchExecuteDetector()
    risks = detector.scan("/path/to/skill")

    cdx = export_cyclonedx_json(sbom)
    spdx = export_spdx_json(sbom)
"""
from __future__ import annotations

import enum
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog
from packaging.version import Version
from pydantic import BaseModel, Field

from amc.core.models import RiskLevel

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Enums & Models
# ---------------------------------------------------------------------------


class ComponentType(str, enum.Enum):
    """Type of software component tracked in an SBOM."""

    PYTHON_PACKAGE = "python-package"
    NPM_PACKAGE = "npm-package"
    SYSTEM_CMD = "system-cmd"
    EXTERNAL_URL = "external-url"


class SBOMComponent(BaseModel):
    """A single component in a Software Bill of Materials.

    Example::

        SBOMComponent(
            name="requests",
            version="2.31.0",
            type=ComponentType.PYTHON_PACKAGE,
            pinned=True,
            purl="pkg:pypi/requests@2.31.0",
        )
    """

    name: str
    version: str | None = None
    type: ComponentType
    pinned: bool = False
    purl: str = ""


class SkillSBOM(BaseModel):
    """Full SBOM for an AMC skill.

    Example::

        SkillSBOM(
            skill_name="my-skill",
            skill_version="1.0.0",
            components=[],
            generated_at=datetime.now(timezone.utc),
            fetch_execute_risks=[],
        )
    """

    skill_name: str
    skill_version: str = "0.0.0"
    components: list[SBOMComponent] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    fetch_execute_risks: list[str] = Field(default_factory=list)


class CVEAlert(BaseModel):
    """Alert for a known CVE matching a component.

    Example::

        CVEAlert(
            component="requests",
            cve_id="CVE-2023-32681",
            severity=RiskLevel.HIGH,
            description="Leaking Proxy-Authorization header",
            fix_version="2.28.0",
        )
    """

    component: str
    cve_id: str
    severity: RiskLevel
    description: str
    fix_version: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_REQ_LINE_RE = re.compile(
    r"^([A-Za-z0-9_][A-Za-z0-9._-]*)\s*(?:(==|>=|~=|<=|!=|<|>)\s*([^\s;#,]+))?",
)


def _parse_pep508(dep: str) -> tuple[str, str | None, bool]:
    """Parse a PEP-508 style dependency string → (name, version, pinned)."""
    dep = dep.strip().split(";")[0].strip()  # drop markers
    m = _REQ_LINE_RE.match(dep)
    if not m:
        return dep.strip(), None, False
    name, op, ver = m.group(1), m.group(2), m.group(3)
    if not op or not ver:
        return name, None, False
    pinned = op == "==" or op == "~="
    return name, ver, pinned


def _make_purl(name: str, version: str | None, ctype: ComponentType) -> str:
    prefix = "pkg:pypi" if ctype == ComponentType.PYTHON_PACKAGE else "pkg:npm"
    if version:
        return f"{prefix}/{name}@{version}"
    return f"{prefix}/{name}"


# ---------------------------------------------------------------------------
# SBOMGenerator
# ---------------------------------------------------------------------------


class SBOMGenerator:
    """Generate a :class:`SkillSBOM` from a skill directory.

    Parses ``requirements.txt``, ``pyproject.toml``, ``package.json``, and
    ``package-lock.json``.

    Example::

        gen = SBOMGenerator()
        sbom = gen.generate("/path/to/skill")
        print(len(sbom.components))
    """

    def generate(self, skill_path: str | Path) -> SkillSBOM:
        """Scan *skill_path* and return an SBOM."""
        root = Path(skill_path)
        components: list[SBOMComponent] = []

        # requirements.txt
        req_file = root / "requirements.txt"
        if req_file.exists():
            components.extend(self._parse_requirements(req_file))

        # pyproject.toml
        pyproject = root / "pyproject.toml"
        if pyproject.exists():
            components.extend(self._parse_pyproject(pyproject))

        # package.json
        pkg_json = root / "package.json"
        if pkg_json.exists():
            components.extend(self._parse_package_json(pkg_json))

        # package-lock.json
        pkg_lock = root / "package-lock.json"
        if pkg_lock.exists():
            components.extend(self._parse_package_lock(pkg_lock))

        # fetch-execute risks
        detector = FetchExecuteDetector()
        risks = detector.scan(root)

        skill_name = root.name
        sbom = SkillSBOM(
            skill_name=skill_name,
            skill_version="0.0.0",
            components=components,
            fetch_execute_risks=risks,
        )
        log.info("sbom.generated", skill=skill_name, components=len(components), risks=len(risks))
        return sbom

    # -- parsers --

    def _parse_requirements(self, path: Path) -> list[SBOMComponent]:
        components: list[SBOMComponent] = []
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            name, ver, pinned = _parse_pep508(line)
            ct = ComponentType.PYTHON_PACKAGE
            components.append(SBOMComponent(
                name=name, version=ver, type=ct, pinned=pinned,
                purl=_make_purl(name, ver, ct),
            ))
        return components

    def _parse_pyproject(self, path: Path) -> list[SBOMComponent]:
        tomllib: Any = None
        try:
            import tomllib as _tomllib  # type: ignore[import-not-found]
            tomllib = _tomllib
        except (ImportError, ModuleNotFoundError):
            try:
                import tomli as _tomli  # type: ignore[import-untyped]
                tomllib = _tomli
            except ImportError:
                log.warning("sbom.pyproject.skip", reason="no toml parser")
                return []

        data = tomllib.loads(path.read_text())
        components: list[SBOMComponent] = []

        # [project.dependencies]
        for dep in data.get("project", {}).get("dependencies", []):
            name, ver, pinned = _parse_pep508(dep)
            ct = ComponentType.PYTHON_PACKAGE
            components.append(SBOMComponent(
                name=name, version=ver, type=ct, pinned=pinned,
                purl=_make_purl(name, ver, ct),
            ))

        # [tool.poetry.dependencies]
        poetry_deps = data.get("tool", {}).get("poetry", {}).get("dependencies", {})
        for name, spec in poetry_deps.items():
            if name.lower() == "python":
                continue
            if isinstance(spec, str):
                ver = spec.lstrip("^~>=<! ")
                pinned = spec.startswith("==") or (not any(c in spec for c in "^~><*"))
            else:
                ver = str(spec.get("version", "")).lstrip("^~>=<! ") or None
                pinned = False
            ct = ComponentType.PYTHON_PACKAGE
            components.append(SBOMComponent(
                name=name, version=ver or None, type=ct, pinned=pinned,
                purl=_make_purl(name, ver or None, ct),
            ))
        return components

    def _parse_package_json(self, path: Path) -> list[SBOMComponent]:
        data = json.loads(path.read_text())
        components: list[SBOMComponent] = []
        for section in ("dependencies", "devDependencies"):
            for name, ver_spec in data.get(section, {}).items():
                ver = ver_spec.lstrip("^~>=<! ")
                pinned = not any(c in ver_spec for c in "^~*>")
                ct = ComponentType.NPM_PACKAGE
                components.append(SBOMComponent(
                    name=name, version=ver, type=ct, pinned=pinned,
                    purl=_make_purl(name, ver, ct),
                ))
        return components

    def _parse_package_lock(self, path: Path) -> list[SBOMComponent]:
        data = json.loads(path.read_text())
        components: list[SBOMComponent] = []
        packages = data.get("packages", data.get("dependencies", {}))
        for key, info in packages.items():
            if not key:  # root entry
                continue
            name = key.split("node_modules/")[-1] if "node_modules/" in key else key
            ver = info.get("version")
            ct = ComponentType.NPM_PACKAGE
            components.append(SBOMComponent(
                name=name, version=ver, type=ct, pinned=True,
                purl=_make_purl(name, ver, ct),
            ))
        return components


# ---------------------------------------------------------------------------
# FetchExecuteDetector
# ---------------------------------------------------------------------------

_FETCH_EXEC_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(curl|wget)\s+[^\|]*\|\s*(bash|sh|zsh)", re.I),
     "Remote script piped to shell (curl/wget | bash)"),
    (re.compile(r"subprocess.*shell\s*=\s*True.*https?://", re.I | re.S),
     "subprocess with shell=True fetching a URL"),
    (re.compile(r"os\.system\s*\(.*https?://", re.I),
     "os.system executing a command with a URL"),
    (re.compile(r"(eval|exec)\s*\(.*(?:urlopen|requests\.get|httpx|aiohttp)", re.I),
     "eval/exec with network content"),
    (re.compile(r"(eval|exec)\s*\(.*(?:urllib|fetch|download)", re.I),
     "eval/exec with potential network fetch"),
]


class FetchExecuteDetector:
    """Detect fetch-execute patterns in skill source files.

    Example::

        detector = FetchExecuteDetector()
        risks = detector.scan("/path/to/skill")
        for r in risks:
            print(r)
    """

    def scan(self, skill_path: str | Path) -> list[str]:
        """Scan Python and shell files for fetch-execute risks."""
        root = Path(skill_path)
        risks: list[str] = []
        globs = ["**/*.py", "**/*.sh", "**/*.bash"]
        for pattern in globs:
            for fpath in root.glob(pattern):
                try:
                    content = fpath.read_text(errors="ignore")
                except OSError:
                    continue
                rel = fpath.relative_to(root)
                for regex, desc in _FETCH_EXEC_PATTERNS:
                    if regex.search(content):
                        risks.append(f"{rel}: {desc}")
        return risks


# ---------------------------------------------------------------------------
# CVEWatcher
# ---------------------------------------------------------------------------


class _KnownCVE:
    __slots__ = ("package", "below", "cve_id", "severity", "description")

    def __init__(self, package: str, below: str, cve_id: str, severity: RiskLevel, description: str) -> None:
        self.package = package.lower()
        self.below = below
        self.cve_id = cve_id
        self.severity = severity
        self.description = description


class CVEWatcher:
    """Check SBOM components against a curated list of known Python CVEs.

    Example::

        watcher = CVEWatcher()
        alerts = watcher.check_known_cves(sbom)
        for a in alerts:
            print(a.cve_id, a.component, a.severity)
    """

    KNOWN_CVES: list[_KnownCVE] = [
        _KnownCVE("requests", "2.28.0", "CVE-2023-32681", RiskLevel.HIGH,
                   "Leaking Proxy-Authorization header to redirects"),
        _KnownCVE("urllib3", "1.26.5", "CVE-2021-33503", RiskLevel.HIGH,
                   "ReDoS via URL authority parsing"),
        _KnownCVE("pillow", "9.0.0", "CVE-2022-22815", RiskLevel.HIGH,
                   "Multiple out-of-bounds read/write in image processing"),
        _KnownCVE("pyyaml", "5.4", "CVE-2020-14343", RiskLevel.CRITICAL,
                   "Arbitrary code execution via yaml.load()"),
        _KnownCVE("cryptography", "39.0.1", "CVE-2023-23931", RiskLevel.HIGH,
                   "Memory corruption in X.509 certificate parsing"),
        _KnownCVE("jinja2", "3.1.2", "CVE-2024-22195", RiskLevel.MEDIUM,
                   "XSS via xmlattr filter"),
        _KnownCVE("flask", "2.3.2", "CVE-2023-30861", RiskLevel.HIGH,
                   "Session cookie sent to wrong domain on redirect"),
        _KnownCVE("django", "4.2.1", "CVE-2023-31047", RiskLevel.HIGH,
                   "Bypass file upload validation with multiple files"),
        _KnownCVE("numpy", "1.22.0", "CVE-2021-41496", RiskLevel.MEDIUM,
                   "Buffer overflow in array reshape"),
        _KnownCVE("setuptools", "65.5.1", "CVE-2022-40897", RiskLevel.HIGH,
                   "ReDoS in package_index HTML parsing"),
        _KnownCVE("certifi", "2023.7.22", "CVE-2023-37920", RiskLevel.HIGH,
                   "Removal of e-Tugra root certificate"),
        _KnownCVE("aiohttp", "3.8.5", "CVE-2023-37276", RiskLevel.HIGH,
                   "HTTP request smuggling via malformed headers"),
        _KnownCVE("lxml", "4.9.1", "CVE-2022-2309", RiskLevel.MEDIUM,
                   "NULL pointer dereference in iterwalk"),
        _KnownCVE("paramiko", "3.4.0", "CVE-2023-48795", RiskLevel.HIGH,
                   "Terrapin SSH prefix truncation attack"),
        _KnownCVE("httpx", "0.23.0", "CVE-2023-32681", RiskLevel.MEDIUM,
                   "Leaking authorization headers on cross-origin redirects"),
    ]

    def check_known_cves(self, sbom: SkillSBOM) -> list[CVEAlert]:
        """Return CVE alerts for components with known vulnerabilities."""
        alerts: list[CVEAlert] = []
        for comp in sbom.components:
            if comp.type != ComponentType.PYTHON_PACKAGE or not comp.version:
                continue
            name_lower = comp.name.lower().replace("-", "").replace("_", "")
            for cve in self.KNOWN_CVES:
                cve_name = cve.package.replace("-", "").replace("_", "")
                if name_lower != cve_name:
                    continue
                try:
                    if Version(comp.version) < Version(cve.below):
                        alerts.append(CVEAlert(
                            component=comp.name,
                            cve_id=cve.cve_id,
                            severity=cve.severity,
                            description=cve.description,
                            fix_version=cve.below,
                        ))
                except Exception:
                    log.warning("cve.version_parse_error", component=comp.name, version=comp.version)
        return alerts


# ---------------------------------------------------------------------------
# Export helpers
# ---------------------------------------------------------------------------


def export_cyclonedx_json(sbom: SkillSBOM) -> dict[str, Any]:
    """Export SBOM to CycloneDX 1.4 JSON format.

    Example::

        cdx = export_cyclonedx_json(sbom)
        assert cdx["bomFormat"] == "CycloneDX"
    """
    components = []
    for c in sbom.components:
        entry: dict[str, Any] = {
            "type": "library",
            "name": c.name,
            "purl": c.purl,
        }
        if c.version:
            entry["version"] = c.version
        components.append(entry)

    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.4",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": sbom.skill_name,
                "version": sbom.skill_version,
            },
            "timestamp": sbom.generated_at.isoformat(),
        },
        "components": components,
    }


def export_spdx_json(sbom: SkillSBOM) -> dict[str, Any]:
    """Export SBOM to SPDX 2.3 JSON format.

    Example::

        spdx = export_spdx_json(sbom)
        assert spdx["spdxVersion"] == "SPDX-2.3"
    """
    packages = []
    for c in sbom.components:
        pkg: dict[str, Any] = {
            "SPDXID": f"SPDXRef-{c.name}",
            "name": c.name,
            "downloadLocation": "NOASSERTION",
            "externalRefs": [
                {
                    "referenceCategory": "PACKAGE-MANAGER",
                    "referenceType": "purl",
                    "referenceLocator": c.purl,
                }
            ],
        }
        if c.version:
            pkg["versionInfo"] = c.version
        packages.append(pkg)

    return {
        "spdxVersion": "SPDX-2.3",
        "dataLicense": "CC0-1.0",
        "SPDXID": "SPDXRef-DOCUMENT",
        "name": sbom.skill_name,
        "documentNamespace": f"https://amc.dev/spdx/{sbom.skill_name}",
        "creationInfo": {
            "created": sbom.generated_at.isoformat(),
            "creators": ["Tool: amc-shield-s4"],
        },
        "packages": packages,
    }
