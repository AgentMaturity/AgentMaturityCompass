"""Tests for amc.product.white_label — White-Label Agency Launcher."""
from __future__ import annotations
import pytest

from amc.product.white_label import (
    EnvironmentStatus,
    BrandingConfig,
    TemplateCreateInput,
    TemplateUpdateInput,
    EnvironmentProvisionInput,
    BrandingAssetInput,
    WhiteLabelManager,
)


@pytest.fixture()
def mgr(tmp_path):
    return WhiteLabelManager(db_path=tmp_path / "white_label.db")


def _make_template(agency_id="agency-1", name="Default Template", **kwargs):
    return TemplateCreateInput(
        agency_id=agency_id,
        name=name,
        description="Test template",
        branding=BrandingConfig(
            primary_color="#1a73e8",
            brand_name="TestCo",
            support_email="support@testco.com",
        ),
        feature_flags={"email_campaigns": True, "analytics": False},
        default_config={"max_jobs_per_day": 100},
        **kwargs,
    )


def _make_env(
    agency_id="agency-1",
    template_id=None,
    client_id="client-001",
    client_name="Client Corp",
    **kwargs
):
    return EnvironmentProvisionInput(
        agency_id=agency_id,
        template_id=template_id or "",
        client_id=client_id,
        client_name=client_name,
        domain=f"client.amc.io",
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def test_create_template(mgr):
    t = mgr.create_template(_make_template())
    assert t.template_id
    assert t.agency_id == "agency-1"
    assert t.branding["primary_color"] == "#1a73e8"
    assert t.branding["brand_name"] == "TestCo"
    assert t.feature_flags["email_campaigns"] is True
    assert t.default_config["max_jobs_per_day"] == 100
    assert t.active is True


def test_create_duplicate_template_raises(mgr):
    mgr.create_template(_make_template())
    with pytest.raises(ValueError, match="already exists"):
        mgr.create_template(_make_template())


def test_get_template(mgr):
    t = mgr.create_template(_make_template())
    fetched = mgr.get_template(t.template_id)
    assert fetched.template_id == t.template_id


def test_get_unknown_template(mgr):
    assert mgr.get_template("bad-id") is None


def test_update_template_branding(mgr):
    t = mgr.create_template(_make_template())
    updated = mgr.update_template(TemplateUpdateInput(
        template_id=t.template_id,
        branding=BrandingConfig(primary_color="#ff0000", brand_name="NewBrand"),
        feature_flags={"email_campaigns": True, "analytics": True},
    ))
    assert updated.branding["primary_color"] == "#ff0000"
    assert updated.feature_flags["analytics"] is True


def test_deactivate_template(mgr):
    t = mgr.create_template(_make_template())
    updated = mgr.update_template(TemplateUpdateInput(
        template_id=t.template_id, active=False
    ))
    assert updated.active is False


def test_list_templates(mgr):
    mgr.create_template(_make_template(name="T1"))
    mgr.create_template(_make_template(name="T2"))
    mgr.create_template(_make_template(agency_id="agency-2", name="T3"))
    result = mgr.list_templates("agency-1")
    assert len(result) == 2
    assert all(t.agency_id == "agency-1" for t in result)


def test_list_templates_active_only(mgr):
    t1 = mgr.create_template(_make_template(name="T1"))
    mgr.create_template(_make_template(name="T2"))
    mgr.update_template(TemplateUpdateInput(template_id=t1.template_id, active=False))
    active = mgr.list_templates("agency-1", active_only=True)
    assert len(active) == 1


# ---------------------------------------------------------------------------
# Environments
# ---------------------------------------------------------------------------

def test_provision_environment(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    assert env.env_id
    assert env.agency_id == "agency-1"
    assert env.client_id == "client-001"
    assert env.status == EnvironmentStatus.DRAFT.value
    assert env.tenant_id.startswith("wl-")
    # Branding inherited from template
    assert env.branding["brand_name"] == "TestCo"
    # Feature flags inherited
    assert env.feature_flags["email_campaigns"] is True


def test_provision_with_branding_overrides(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(EnvironmentProvisionInput(
        agency_id="agency-1",
        template_id=tmpl.template_id,
        client_id="client-002",
        client_name="Custom Client",
        branding_overrides=BrandingConfig(
            primary_color="#00ff00", brand_name="CustomBrand"
        ),
        feature_flag_overrides={"analytics": True},
    ))
    assert env.branding["primary_color"] == "#00ff00"
    assert env.feature_flags["analytics"] is True


def test_provision_duplicate_client_raises(mgr):
    tmpl = mgr.create_template(_make_template())
    mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    with pytest.raises(ValueError, match="already exists"):
        mgr.provision_environment(_make_env(template_id=tmpl.template_id))


def test_provision_inactive_template_raises(mgr):
    tmpl = mgr.create_template(_make_template())
    mgr.update_template(TemplateUpdateInput(template_id=tmpl.template_id, active=False))
    with pytest.raises(ValueError, match="not active"):
        mgr.provision_environment(_make_env(template_id=tmpl.template_id))


def test_activate_environment(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    activated = mgr.activate_environment(env.env_id)
    assert activated.status == EnvironmentStatus.ACTIVE.value
    assert activated.provisioned_at is not None


def test_suspend_environment(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    mgr.activate_environment(env.env_id)
    suspended = mgr.suspend_environment(env.env_id, reason="Payment overdue")
    assert suspended.status == EnvironmentStatus.SUSPENDED.value
    assert suspended.suspended_at is not None


def test_terminate_environment(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    terminated = mgr.terminate_environment(env.env_id)
    assert terminated.status == EnvironmentStatus.TERMINATED.value
    assert terminated.terminated_at is not None


def test_get_environment_by_tenant(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    fetched = mgr.get_environment_by_tenant(env.tenant_id)
    assert fetched is not None
    assert fetched.env_id == env.env_id


def test_list_environments(mgr):
    tmpl = mgr.create_template(_make_template())
    mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c1", client_name="C1"
    ))
    mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c2", client_name="C2"
    ))
    result = mgr.list_environments("agency-1")
    assert len(result) == 2


def test_list_environments_by_status(mgr):
    tmpl = mgr.create_template(_make_template())
    e1 = mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c1", client_name="C1"
    ))
    mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c2", client_name="C2"
    ))
    mgr.activate_environment(e1.env_id)
    active = mgr.list_environments("agency-1", status=EnvironmentStatus.ACTIVE.value)
    assert len(active) == 1
    assert active[0].env_id == e1.env_id


