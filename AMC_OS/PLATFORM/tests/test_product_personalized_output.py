"""Tests for amc.product.personalized_output — Personalized Output Styles."""
from __future__ import annotations
import pytest

from amc.product.personalized_output import (
    Tone,
    OutputLength,
    OutputFormat,
    StyleProfileInput,
    StyleProfileUpdateInput,
    ApplyStyleInput,
    PersonalizedOutputManager,
    apply_style_to_text,
)


@pytest.fixture()
def mgr(tmp_path):
    return PersonalizedOutputManager(db_path=tmp_path / "output.db")


def _make_profile(tenant_id="t1", recipient_id="r1", **kwargs):
    return StyleProfileInput(
        tenant_id=tenant_id,
        recipient_id=recipient_id,
        display_name="Test User",
        **kwargs,
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def test_create_profile(mgr):
    profile = mgr.create_profile(_make_profile(
        tone=Tone.CASUAL, length=OutputLength.SHORT,
        format=OutputFormat.PROSE,
        avoid_words=["utilize", "synergy"],
        prefer_words={"utilize": "use"},
    ))
    assert profile.profile_id
    assert profile.tone == Tone.CASUAL.value
    assert profile.length == OutputLength.SHORT.value
    assert "utilize" in profile.avoid_words
    assert profile.prefer_words["utilize"] == "use"
    assert profile.active is True


def test_create_duplicate_raises(mgr):
    mgr.create_profile(_make_profile())
    with pytest.raises(ValueError, match="already exists"):
        mgr.create_profile(_make_profile())


def test_get_profile(mgr):
    p = mgr.create_profile(_make_profile())
    fetched = mgr.get_profile(p.profile_id)
    assert fetched.profile_id == p.profile_id


def test_get_profile_none(mgr):
    assert mgr.get_profile("bad-id") is None


def test_get_profile_for_recipient(mgr):
    p = mgr.create_profile(_make_profile(tenant_id="t1", recipient_id="alice"))
    fetched = mgr.get_profile_for_recipient("t1", "alice")
    assert fetched.profile_id == p.profile_id


def test_update_profile(mgr):
    p = mgr.create_profile(_make_profile(tone=Tone.CASUAL))
    updated = mgr.update_profile(StyleProfileUpdateInput(
        profile_id=p.profile_id,
        tone=Tone.FORMAL,
        avoid_words=["leverage"],
    ))
    assert updated.tone == Tone.FORMAL.value
    assert "leverage" in updated.avoid_words


def test_deactivate_profile(mgr):
    p = mgr.create_profile(_make_profile())
    updated = mgr.update_profile(StyleProfileUpdateInput(
        profile_id=p.profile_id, active=False
    ))
    assert updated.active is False


def test_list_profiles(mgr):
    mgr.create_profile(_make_profile(recipient_id="r1"))
    mgr.create_profile(_make_profile(recipient_id="r2"))
    mgr.create_profile(StyleProfileInput(tenant_id="t2", recipient_id="r3"))
    result = mgr.list_profiles("t1")
    assert len(result) == 2


def test_list_profiles_active_only(mgr):
    p = mgr.create_profile(_make_profile(recipient_id="r1"))
    mgr.create_profile(_make_profile(recipient_id="r2"))
    mgr.update_profile(StyleProfileUpdateInput(profile_id=p.profile_id, active=False))
    active = mgr.list_profiles("t1", active_only=True)
    assert len(active) == 1


def test_delete_profile(mgr):
    p = mgr.create_profile(_make_profile())
    result = mgr.delete_profile(p.profile_id)
    assert result is True
    assert mgr.get_profile(p.profile_id) is None


def test_delete_unknown_profile(mgr):
    assert mgr.delete_profile("nonexistent") is False


# ---------------------------------------------------------------------------
# Style application
# ---------------------------------------------------------------------------

def test_apply_word_substitution(mgr):
    p = mgr.create_profile(_make_profile(
        avoid_words=["utilize"],
        prefer_words={"utilize": "use"},
    ))
    result = mgr.apply_style(ApplyStyleInput(
        profile_id=p.profile_id,
        text="We will utilize this system to its full potential.",
    ))
    assert "use" in result.output_text
    assert "utilize" not in result.output_text
    assert any(t["type"] == "word_substitution" for t in result.transformations)


def test_apply_length_truncation(mgr):
    p = mgr.create_profile(_make_profile(length=OutputLength.BRIEF))
    long_text = " ".join(["word"] * 100)
    result = mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text=long_text))
    word_count = len(result.output_text.replace("…", "").split())
    assert word_count <= 35  # some tolerance for ellipsis


def test_apply_bullets_format(mgr):
    p = mgr.create_profile(_make_profile(format=OutputFormat.BULLETS))
    text = "First sentence. Second sentence. Third sentence."
    result = mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text=text))
    assert "•" in result.output_text


def test_apply_numbered_format(mgr):
    p = mgr.create_profile(_make_profile(format=OutputFormat.NUMBERED))
    text = "First point. Second point. Third point."
    result = mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text=text))
    assert "1." in result.output_text


def test_apply_executive_format(mgr):
    p = mgr.create_profile(_make_profile(format=OutputFormat.EXECUTIVE))
    text = "This is the summary. Supporting detail here. More context."
    result = mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text=text))
    assert "TL;DR" in result.output_text


def test_apply_salutation_and_signoff(mgr):
    p = mgr.create_profile(_make_profile(
        salutation="Hi there,", sign_off="Best regards,"
    ))
    result = mgr.apply_style(ApplyStyleInput(
        profile_id=p.profile_id, text="Here is your update."
    ))
    assert "Hi there," in result.output_text
    assert "Best regards," in result.output_text


def test_apply_style_inactive_raises(mgr):
    p = mgr.create_profile(_make_profile())
    mgr.update_profile(StyleProfileUpdateInput(profile_id=p.profile_id, active=False))
    with pytest.raises(ValueError, match="inactive"):
        mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text="test"))


def test_apply_style_records_history(mgr):
    p = mgr.create_profile(_make_profile())
    mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text="Text A"))
    mgr.apply_style(ApplyStyleInput(profile_id=p.profile_id, text="Text B"))
    history = mgr.get_application_history(p.profile_id)
    assert len(history) == 2


def test_apply_style_no_record(mgr):
    p = mgr.create_profile(_make_profile())
    mgr.apply_style(ApplyStyleInput(
        profile_id=p.profile_id, text="Text", record_application=False
    ))
    history = mgr.get_application_history(p.profile_id)
    assert len(history) == 0


# ---------------------------------------------------------------------------
# Pure function tests
# ---------------------------------------------------------------------------

def test_pure_apply_style_to_text(mgr):
    from amc.product.personalized_output import StyleProfileRecord
    profile = StyleProfileRecord(
        profile_id="p1", tenant_id="t1", recipient_id="r1",
        display_name="Test", tone="professional", length="medium",
        format="prose", language="en", salutation="",
        sign_off="", avoid_words=["bad_word"],
        prefer_words={"bad_word": "good_word"},
        custom_rules=[], active=True, metadata={},
        created_at="2026-01-01", updated_at="2026-01-01",
    )
    text = "This is a bad_word example."
    result, transforms = apply_style_to_text(text, profile)
    assert "good_word" in result
    assert "bad_word" not in result
