"""Browser Engine — web fetching, content extraction, and page summarization.

Uses the Node.js Calamox Bridge for Puppeteer operations when available,
falls back to httpx + BeautifulSoup otherwise.
"""


from .bridge_client import bridge


async def fetch_url(url: str, timeout: int = 30) -> dict:
    """Fetch a URL via the bridge (full browser) or httpx (simple fetch)."""
    # Try bridge first for full browser rendering
    if await bridge.is_available():
        result = await bridge.open_page(url, max_chars=500_000)
        if "error" not in result:
            result["source"] = "bridge"
            return result
        # Bridge failed, fall through to httpx

    # Fallback: simple httpx fetch
    import httpx
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        headers={"User-Agent": "Calamox/1.0 (AI Assistant)"},
    ) as client:
        try:
            response = await client.get(url)
            content_type = response.headers.get("content-type", "")
            return {
                "url": str(response.url),
                "status_code": response.status_code,
                "content_type": content_type,
                "text": response.text[:500_000] if "html" in content_type or "json" in content_type else None,
                "content_length": len(response.content),
                "source": "httpx",
            }
        except httpx.HTTPError as e:
            return {"url": url, "error": str(e), "source": "httpx"}


async def extract_content(url: str, max_chars: int = 50_000) -> dict:
    """Extract readable content from a URL via bridge or BeautifulSoup."""
    # Try bridge first
    if await bridge.is_available():
        result = await bridge.open_page(url, max_chars=max_chars)
        if "error" not in result:
            result["source"] = "bridge"
            return result

    # Fallback: httpx + BeautifulSoup
    import httpx
    from bs4 import BeautifulSoup

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=30,
            headers={"User-Agent": "Calamox/1.0"},
        ) as client:
            response = await client.get(url)
            html = response.text
    except Exception as e:
        return {"url": url, "error": str(e)}

    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "aside", "iframe", "noscript"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    meta_desc = ""
    meta_tag = soup.find("meta", attrs={"name": "description"})
    if meta_tag and meta_tag.get("content"):
        meta_desc = meta_tag["content"]

    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = main.get_text(separator="\n", strip=True) if main else ""
    text = text[:max_chars]

    links = []
    for a in soup.find_all("a", href=True)[:100]:
        href = a["href"]
        link_text = a.get_text(strip=True)[:200]
        if href.startswith(("http://", "https://")):
            links.append({"text": link_text, "url": href})

    return {
        "url": str(response.url),
        "title": title,
        "meta_description": meta_desc,
        "text": text,
        "links": links,
        "content_length": len(html),
        "source": "httpx",
    }


async def summarize_url(url: str, max_chars: int = 30_000) -> dict:
    """Fetch and summarize a URL's content."""
    content = await extract_content(url, max_chars=max_chars)
    if "error" in content:
        return content

    text = content.get("text", "")
    paragraphs = [p.strip() for p in text.split("\n") if len(p.strip()) > 30]
    summary_paragraphs = paragraphs[:10]

    word_count = len(text.split())
    return {
        "url": content.get("url", url),
        "title": content.get("title", ""),
        "summary": "\n\n".join(summary_paragraphs),
        "word_count": word_count,
        "paragraph_count": len(paragraphs),
        "links_count": len(content.get("links", [])),
        "source": content.get("source", "unknown"),
    }