# ---------------------------------------------------------------------------
# Branding assets
# ---------------------------------------------------------------------------

def test_upsert_branding_asset(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    asset = mgr.upsert_branding_asset(BrandingAssetInput(
        env_id=env.env_id,
        asset_type="color",
        key="primary",
        value="#abcdef",
    ))
    assert asset.asset_id
    assert asset.value == "#abcdef"


def test_upsert_branding_asset_updates_existing(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    mgr.upsert_branding_asset(BrandingAssetInput(
        env_id=env.env_id, asset_type="color", key="primary", value="#111111"
    ))
    updated = mgr.upsert_branding_asset(BrandingAssetInput(
        env_id=env.env_id, asset_type="color", key="primary", value="#222222"
    ))
    assert updated.value == "#222222"
    assets = mgr.list_branding_assets(env.env_id)
    assert len(assets) == 1


def test_list_branding_assets(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    mgr.upsert_branding_asset(BrandingAssetInput(env_id=env.env_id, asset_type="color", key="primary", value="#aaa"))
    mgr.upsert_branding_asset(BrandingAssetInput(env_id=env.env_id, asset_type="logo", key="main", value="https://logo.com/logo.png"))
    all_assets = mgr.list_branding_assets(env.env_id)
    assert len(all_assets) == 2
    color_assets = mgr.list_branding_assets(env.env_id, asset_type="color")
    assert len(color_assets) == 1


# ---------------------------------------------------------------------------
# Provision log
# ---------------------------------------------------------------------------

def test_provision_log_on_lifecycle(mgr):
    tmpl = mgr.create_template(_make_template())
    env = mgr.provision_environment(_make_env(template_id=tmpl.template_id))
    mgr.activate_environment(env.env_id)
    mgr.suspend_environment(env.env_id, reason="Test")
    log = mgr.get_provision_log(env.env_id)
    event_types = [e.event_type for e in log]
    assert "provisioned" in event_types
    assert "activated" in event_types
    assert "suspended" in event_types


def test_data_isolation_tenant_ids_unique(mgr):
    """Verify each environment gets a unique tenant_id."""
    tmpl = mgr.create_template(_make_template())
    e1 = mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c1", client_name="C1"
    ))
    e2 = mgr.provision_environment(_make_env(
        template_id=tmpl.template_id, client_id="c2", client_name="C2"
    ))
    assert e1.tenant_id != e2.tenant_id
