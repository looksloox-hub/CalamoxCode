"""News Engine — aggregates news from RSS feeds with category and region filtering.

Each article is tagged with a best-effort `location` (name / lat / lng / region)
so the dashboard can render glowing hotspots on a world map. Locations are
inferred by matching country/city names and known publisher domains against a
small gazetteer — no external geocoding service required.
"""

from datetime import datetime, timezone
from typing import Optional

import feedparser
import httpx

# Default RSS feeds by category
DEFAULT_FEEDS = {
    "tech": [
        "https://hnrss.org/newest?points=100",
        "https://www.techmeme.com/feed.xml",
        "https://feeds.arstechnica.com/arstechnica/index",
    ],
    "ai": [
        "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+machine+learning",
        "https://news.ycombinator.com/rss",
    ],
    "world": [
        "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        "https://feeds.bbci.co.uk/news/world/rss.xml",
    ],
    "finance": [
        "https://finance.yahoo.com/rss/topfinstories",
        "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    ],
    "security": [
        "https://www.bleepingcomputer.com/feed/",
        "https://feeds.feedburner.com/TheHackersNews",
    ],
}

# (keyword, region name, lat, lng) — matched against title/summary/source.
# Keep it small but useful for the news map hotspots.
GEO_GAZETTEER = [
    ("united states", "United States", 39.8283, -98.5795),
    ("usa", "United States", 39.8283, -98.5795),
    ("new york", "New York", 40.7128, -74.0060),
    ("california", "California", 36.7783, -119.4179),
    ("silicon valley", "Silicon Valley", 37.4275, -122.1697),
    ("san francisco", "San Francisco", 37.7749, -122.4194),
    ("washington", "Washington D.C.", 38.9072, -77.0369),
    ("texas", "Texas", 31.9686, -99.9018),
    ("seattle", "Seattle", 47.6062, -122.3321),
    ("india", "India", 20.5937, 78.9629),
    ("new delhi", "New Delhi", 28.6139, 77.2090),
    ("mumbai", "Mumbai", 19.0760, 72.8777),
    ("bengaluru", "Bengaluru", 12.9716, 77.5946),
    ("china", "China", 35.8617, 104.1954),
    ("beijing", "Beijing", 39.9042, 116.4074),
    ("hong kong", "Hong Kong", 22.3193, 114.1694),
    ("shanghai", "Shanghai", 31.2304, 121.4737),
    ("japan", "Japan", 36.2048, 138.2529),
    ("tokyo", "Tokyo", 35.6762, 139.6503),
    ("south korea", "South Korea", 35.9078, 127.7669),
    ("seoul", "Seoul", 37.5665, 126.9780),
    ("ukraine", "Ukraine", 48.3794, 31.1656),
    ("kyiv", "Kyiv", 50.4501, 30.5234),
    ("russia", "Russia", 61.5240, 105.3188),
    ("moscow", "Moscow", 55.7558, 37.6173),
    ("europe", "Europe", 54.5260, 15.2551),
    ("united kingdom", "United Kingdom", 55.3781, -3.4360),
    ("london", "London", 51.5074, -0.1278),
    ("uk", "United Kingdom", 55.3781, -3.4360),
    ("germany", "Germany", 51.1657, 10.4515),
    ("berlin", "Berlin", 52.5200, 13.4050),
    ("france", "France", 46.2276, 2.2137),
    ("paris", "Paris", 48.8566, 2.3522),
    ("italy", "Italy", 41.8719, 12.5674),
    ("spain", "Spain", 40.4637, -3.7492),
    ("netherlands", "Netherlands", 52.1326, 5.2913),
    ("israel", "Israel", 31.0461, 34.8516),
    ("tel aviv", "Tel Aviv", 32.0853, 34.7818),
    ("middle east", "Middle East", 29.2985, 42.5510),
    ("iran", "Iran", 32.4279, 53.6880),
    ("saudi arabia", "Saudi Arabia", 23.8859, 45.0792),
    ("australia", "Australia", -25.2744, 133.7751),
    ("sydney", "Sydney", -33.8688, 151.2093),
    ("canada", "Canada", 56.1304, -106.3468),
    ("toronto", "Toronto", 43.6532, -79.3832),
    ("brazil", "Brazil", -14.2350, -51.9253),
    ("mexico", "Mexico", 23.6345, -102.5528),
    ("south africa", "South Africa", -30.5595, 22.9375),
    ("nigeria", "Nigeria", 9.0820, 8.6753),
    ("africa", "Africa", -8.7832, 34.5085),
    ("singapore", "Singapore", 1.3521, 103.8198),
    ("taiwan", "Taiwan", 23.6978, 120.9605),
    ("pakistan", "Pakistan", 30.3753, 69.3451),
    ("bangladesh", "Bangladesh", 23.6850, 90.3563),
    ("indonesia", "Indonesia", -0.7893, 113.9213),
    ("vietnam", "Vietnam", 14.0583, 108.2772),
    ("turkey", "Turkey", 38.9637, 35.2433),
    ("switzerland", "Switzerland", 46.8182, 8.2275),
    ("sweden", "Sweden", 60.1282, 18.6435),
    ("poland", "Poland", 51.9194, 19.1451),
    ("greece", "Greece", 39.0742, 21.8243),
    ("egypt", "Egypt", 26.8206, 30.8025),
    ("argentina", "Argentina", -38.4161, -63.6167),
    ("chile", "Chile", -35.6751, -71.5430),
]

# Known publisher domains → their home region (fallback when gazetteer misses)
SOURCE_LOCATIONS = {
    "nytimes": ("New York", 40.7128, -74.0060, "United States"),
    "bbc": ("London", 51.5074, -0.1278, "United Kingdom"),
    "cnbc": ("New York", 40.7128, -74.0060, "United States"),
    "yahoo": ("New York", 40.7128, -74.0060, "United States"),
    "techmeme": ("San Francisco", 37.7749, -122.4194, "United States"),
    "arstechnica": ("United States", 39.8283, -98.5795, "United States"),
    "bleepingcomputer": ("United States", 39.8283, -98.5795, "United States"),
    "hacker news": ("San Francisco", 37.7749, -122.4194, "United States"),
    "thehackersnews": ("United States", 39.8283, -98.5795, "United States"),
}


def _match_location(text: str) -> Optional[dict]:
    """Find the first gazetteer match in a blob of text."""
    low = text.lower()
    for keyword, name, lat, lng in GEO_GAZETTEER:
        if keyword in low:
            return {"name": name, "lat": lat, "lng": lng, "region": name}
    return None


def attach_location(entry: dict) -> dict:
    """Tag an article with best-effort geographic coordinates."""
    haystack = " ".join(
        filter(None, [entry.get("title", ""), entry.get("summary", ""), entry.get("source", "")])
    )
    loc = _match_location(haystack)

    if not loc:
        source = (entry.get("source") or "").lower()
        for domain, (name, lat, lng, region) in SOURCE_LOCATIONS.items():
            if domain in source:
                loc = {"name": name, "lat": lat, "lng": lng, "region": region}
                break

    entry["location"] = loc
    entry["region"] = loc["region"] if loc else None
    return entry


async def fetch_feed(url: str, limit: int = 10) -> list[dict]:
    """Fetch and parse a single RSS feed."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            feed = feedparser.parse(resp.text)
    except Exception:
        feed = feedparser.parse(url)

    entries = []
    for entry in feed.entries[:limit]:
        published = ""
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            try:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                published = getattr(entry, "published", "")

        entries.append({
            "title": getattr(entry, "title", ""),
            "url": getattr(entry, "link", ""),
            "summary": getattr(entry, "summary", "")[:500],
            "published": published,
            "source": feed.feed.get("title", url),
        })
    return entries


async def get_news(
    categories: Optional[list[str]] = None,
    region: Optional[str] = None,
    limit_per_feed: int = 5,
    total_limit: int = 50,
) -> dict:
    """Aggregate news from multiple feeds across categories, optionally filtered by region."""
    if categories is None:
        categories = list(DEFAULT_FEEDS.keys())

    all_entries = []
    for category in categories:
        feeds = DEFAULT_FEEDS.get(category, [])
        for feed_url in feeds:
            try:
                entries = await fetch_feed(feed_url, limit=limit_per_feed)
                for entry in entries:
                    entry["category"] = category
                all_entries.extend(entries)
            except Exception:
                pass

    # Sort by published date (newest first), remove duplicates
    seen_urls = set()
    unique = []
    for entry in all_entries:
        if entry["url"] and entry["url"] not in seen_urls:
            seen_urls.add(entry["url"])
            unique.append(attach_location(entry))

    if region:
        region_low = region.strip().lower()
        unique = [e for e in unique if e.get("region") and e["region"].lower() == region_low]

    unique.sort(key=lambda x: x.get("published", ""), reverse=True)

    return {
        "categories": categories,
        "region": region,
        "total": len(unique[:total_limit]),
        "articles": unique[:total_limit],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_news_by_category(category: str, limit: int = 20) -> dict:
    """Get news for a single category."""
    return await get_news(categories=[category], total_limit=limit)
