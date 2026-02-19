"""
AMC Shield — S1: Skill Static Analyzer ("ToxicSkill" Linter)
Scans a skill directory for dangerous patterns before agent load time.

Flags: remote fetch-and-execute, obfuscated commands, dynamic eval,
       credential harvesting, hidden persistence, over-broad permission claims.

Usage:
    analyzer = SkillAnalyzer()
    result = analyzer.scan_directory("/path/to/skill/")
    print(result.risk_score)    # 0–100
    print(result.risk_level)    # safe / low / medium / high / critical
    for f in result.findings:
        print(f.rule_id, f.title, f.evidence)

    # CLI:
    # amc shield scan /path/to/skill/
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import structlog

from amc.core.models import Finding, RiskLevel, ScanResult, score_to_risk

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Analyzer Rules
# ---------------------------------------------------------------------------

@dataclass
class AnalyzerRule:
    id: str
    title: str
    description: str
    risk_level: RiskLevel
    pattern: re.Pattern
    applies_to_extensions: set[str] | None = None  # None = all text files
    remediation: str = ""
    false_positive_likelihood: float = 0.0


_F = re.IGNORECASE | re.MULTILINE

SKILL_RULES: list[AnalyzerRule] = [
    # --- Fetch-and-execute (most dangerous) ---
    AnalyzerRule(
        id="S1-001", risk_level=RiskLevel.CRITICAL,
        title="Remote fetch-and-execute (curl|bash pattern)",
        description="Downloads and immediately executes remote code — classic supply chain attack vector",
        pattern=re.compile(
            r"(curl|wget|fetch)\s+['\"]?https?://[^\s'\"|)]+['\"]?\s*\|+\s*(bash|sh|zsh|python\d?|node|ruby|perl)",
            _F,
        ),
        remediation="Never pipe remote downloads directly to a shell. Download first, inspect, then run explicitly.",
    ),
    AnalyzerRule(
        id="S1-002", risk_level=RiskLevel.CRITICAL,
        title="eval() of remotely fetched content",
        description="Fetches content from a URL and eval()s it — allows arbitrary code execution from remote",
        pattern=re.compile(
            r"eval\s*\(\s*(await\s+)?(fetch|request|http|urllib|axios|got)\s*[\(\.]",
            _F,
        ),
        remediation="eval() of remote content is always dangerous. Avoid eval() entirely.",
    ),
    AnalyzerRule(
        id="S1-003", risk_level=RiskLevel.HIGH,
        title="Dynamic require/import of remote URL",
        description="Loads code from a remote URL rather than a local, pinned dependency",
        pattern=re.compile(
            r"(require|import)\s*\(\s*['\"]https?://",
            _F,
        ),
        remediation="Use local, version-pinned dependencies only. Bundle at publish time.",
    ),

    # --- Obfuscation ---
    AnalyzerRule(
        id="S1-010", risk_level=RiskLevel.HIGH,
        title="Base64-decoded execution",
        description="Decodes a base64 string and executes it — common obfuscation for payload delivery",
        pattern=re.compile(
            r"(atob|base64[_\-]?decode|b64decode)\s*\([^)]{10,}\)\s*[;,]?\s*"
            r"(\|+\s*(bash|sh)|eval\s*\(|exec\s*\()",
            _F,
        ),
        remediation="No reason for a legitimate skill to decode and execute base64 at runtime.",
    ),
    AnalyzerRule(
        id="S1-011", risk_level=RiskLevel.MEDIUM,
        title="Long base64 blob in code (potential hidden payload)",
        description="Large base64 strings embedded in code may contain hidden payloads",
        pattern=re.compile(
            r"['\"][A-Za-z0-9+/]{200,}={0,2}['\"]",
            _F,
        ),
        false_positive_likelihood=0.4,
        remediation="Legitimate base64 should be in data files, not hardcoded in scripts. Inspect manually.",
    ),
    AnalyzerRule(
        id="S1-012", risk_level=RiskLevel.MEDIUM,
        title="String obfuscation: fromCharCode / chr() chain",
        description="Builds strings from character codes — obfuscation technique",
        pattern=re.compile(
            r"String\.fromCharCode\s*\([^)]{30,}\)|"
            r"chr\s*\(\d+\)\s*\+\s*chr\s*\(\d+\)",
            _F,
        ),
        false_positive_likelihood=0.3,
        remediation="Inspect what string is being built. Legitimate code rarely needs this pattern.",
    ),

    # --- Credential harvesting ---
    AnalyzerRule(
        id="S1-020", risk_level=RiskLevel.CRITICAL,
        title="Reading environment variables with sensitive names",
        description="Reads API keys, secrets, or tokens from environment — could be exfiltrating credentials",
        pattern=re.compile(
            r"(process\.env|os\.environ|getenv)\s*[\[\.]\s*['\"]"
            r"(API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY)[^'\"]*['\"]",
            _F,
        ),
        false_positive_likelihood=0.2,
        remediation="Credentials should be passed via the AMC Secrets Broker (V1), not read from env directly.",
    ),
    AnalyzerRule(
        id="S1-021", risk_level=RiskLevel.HIGH,
        title="Sending data to undeclared external endpoint",
        description="Makes HTTP POST/PUT to an external URL not declared in the skill manifest",
        pattern=re.compile(
            r"(fetch|axios\.post|requests\.post|urllib\.\w+\.urlopen)\s*\(\s*['\"]https?://(?!localhost|127\.)",
            _F,
        ),
        false_positive_likelihood=0.3,
        remediation="All outbound endpoints must be declared in the skill permission manifest.",
    ),

    # --- Persistence ---
    AnalyzerRule(
        id="S1-030", risk_level=RiskLevel.HIGH,
        title="Writing to cron / startup files",
        description="Modifies cron tabs or system startup scripts — persistence mechanism",
        pattern=re.compile(
            r"(crontab\s+-[rl]|/etc/(crontab|cron\.\w+)|"
            r"~/.bashrc|~/.zshrc|~/.profile|"
            r"/etc/rc\.local|LaunchAgents)",
            _F,
        ),
        remediation="Skills should not modify startup or cron files. Declare scheduling needs in manifest.",
    ),
    AnalyzerRule(
        id="S1-031", risk_level=RiskLevel.MEDIUM,
        title="Writing files outside declared scope",
        description="Writes to paths not declared in the skill permission manifest",
        pattern=re.compile(
            r"(open|write|mkdir|os\.makedirs)\s*\(\s*['\"]/"
            r"(?!tmp|var/tmp|Users/[^/]+/\.openclaw/workspace)",
            _F,
        ),
        false_positive_likelihood=0.35,
        remediation="Declare all filesystem paths in the skill manifest and write only within scope.",
    ),

    # --- Privilege escalation ---
    AnalyzerRule(
        id="S1-040", risk_level=RiskLevel.CRITICAL,
        title="sudo or privilege escalation commands",
        description="Runs commands as root — extremely dangerous in untrusted skills",
        pattern=re.compile(r"\bsudo\b|\bsu\s+-\b|\bdoas\b|\bpkexec\b", _F),
        remediation="Skills must never use sudo. Declare required permissions in manifest.",
    ),
    AnalyzerRule(
        id="S1-041", risk_level=RiskLevel.HIGH,
        title="chmod 777 or world-writable permission changes",
        description="Makes files world-writable — security misconfiguration",
        pattern=re.compile(r"chmod\s+(777|a\+[rwx]+|o\+w)", _F),
        remediation="Never set world-writable permissions. Use minimal file permissions.",
    ),

    # --- SKILL.md specific checks ---
    AnalyzerRule(
        id="S1-050", risk_level=RiskLevel.HIGH,
        title="SKILL.md: Undeclared capability claim",
        description="SKILL.md description implies capabilities not matched by a formal manifest",
        applies_to_extensions={"md"},
        pattern=re.compile(
            r"(shell|exec|execute|filesystem|network|browser|cron|schedule|"
            r"send\s+message|read\s+files?|write\s+files?)",
            _F,
        ),
        false_positive_likelihood=0.6,  # many legit mentions
        remediation="Ensure all capability claims in SKILL.md are formally declared in permission manifest.",
    ),
    AnalyzerRule(
        id="S1-051", risk_level=RiskLevel.MEDIUM,
        title="SKILL.md: Instruction to override agent security",
        description="SKILL.md contains instructions to bypass or disable agent security controls",
        applies_to_extensions={"md"},
        pattern=re.compile(
            r"(disable|bypass|ignore|skip)\s+(security|safety|policy|guardrail|filter)",
            _F,
        ),
        remediation="Any skill that instructs security bypass is malicious by definition.",
    ),
]


# ---------------------------------------------------------------------------
# Manifest Checker (S6 integration)
# ---------------------------------------------------------------------------

DANGEROUS_CAPABILITIES = {
    "shell_exec", "browser_control", "cron_scheduling",
    "config_change", "outbound_network", "messaging_send",
}

def check_manifest(manifest_path: Path) -> list[Finding]:
    """Parse a skill's permission manifest and flag undeclared/dangerous capabilities."""
    findings: list[Finding] = []
    if not manifest_path.exists():
        findings.append(Finding(
            module="s1_analyzer",
            rule_id="S1-M001",
            title="Missing permission manifest",
            description="No permission manifest found. Cannot verify declared capabilities.",
            risk_level=RiskLevel.HIGH,
            remediation="Add a skill_manifest.json declaring all required capabilities.",
        ))
        return findings

    import json
    try:
        with manifest_path.open() as f:
            manifest = json.load(f)
    except json.JSONDecodeError as exc:
        findings.append(Finding(
            module="s1_analyzer",
            rule_id="S1-M002",
            title="Malformed permission manifest",
            description=f"skill_manifest.json is not valid JSON: {exc}",
            risk_level=RiskLevel.HIGH,
        ))
        return findings

    declared = set(manifest.get("capabilities", []))
    for cap in declared:
        if cap in DANGEROUS_CAPABILITIES:
            findings.append(Finding(
                module="s1_analyzer",
                rule_id="S1-M010",
                title=f"High-risk capability declared: {cap}",
                description=f"Skill declares '{cap}' — requires elevated scrutiny",
                risk_level=RiskLevel.HIGH,
                remediation=f"Verify '{cap}' is genuinely required. Grant with least-privilege scope.",
            ))

    return findings


