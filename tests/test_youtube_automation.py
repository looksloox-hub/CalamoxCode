"""Tests for the YouTube automation module (metadata, validation, jobs)."""


from calamox.backend import youtube_automation as yt


def test_validate_upload_missing_path():
    err = yt.validate_upload("My video", "")
    assert err and "video_path" in err


def test_validate_upload_missing_title(tmp_path):
    f = tmp_path / "video.mp4"
    f.write_bytes(b"fake")
    err = yt.validate_upload("", str(f))
    assert err and "title" in err


def test_validate_upload_unsupported_extension(tmp_path):
    f = tmp_path / "video.txt"
    f.write_text("not a video")
    err = yt.validate_upload("My video", str(f))
    assert err and "Unsupported video format" in err


def test_validate_upload_missing_file():
    err = yt.validate_upload("My video", "/nonexistent/video.mp4")
    assert err and "not found" in err


async def test_parse_video_metadata_missing_file():
    result = await yt.parse_video_metadata("/nonexistent/video.mp4")
    assert "error" in result
    assert "not found" in result["error"]


def test_format_duration():
    assert yt._format_duration(None) == "unknown"
    assert yt._format_duration(90) == "1m 30s"
    assert yt._format_duration(3661) == "1h 1m 1s"


def test_list_jobs_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(yt, "JOBS_FILE", tmp_path / "youtube_jobs.json")
    assert yt.list_jobs() == []


def test_job_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(yt, "JOBS_FILE", tmp_path / "youtube_jobs.json")
    job = yt._create_job("/tmp/video.mp4", "Test upload", {"duration": "1m"})
    assert job["status"] == "queued"

    updated = yt._update_job(job["id"], status="uploading", stage="Uploading video", progress=50)
    assert updated["status"] == "uploading"
    assert updated["progress"] == 50

    fetched = yt.get_job(job["id"])
    assert fetched["title"] == "Test upload"
    assert yt.get_job("does-not-exist") is None

    jobs = yt.list_jobs()
    assert len(jobs) == 1
    assert jobs[0]["id"] == job["id"]


async def test_get_browser_status_shape():
    """Status reports engine availability without requiring network/browser."""
    status = await yt.get_browser_status()
    assert "playwright" in status
    assert "bridge" in status
    assert "ffprobe" in status
    assert "credentials_configured" in status
