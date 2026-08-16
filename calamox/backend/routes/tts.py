"""TTS routes — natural multilingual speech synthesis via Edge-TTS (optional).

The dashboard prefers these voices (natural, no artificial accents) over the
browser's built-in speechSynthesis. If `edge-tts` is not installed the route
returns 501 and the frontend falls back to the Web Speech API.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    lang: str = "en-IN"  # en-IN or hi-IN


# Edge-TTS voice names (natural, non-accented)
VOICE_MAP = {
    "en-IN": "en-IN-PrabhatNeural",
    "hi-IN": "hi-IN-MadhurNeural",
    "en-US": "en-US-AriaNeural",
}


@router.post("")
async def synthesize(req: TTSRequest):
    """Synthesize speech for the given text and language, returning audio/mpeg."""
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    voice = VOICE_MAP.get(req.lang, VOICE_MAP["en-IN"])

    try:
        import edge_tts
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Edge-TTS not installed. Run: pip install edge-tts (or pip install -e '.[voice]')",
        )

    try:
        communicate = edge_tts.Communicate(text, voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Edge-TTS synthesis failed: {e}")

    if not audio:
        raise HTTPException(status_code=502, detail="Edge-TTS produced no audio")

    from fastapi.responses import Response

    return Response(content=bytes(audio), media_type="audio/mpeg")