# ---------------------------------------------------------------------------
# Skill Analyzer
# ---------------------------------------------------------------------------

TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".sh", ".bash", ".zsh", ".rb", ".pl",
    ".go", ".rs", ".php", ".lua", ".yml", ".yaml", ".json",
    ".toml", ".md", ".txt", ".env", ".cfg", ".ini", ".conf",
}

MAX_FILE_SIZE = 1 * 1024 * 1024  # 1 MB


class SkillAnalyzer:
    """
    Static analyzer for skill directories.
    Scans all text files for dangerous patterns.
    """

    def __init__(
        self,
        rules: list[AnalyzerRule] | None = None,
        max_file_size: int = MAX_FILE_SIZE,
    ) -> None:
        self.rules = rules if rules is not None else SKILL_RULES
        self.max_file_size = max_file_size

    def scan_directory(self, skill_path: str | Path) -> ScanResult:
        """Scan an entire skill directory and return aggregate results."""
        path = Path(skill_path)
        start = time.monotonic()
        all_findings: list[Finding] = []
        scanned_files = 0

        if not path.exists() or not path.is_dir():
            return ScanResult(
                module="s1_analyzer",
                target=str(skill_path),
                risk_score=0,
                risk_level=RiskLevel.SAFE,
                findings=[Finding(
                    module="s1_analyzer",
                    rule_id="S1-ERR001",
                    title="Skill directory not found",
                    description=f"Path does not exist or is not a directory: {skill_path}",
                    risk_level=RiskLevel.MEDIUM,
                )],
                passed=False,
            )

        # Check for manifest
        manifest_path = path / "skill_manifest.json"
        all_findings.extend(check_manifest(manifest_path))

        # Scan all text files
        for file_path in path.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            if file_path.stat().st_size > self.max_file_size:
                continue

            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue

            scanned_files += 1
            findings = self.scan_content(
                content=content,
                file_path=str(file_path.relative_to(path)),
                extension=file_path.suffix.lstrip(".").lower(),
            )
            all_findings.extend(findings)

        # Compute aggregate risk score
        risk_weights = {
            RiskLevel.SAFE: 0,
            RiskLevel.LOW: 5,
            RiskLevel.MEDIUM: 20,
            RiskLevel.HIGH: 40,
            RiskLevel.CRITICAL: 80,
        }
        score = min(100, sum(
            risk_weights[f.risk_level] * (1 - f.false_positive_likelihood)
            for f in all_findings
        ))
        score = int(score)
        risk_level = score_to_risk(score)
        duration_ms = int((time.monotonic() - start) * 1000)

        log.info(
            "skill_analyzer.complete",
            path=str(skill_path),
            files=scanned_files,
            findings=len(all_findings),
            score=score,
            risk=risk_level,
        )

        return ScanResult(
            module="s1_analyzer",
            target=str(skill_path),
            risk_score=score,
            risk_level=risk_level,
            findings=sorted(all_findings, key=lambda f: ["safe","low","medium","high","critical"].index(f.risk_level.value), reverse=True),
            passed=score < 40,
            duration_ms=duration_ms,
            metadata={"files_scanned": scanned_files},
        )

    def scan_content(
        self, content: str, file_path: str = "", extension: str = ""
    ) -> list[Finding]:
        """Scan a single file's content. Returns findings."""
        findings: list[Finding] = []
        for rule in self.rules:
            if rule.applies_to_extensions and extension not in rule.applies_to_extensions:
                continue
            for match in rule.pattern.finditer(content):
                line_num = content[:match.start()].count("\n") + 1
                findings.append(Finding(
                    module="s1_analyzer",
                    rule_id=rule.id,
                    title=rule.title,
                    description=rule.description,
                    risk_level=rule.risk_level,
                    evidence=match.group(0)[:300],
                    line_number=line_num,
                    file_path=file_path,
                    remediation=rule.remediation,
                    false_positive_likelihood=rule.false_positive_likelihood,
                ))
                break  # one finding per rule per file (avoid noise)
        return findings
