"""AMC Shield package.

Contains static and prompt-injection defenses.
"""

from .s1_analyzer import AnalyzerRule, SkillAnalyzer
from .s10_detector import DetectorAction, DetectionRule, DetectorResult, InjectionDetector

__all__ = [
    "AnalyzerRule",
    "SkillAnalyzer",
    "DetectorAction",
    "DetectionRule",
    "DetectorResult",
    "InjectionDetector",
]
