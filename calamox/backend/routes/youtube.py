"""YouTube routes — metadata parsing, upload jobs, and upload status."""


from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .. import youtube_automation

router = APIRouter()


class UploadRequest(BaseModel):
    video_path: str
    title: str
    description: str = ""
    tags: list[str] = []
    visibility: str = "private"


class MetadataRequest(BaseModel):
    video_path: str


@router.get("/check")
async def check():
    """Check which YouTube automation engines are available."""
    return await youtube_automation.get_browser_status()


@router.post("/metadata")
async def parse_metadata(req: MetadataRequest):
    """Parse a local video file's metadata via ffprobe."""
    return await youtube_automation.parse_video_metadata(req.video_path)


@router.post("/upload")
async def upload_video(req: UploadRequest):
    """Queue a video upload as a background job."""
    return await youtube_automation.start_upload(
        video_path=req.video_path,
        title=req.title,
        description=req.description,
        tags=req.tags,
        visibility=req.visibility,
    )


@router.get("/jobs")
async def list_jobs(limit: int = Query(20, ge=1, le=100)):
    """List recent upload jobs."""
    return {"jobs": youtube_automation.list_jobs(limit), "total": len(youtube_automation.list_jobs(limit))}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get a single upload job's status."""
    job = youtube_automation.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return job
