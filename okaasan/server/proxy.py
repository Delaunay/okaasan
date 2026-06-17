"""Lightweight HTTP proxy for fetching external URLs from the frontend.

The browser can't fetch arbitrary URLs due to CORS restrictions.
This endpoint lets the frontend ask the server to fetch on its behalf.
Only URLs from an explicit allowlist are proxied.
"""
from __future__ import annotations

import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("okaasan.proxy")

router = APIRouter(prefix="/proxy", tags=["proxy"])

ALLOWED_HOSTS = frozenset({
    "download.pytorch.org",
    "data.pyg.org",
    "pypi.org",
    "api.github.com",
    "wheels.vllm.ai",
    "pypi.amd.com",
    "repo.amd.com",
    "docs.nvidia.com",
})

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "okaasan-proxy/1.0"},
        )
    return _client


@router.get("/fetch")
async def proxy_fetch(url: str = Query(..., description="URL to fetch")):
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_HOSTS:
        raise HTTPException(400, f"Host not allowed: {parsed.hostname}")
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, f"Scheme not allowed: {parsed.scheme}")

    client = _get_client()
    try:
        resp = await client.get(url)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, f"Upstream returned {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Failed to reach upstream: {exc}")

    content_type = resp.headers.get("content-type", "text/plain")
    return {
        "status": resp.status_code,
        "content_type": content_type,
        "body": resp.text,
    }
