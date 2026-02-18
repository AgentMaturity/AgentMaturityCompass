from __future__ import annotations

from amc.watch.w10_policy_packs import PolicyPack, PolicyPackRegistry, PackInstallError


def make_pack(name: str = "pack") -> PolicyPack:
    p = PolicyPack(
        name=name,
        version="1.0",
        description="test",
        modules=["e1", "w1"],
        rules=[{"id": "R1", "action": "deny", "target": "exec"}],
    ).with_digest()
    return p


def test_install_activate_and_list():
    reg = PolicyPackRegistry()
    pack = make_pack("a")
    pid = reg.install(pack)
    assert pid == pack.pack_id
    assert reg.list_ids() == [pid]
    reg.activate(pid)
    assert reg.active() is not None
    assert reg.active().pack_id == pid


def test_invalid_pack_rejected():
    reg = PolicyPackRegistry()
    p = make_pack("bad")
    # break digest
    p.name = "tampered"
    try:
        reg.install(p)
        assert False
    except PackInstallError:
        assert True


def test_marketplace_scan_reports_issues():
    reg = PolicyPackRegistry()
    p = make_pack("x")
    reg.install(p)
    res = reg.run_marketplace_scan()
    assert res.passed
    assert res.risk_score == 0
