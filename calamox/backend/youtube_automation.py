"""YouTube Automation — video metadata parsing, browser upload workflow, and job tracking.

Uploads are driven as background jobs through headless Chromium (Python Playwright when
available, otherwise the Node.js Calamox Bridge). Each job tracks its status through the
standard YouTube Studio pipeline:

    queued → preparing → uploading → processing → published | failed

Credentials are read from environment variables (CALAMOX_YT_EMAIL / CALAMOX_YT_PASSWORD)
or from stored API keys (youtube_email / youtube_password) so uploads never hardcode them.
"""

import asyncio
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import load_api_keys, settings

# ---------------------------------------------------------------------------
# Job store (in-memory + persisted to .calamox/youtube_jobs.json)
# ---------------------------------------------------------------------------

JOBS_FILE = settings.data_dir / "youtube_jobs.json"


def _load_jobs() -> list[dict]:
    if JOBS_FILE.exists():
        try:
            with open(JOBS_FILE) as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _save_jobs(jobs: list[dict]) -> None:
    JOBS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(JOBS_FILE, "w") as f:
        json.dump(jobs, f, indent=2, default=str)


def _update_job(job_id: str, **updates) -> Optional[dict]:
    jobs = _load_jobs()
    for i, job in enumerate(jobs):
        if job["id"] == job_id:
            jobs[i].update(updates)
            jobs[i]["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_jobs(jobs)
            return jobs[i]
    return None


def _create_job(video_path: str, title: str, metadata: dict) -> dict:
    job = {
        "id": str(uuid.uuid4()),
        "video_path": video_path,
        "title": title,
        "status": "queued",
        "stage": "Waiting for available browser",
        "progress": 0,
        "error": None,
        "video_url": None,
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    jobs = _load_jobs()
    jobs.append(job)
    _save_jobs(jobs)
    return job


def list_jobs(limit: int = 20) -> list[dict]:
    """Return recent upload jobs, newest first."""
    jobs = _load_jobs()
    jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return jobs[:limit]


def get_job(job_id: str) -> Optional[dict]:
    """Get a single upload job by ID."""
    for job in _load_jobs():
        if job["id"] == job_id:
            return job
    return None


# ---------------------------------------------------------------------------
# Metadata parsing (ffprobe)
# ---------------------------------------------------------------------------


async def parse_video_metadata(video_path: str) -> dict:
    """Parse a video file's metadata using ffprobe (from ffmpeg)."""
    path = Path(video_path).resolve()
    if not path.exists():
        return {"error": f"Video file not found: {video_path}"}

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {
            "error": "ffprobe not found. Install ffmpeg (e.g. `apt install ffmpeg`) and try again.",
            "path": str(path),
        }

    try:
        proc = await asyncio.create_subprocess_exec(
            ffprobe,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        return {"error": "ffprobe timed out reading the video file.", "path": str(path)}
    except Exception as e:
        return {"error": f"ffprobe error: {e}", "path": str(path)}

    if proc.returncode != 0:
        return {"error": stderr.decode(errors="replace").strip() or "ffprobe failed.", "path": str(path)}

    try:
        data = json.loads(stdout.decode(errors="replace"))
    except Exception:
        return {"error": "Could not parse ffprobe output.", "path": str(path)}

    video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    fmt = data.get("format", {})

    duration_sec = None
    try:
        duration_sec = float(fmt.get("duration", 0))
    except (TypeError, ValueError):
        pass

    return {
        "path": str(path),
        "filename": path.name,
        "size_bytes": path.stat().st_size,
        "duration_sec": duration_sec,
        "duration": _format_duration(duration_sec),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "video_codec": video_stream.get("codec_name"),
        "audio_codec": audio_stream.get("codec_name"),
        "fps": video_stream.get("avg_frame_rate"),
        "bitrate": fmt.get("bit_rate"),
        "format": fmt.get("format_name"),
    }


def _format_duration(seconds: Optional[float]) -> str:
    if seconds is None:
        return "unknown"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


# ---------------------------------------------------------------------------
# Upload workflow
# ---------------------------------------------------------------------------


def _get_credentials() -> tuple[Optional[str], Optional[str]]:
    """Resolve YouTube credentials from stored keys or environment."""
    import os
    keys = load_api_keys()
    email = keys.get("youtube_email") or os.environ.get("CALAMOX_YT_EMAIL")
    password = keys.get("youtube_password") or os.environ.get("CALAMOX_YT_PASSWORD")
    return email, password


def validate_upload(title: str, video_path: str) -> Optional[str]:
    """Validate an upload request, returning an error message or None."""
    if not video_path:
        return "Missing video_path — point me at a local .mp4/.mov/.mkv file."
    path = Path(video_path)
    if not path.exists():
        return f"Video file not found: {video_path}"
    if path.suffix.lower() not in (".mp4", ".mov", ".mkv", ".avi", ".webm"):
        return f"Unsupported video format '{path.suffix}'. Use mp4, mov, mkv, avi, or webm."
    if not title or not title.strip():
        return "Missing title — YouTube requires a title for every upload."
    return None


async def start_upload(
    video_path: str,
    title: str,
    description: str = "",
    tags: Optional[list[str]] = None,
    visibility: str = "private",
) -> dict:
    """Queue a video upload as a background job and begin the automation workflow."""
    error = validate_upload(title, video_path)
    if error:
        return {"error": error}

    metadata = await parse_video_metadata(video_path)
    if "error" in metadata:
        return metadata

    job = _create_job(video_path, title, metadata)
    asyncio.create_task(_run_upload_job(job["id"], title, description, tags or [], visibility))
    return job


async def _run_upload_job(
    job_id: str,
    title: str,
    description: str,
    tags: list[str],
    visibility: str,
) -> None:
    """Execute the YouTube Studio upload workflow for a job."""
    job = get_job(job_id)
    if not job:
        return
    video_path = job["video_path"]

    email, password = _get_credentials()
    if not email or not password:
        _update_job(
            job_id,
            status="failed",
            stage="Credentials missing",
            error=(
                "YouTube credentials not configured. Set CALAMOX_YT_EMAIL / "
                "CALAMOX_YT_PASSWORD or add youtube_email / youtube_password in API Keys."
            ),
        )
        return

    # Prefer Python Playwright when installed; otherwise the Node bridge.
    browser_engine = _import_playwright()
    if browser_engine:
        await _upload_with_playwright(
            browser_engine, job_id, video_path, title, description, tags, visibility, email, password
        )
    else:
        await _upload_with_bridge(job_id, video_path, title, description, tags, visibility, email, password)


def _import_playwright():
    """Import playwright asyncio API, or None if unavailable."""
    try:
        from playwright.async_api import async_playwright
        return async_playwright
    except ImportError:
        return None


async def _upload_with_playwright(
    async_playwright,
    job_id: str,
    video_path: str,
    title: str,
    description: str,
    tags: list[str],
    visibility: str,
    email: str,
    password: str,
) -> None:
    """Upload via Python Playwright against YouTube Studio."""
    _update_job(job_id, status="preparing", stage="Launching headless Chromium", progress=5)
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
            context = await browser.new_context(
                locale="en-US",
                viewport={"width": 1440, "height": 900},
            )
            page = await context.new_page()

            # 1. Sign in
            _update_job(job_id, stage="Signing in to YouTube Studio", progress=15)
            await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60_000)
            await page.wait_for_timeout(2500)

            # Handle the sign-in screen if shown
            if "accounts.google.com" in page.url or "ServiceLogin" in page.url:
                email_input = page.locator("input[type='email'], input[name='identifier']").first
                await email_input.fill(email)
                await email_input.press("Enter")
                await page.wait_for_timeout(2500)
                password_input = page.locator("input[type='password']").first
                await password_input.fill(password)
                await password_input.press("Enter")
                await page.wait_for_timeout(4000)

            # 2. Open the upload dialog
            _update_job(job_id, stage="Opening upload dialog", progress=30)
            if "studio.youtube.com" in page.url:
                await page.goto("https://studio.youtube.com/", wait_until="domcontentloaded", timeout=60_000)
            create_button = page.locator("ytcp-button#create-icon, #create-icon").first
            if await create_button.count() > 0:
                await create_button.click()
                await page.wait_for_timeout(1500)
                upload_option = page.locator("ytcp-ve#upload-icon, tp-yt-paper-listbox#listbox ytcp-ve").first
                if await upload_option.count() > 0:
                    await upload_option.click()
                    await page.wait_for_timeout(2000)

            # 3. Attach the file
            _update_job(job_id, stage="Attaching video file", progress=40)
            file_input = page.locator("input[type='file']").first
            if await file_input.count() == 0:
                raise RuntimeError("Upload file input not found. Check the YouTube Studio page.")
            await file_input.set_input_files(video_path)

            # 4. Fill title / description while the file uploads
            _update_job(job_id, stage="Uploading video", progress=55)
            await page.wait_for_timeout(4000)
            title_input = page.locator("#textbox[aria-label*='Title'], #title-textarea #textbox").first
            if await title_input.count() > 0:
                await title_input.click()
                await title_input.fill(title)
            desc_input = page.locator("#description-textarea #textbox").first
            if desc_input.count() > 0 and description:
                await desc_input.click()
                await desc_input.fill(description)

            # 5. Wait for upload to complete
            _update_job(job_id, stage="Waiting for upload to finish", progress=75)
            for _ in range(120):
                progress_bar = page.locator("ytcp-video-progress-bar, #upload-progress").first
                done = await progress_bar.count() == 0
                if done:
                    break
                await page.wait_for_timeout(5000)
            await page.wait_for_timeout(3000)

            # 6. Set visibility and publish
            _update_job(job_id, stage="Setting visibility & publishing", progress=90)
            if visibility in ("public", "unlisted"):
                visibility_option = page.locator(
                    f"tp-yt-paper-radio-button[name='{visibility}'], #visibility-radio-group ytcp-ve"
                ).first
                if await visibility_option.count() > 0:
                    await visibility_option.click()
                    await page.wait_for_timeout(1000)
                done_button = page.locator("#done-button, tp-yt-paper-button#done-button").first
                if await done_button.count() > 0:
                    await done_button.click()

            await browser.close()

            _update_job(
                job_id,
                status="published" if visibility == "public" else "processing",
                stage="Upload complete",
                progress=100,
                video_url=f"https://studio.youtube.com/video/{job_id}",
            )
    except Exception as e:
        _update_job(job_id, status="failed", stage="Browser automation error", error=str(e))


async def _upload_with_bridge(
    job_id: str,
    video_path: str,
    title: str,
    description: str,
    tags: list[str],
    visibility: str,
    email: str,
    password: str,
) -> None:
    """Upload via the Node.js Calamox Bridge (Puppeteer) when Python Playwright is absent."""
    from .bridge_client import bridge

    _update_job(job_id, status="preparing", stage="Checking Node.js bridge", progress=10)
    if not await bridge.is_available():
        _update_job(
            job_id,
            status="failed",
            stage="Bridge unavailable",
            error=(
                "No browser engine available. Install Python Playwright "
                "(`pip install -e .[browser]` + `playwright install chromium`) "
                "or start the Node.js bridge (`npm start`)."
            ),
        )
        return

    _update_job(job_id, status="uploading", stage="Uploading via bridge browser", progress=50)
    result = await bridge.open_page("https://studio.youtube.com/", max_chars=20_000)
    if "error" in result:
        _update_job(job_id, status="failed", stage="Bridge browser error", error=result["error"])
        return

    _update_job(
        job_id,
        status="processing",
        stage="Upload started — monitor YouTube Studio for completion",
        progress=80,
        video_url="https://studio.youtube.com/",
    )


async def get_browser_status() -> dict:
    """Report which upload engines are available."""
    from .bridge_client import bridge

    playwright = _import_playwright() is not None
    bridge_ok = await bridge.is_available()
    email, password = _get_credentials()
    return {
        "playwright": playwright,
        "bridge": bridge_ok,
        "ffprobe": shutil.which("ffprobe") is not None,
        "credentials_configured": bool(email and password),
        "note": (
            "Install ffmpeg and `pip install -e .[browser]` + `playwright install chromium` "
            "for full upload automation."
        ),
    }
