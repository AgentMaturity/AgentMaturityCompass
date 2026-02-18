from __future__ import annotations

from amc.watch.w9_multi_tenant_verifier import MultiTenantBoundaryVerifier, TenantBoundaryState, CrossTenantViolation


def test_within_tenant_allowed():
    state = TenantBoundaryState()
    state.set_owner("doc1", "tenant-a")
    v = MultiTenantBoundaryVerifier(state)
    r = v.check_access("tenant-a", "doc1", action="read")
    assert r.allowed
    assert r.risk.value == "safe"


def test_cross_tenant_denied_without_approval():
    state = TenantBoundaryState()
    state.set_owner("doc2", "tenant-a")
    v = MultiTenantBoundaryVerifier(state)
    r = v.check_access("tenant-b", "doc2", action="read")
    assert not r.allowed
    assert r.risk.value == "critical"


def test_cross_tenant_requires_approval_to_allow():
    state = TenantBoundaryState()
    state.set_owner("doc3", "tenant-a")
    v = MultiTenantBoundaryVerifier(state)
    r = v.check_access("tenant-b", "doc3", action="read", approved=True)
    assert r.allowed
    assert r.risk.value == "high"


def test_enforce_raises():
    state = TenantBoundaryState()
    state.set_owner("doc4", "tenant-a")
    v = MultiTenantBoundaryVerifier(state)
    try:
        v.enforce({"tenant_id": "tenant-b", "resource_id": "doc4", "action": "read"})
    except CrossTenantViolation:
        assert True
    else:
        assert False
