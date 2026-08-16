"""News routes — aggregated news feeds."""

from typing import Optional

from fastapi import APIRouter, Query

from ..news_engine import get_news, get_news_by_category

router = APIRouter()


@router.get("")
async def list_news(
    categories: Optional[str] = Query(None, description="Comma-separated categories"),
    region: Optional[str] = Query(None, description="Filter by region name (e.g. 'India', 'United States')"),
    limit: int = Query(30, ge=1, le=100),
):
    """Get aggregated news. Categories: tech, ai, world, finance, security."""
    cats = [c.strip() for c in categories.split(",")] if categories else None
    return await get_news(categories=cats, region=region, total_limit=limit)


@router.get("/{category}")
async def category_news(category: str, limit: int = Query(20, ge=1, le=100)):
    """Get news for a single category."""
    return await get_news_by_category(category, limit=limit)


@router.get("/categories/available")
async def available_categories():
    """List available news categories."""
    from ..news_engine import DEFAULT_FEEDS
    return {"categories": list(DEFAULT_FEEDS.keys())}
