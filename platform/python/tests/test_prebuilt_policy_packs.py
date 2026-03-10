"""Tests for pre-built compliance policy packs."""
from __future__ import annotations

from amc.watch.prebuilt_policy_packs import (
    nist_ai_rmf_policy_pack,
    soc2_policy_pack,
    iso42001_policy_pack,
    gdpr_policy_pack,
    mitre_atlas_policy_pack,
    owasp_api_top10_policy_pack,
    get_all_prebuilt_packs,
)
from amc.watch.w10_policy_packs import PolicyPackRegistry


def test_nist_ai_rmf_pack_valid():
    pack = nist_ai_rmf_policy_pack()
    assert pack.name == "NIST AI RMF 1.0"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 4
    assert pack.verify_digest()
    assert "nist" in pack.tags
    assert "ai-rmf" in pack.tags


def test_soc2_pack_valid():
    pack = soc2_policy_pack()
    assert pack.name == "SOC 2 Type II"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 5
    assert pack.verify_digest()
    assert "soc2" in pack.tags
    assert "trust-services" in pack.tags


def test_iso42001_pack_valid():
    pack = iso42001_policy_pack()
    assert pack.name == "ISO/IEC 42001:2023"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 6
    assert pack.verify_digest()
    assert "iso42001" in pack.tags
    assert "ai-management" in pack.tags


def test_gdpr_pack_valid():
    pack = gdpr_policy_pack()
    assert pack.name == "GDPR Data Protection"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 12
    assert pack.verify_digest()
    assert "gdpr" in pack.tags
    assert "data-protection" in pack.tags


def test_mitre_atlas_pack_valid():
    pack = mitre_atlas_policy_pack()
    assert pack.name == "MITRE ATLAS"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 6
    assert pack.verify_digest()
    assert "mitre-atlas" in pack.tags
    assert "adversarial-ml" in pack.tags


def test_owasp_api_top10_pack_valid():
    pack = owasp_api_top10_policy_pack()
    assert pack.name == "OWASP API Security Top 10 (2023)"
    assert pack.version == "1.0"
    assert len(pack.modules) >= 5
    assert len(pack.rules) >= 7
    assert pack.verify_digest()
    assert "owasp" in pack.tags
    assert "api-security" in pack.tags


def test_all_packs_installable():
    reg = PolicyPackRegistry()
    packs = get_all_prebuilt_packs()
    assert len(packs) == 6
    
    for pack in packs:
        pack_id = reg.install(pack)
        assert pack_id == pack.pack_id
        assert pack.verify_digest()
    
    assert len(reg.list()) == 6


def test_all_packs_activatable():
    reg = PolicyPackRegistry()
    packs = get_all_prebuilt_packs()
    
    for pack in packs:
        pack_id = reg.install(pack)
        reg.activate(pack_id)
        active = reg.active()
        assert active is not None
        assert active.pack_id == pack_id
        assert active.name == pack.name


def test_marketplace_scan_passes_for_prebuilt():
    reg = PolicyPackRegistry()
    for pack in get_all_prebuilt_packs():
        reg.install(pack)
    
    result = reg.run_marketplace_scan()
    assert result.passed
    assert result.risk_score == 0
    assert len(result.findings) == 0
