"""Tests for amc.product.portal — Self-Serve Portal."""
from __future__ import annotations
import pytest

from amc.product.portal import (
    JobStatus,
    JobSubmitInput,
    JobStatusUpdateInput,
    ProgressEventInput,
    ResultFileInput,
    PortalManager,
)


@pytest.fixture()
def portal(tmp_path):
    return PortalManager(db_path=tmp_path / "portal.db")


# ---------------------------------------------------------------------------
# Job submission
# ---------------------------------------------------------------------------

def test_submit_job(portal):
    job = portal.submit_job(JobSubmitInput(
        tenant_id="t1", submitter_id="user-1",
        job_type="email_campaign", title="Q1 Campaign",
        payload={"template": "q1", "count": 200}, priority=7
    ))
    assert job.job_id
    assert job.status == JobStatus.SUBMITTED.value
    assert job.tenant_id == "t1"
    assert job.priority == 7
    assert job.payload["count"] == 200


def test_get_job(portal):
    job = portal.submit_job(JobSubmitInput(
        tenant_id="t1", submitter_id="u1", job_type="report"
    ))
    fetched = portal.get_job(job.job_id)
    assert fetched is not None
    assert fetched.job_id == job.job_id


def test_get_unknown_job_returns_none(portal):
    assert portal.get_job("nonexistent") is None


def test_list_jobs_by_tenant(portal):
    portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="a"))
    portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="b"))
    portal.submit_job(JobSubmitInput(tenant_id="t2", submitter_id="u2", job_type="c"))
    jobs = portal.list_jobs(tenant_id="t1")
    assert len(jobs) == 2
    assert all(j.tenant_id == "t1" for j in jobs)


def test_list_jobs_by_status(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    portal.update_status(JobStatusUpdateInput(
        job_id=job.job_id, new_status=JobStatus.QUEUED
    ))
    queued = portal.list_jobs(status=JobStatus.QUEUED.value)
    assert any(j.job_id == job.job_id for j in queued)


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

def test_valid_transitions(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    job = portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.QUEUED))
    assert job.status == JobStatus.QUEUED.value
    job = portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.RUNNING, progress_pct=10.0))
    assert job.status == JobStatus.RUNNING.value
    assert job.started_at is not None
    job = portal.update_status(JobStatusUpdateInput(
        job_id=job.job_id, new_status=JobStatus.COMPLETED,
        result={"rows": 42}, progress_pct=100.0
    ))
    assert job.status == JobStatus.COMPLETED.value
    assert job.completed_at is not None
    assert job.result["rows"] == 42


def test_invalid_transition_raises(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    with pytest.raises(ValueError, match="Cannot transition"):
        portal.update_status(JobStatusUpdateInput(
            job_id=job.job_id, new_status=JobStatus.COMPLETED
        ))


def test_cancel_job(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    cancelled = portal.cancel_job(job.job_id, reason="User request")
    assert cancelled.status == JobStatus.CANCELLED.value


def test_failed_job(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.QUEUED))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.RUNNING))
    result = portal.update_status(JobStatusUpdateInput(
        job_id=job.job_id, new_status=JobStatus.FAILED,
        error_detail="Timeout exceeded"
    ))
    assert result.status == JobStatus.FAILED.value
    assert result.error_detail == "Timeout exceeded"


# ---------------------------------------------------------------------------
# Progress events
# ---------------------------------------------------------------------------

def test_record_progress(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.QUEUED))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.RUNNING))

    ev = portal.record_progress(ProgressEventInput(
        job_id=job.job_id, progress_pct=50.0, message="Halfway done",
        details={"processed": 100}
    ))
    assert ev.progress_pct == 50.0
    assert ev.message == "Halfway done"

    # Job should also be updated
    updated = portal.get_job(job.job_id)
    assert updated.progress_pct == 50.0


def test_get_progress_events(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.QUEUED))
    portal.update_status(JobStatusUpdateInput(job_id=job.job_id, new_status=JobStatus.RUNNING))
    portal.record_progress(ProgressEventInput(job_id=job.job_id, progress_pct=25.0))
    portal.record_progress(ProgressEventInput(job_id=job.job_id, progress_pct=75.0))
    events = portal.get_progress_events(job.job_id)
    assert len(events) == 2
    assert events[0].progress_pct == 25.0
    assert events[1].progress_pct == 75.0


# ---------------------------------------------------------------------------
# Result files
# ---------------------------------------------------------------------------

def test_attach_and_list_result_files(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    f1 = portal.attach_result_file(ResultFileInput(
        job_id=job.job_id, filename="report.pdf",
        content_type="application/pdf", size_bytes=102400,
        storage_ref="s3://bucket/report.pdf", checksum="sha256:abc123"
    ))
    assert f1.filename == "report.pdf"
    assert f1.size_bytes == 102400

    f2 = portal.attach_result_file(ResultFileInput(
        job_id=job.job_id, filename="data.csv",
        content_type="text/csv", size_bytes=2048,
        storage_ref="s3://bucket/data.csv",
    ))
    files = portal.list_result_files(job.job_id)
    assert len(files) == 2
    names = {f.filename for f in files}
    assert names == {"report.pdf", "data.csv"}


def test_result_files_empty_for_new_job(portal):
    job = portal.submit_job(JobSubmitInput(tenant_id="t1", submitter_id="u1", job_type="x"))
    assert portal.list_result_files(job.job_id) == []
