"""Category-aware parsing of raw torrent release titles.

Unlike shows/library.py's filename parser (which works on on-disk file paths
during a library scan), this operates on the raw title strings returned by
search indexers — e.g. "Show.Name.S01E02.1080p.WEB-DL.x264-GROUP" — to
extract structured fields the Discover UI can group/badge/dedupe on.
"""
from __future__ import annotations

import re

# Torznab category codes (see DiscoverPage.tsx SEARCH_CATEGORIES)
TV_CATEGORIES = {5000}
ANIME_CATEGORIES = {5070}
MOVIE_CATEGORIES = {2000}

_RESOLUTION_RE = re.compile(r"\b(480p|576p|720p|1080p|1440p|2160p|4k)\b", re.IGNORECASE)
_CODEC_RE = re.compile(r"\b(x264|x265|h\.?264|h\.?265|hevc|avc|av1|xvid|divx)\b", re.IGNORECASE)
_SOURCE_RE = re.compile(
    r"\b(web[.\-]?dl|webrip|web|bluray|blu-ray|bdrip|brrip|dvdrip|dvdscr|hdtv|hdrip|"
    r"remux|hdcam|cam|telesync|ts|r5|pdtv)\b",
    re.IGNORECASE,
)
_AUDIO_RE = re.compile(
    r"\b(aac|ac3|eac3|dts-hd|dts|truehd|flac|mp3|dd5\.1|dd7\.1|atmos)\b",
    re.IGNORECASE,
)

_SE_RE = re.compile(r"\bS(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))?\b", re.IGNORECASE)
_XSERIES_RE = re.compile(r"\b(\d{1,2})x(\d{2,3})\b")
_SEASON_ONLY_RE = re.compile(r"\bS(\d{1,2})\b(?!\s*[Ee]\d)", re.IGNORECASE)
_ANIME_EP_RE = re.compile(r"-\s*(\d{2,4})\s*(?:v\d+)?\s*(?:\[|\(|$)")
_YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")

# Studio-branded, date-coded releases with no season/episode concept at all —
# e.g. "Studio.26.08.29.Scene.Title.1080p...", "ShowName 2026 08 29 HDTV...".
# Separator can be a dot/dash/underscore/space (indexers return either raw
# scene-style dotted titles or human-readable space-separated ones).
# Requires all three numeric groups (day+month validated) so it doesn't
# false-positive on things like resolution/audio tags (e.g. "dd5.1").
_DATE_RE = re.compile(
    r"\b(?P<y>(?:19|20)\d{2}|\d{2})[.\-_\s](?P<mo>0[1-9]|1[0-2])[.\-_\s](?P<da>0[1-9]|[12]\d|3[01])\b"
)

_FANSUB_LEADING_RE = re.compile(r"^\s*\[([^\]]+)\]")
_GROUP_TRAILING_RE = re.compile(r"-([A-Za-z0-9][A-Za-z0-9.]*?)(?:\.[a-zA-Z0-9]{2,4})?\s*(?:\[[^\]]*\])?$")

_JUNK_TAGS = re.compile(
    r"\b(480p|576p|720p|1080p|1440p|2160p|4k|"
    r"x264|x265|h\.?264|h\.?265|hevc|avc|av1|xvid|divx|"
    r"web[.\-]?dl|webrip|web|bluray|blu-ray|bdrip|brrip|dvdrip|dvdscr|hdtv|hdrip|"
    r"remux|hdcam|cam|telesync|proper|repack|extended|unrated|directors.cut|10bit|"
    r"aac|ac3|eac3|dts-hd|dts|truehd|flac|mp3|dd5\.1|dd7\.1|atmos)\b",
    re.IGNORECASE,
)
_VIDEO_EXT_RE = re.compile(r"\.(mkv|mp4|avi|m4v|ts|webm|mov)$", re.IGNORECASE)


def _extract_group(title: str, is_anime: bool) -> str | None:
    stripped = title.strip()
    if is_anime or stripped.startswith("["):
        m = _FANSUB_LEADING_RE.match(stripped)
        if m:
            return m.group(1).strip()
    m = _GROUP_TRAILING_RE.search(stripped)
    if m:
        candidate = m.group(1)
        if not _RESOLUTION_RE.fullmatch(candidate) and not _CODEC_RE.fullmatch(candidate):
            return candidate
    return None


def _normalize_for_grouping(title: str) -> str:
    # Season/episode/year are carried separately in the group key, and the
    # release group + quality/codec/source tags differ release-to-release
    # for the *same* episode — all of that needs stripping here so that two
    # quality variants of one episode land on the same normalized title.
    name = _VIDEO_EXT_RE.sub("", title.strip())
    m = _GROUP_TRAILING_RE.search(name)
    if m and not _RESOLUTION_RE.fullmatch(m.group(1)) and not _CODEC_RE.fullmatch(m.group(1)):
        name = name[: m.start()]
    name = _DATE_RE.sub(" ", name)  # must run before dots become spaces below
    # _JUNK_TAGS has a few dot-containing tokens (dd5.1, h.264, directors.cut)
    # that only match while dots are still literal dots, so strip it first.
    name = _JUNK_TAGS.sub("", name)
    name = re.sub(r"[._]", " ", name)
    name = re.sub(r"^\s*\[[^\]]*\]\s*", "", name)  # leading [Group]
    name = _SE_RE.sub("", name)
    name = _XSERIES_RE.sub("", name)
    name = _SEASON_ONLY_RE.sub("", name)
    name = _YEAR_RE.sub("", name)
    name = re.sub(r"[\[\](){}]", " ", name)
    name = re.sub(r"[\s\-]+", " ", name).strip().lower()
    return name


def parse_release_title(title: str, categories: list[int] | None = None) -> dict:
    """Extract season/episode/quality/group info from a raw release title.

    `categories` (torznab codes) bias which season/episode strategy is tried
    first — it's a hint, not a filter, so parsing still degrades gracefully
    when it's absent or wrong.
    """
    cats = set(categories or [])
    is_anime = bool(cats & ANIME_CATEGORIES)
    is_movie_only = bool(cats & MOVIE_CATEGORIES) and not (cats & (TV_CATEGORIES | ANIME_CATEGORIES))

    result: dict = {
        "season": None,
        "episode": None,
        "episode_end": None,
        "year": None,
        "resolution": None,
        "codec": None,
        "source": None,
        "audio": None,
        "group": None,
        "studio": None,
        "release_date": None,
        "normalized_title": None,
    }

    if not is_movie_only:
        m = _SE_RE.search(title)
        if m:
            result["season"] = int(m.group(1))
            result["episode"] = int(m.group(2))
            if m.group(3):
                result["episode_end"] = int(m.group(3))
        elif is_anime:
            m = _ANIME_EP_RE.search(title)
            if m:
                result["season"] = 1
                result["episode"] = int(m.group(1))
            else:
                m = _XSERIES_RE.search(title)
                if m:
                    result["season"] = int(m.group(1))
                    result["episode"] = int(m.group(2))
        else:
            m = _XSERIES_RE.search(title)
            if m:
                result["season"] = int(m.group(1))
                result["episode"] = int(m.group(2))

        if result["episode"] is None:
            m = _SEASON_ONLY_RE.search(title)
            if m:
                result["season"] = int(m.group(1))

    if result["episode"] is None and result["season"] is None:
        # Studio-branded, date-coded content (e.g. "Studio.26.08.29.Title...")
        # has no season/episode — the date itself is the episode identity, and
        # whatever precedes it is usually a studio/show name.
        dm = _DATE_RE.search(title)
        if dm:
            y = dm.group("y")
            year_full = int(y) if len(y) == 4 else 2000 + int(y)
            result["release_date"] = f"{year_full:04d}-{dm.group('mo')}-{dm.group('da')}"
            result["year"] = year_full
            prefix = re.sub(r"[._]", " ", title[: dm.start()]).strip(" .-_")
            prefix = re.sub(r"\s+", " ", prefix)
            if prefix:
                result["studio"] = prefix
        else:
            m = _YEAR_RE.search(title)
            if m:
                result["year"] = int(m.group(1))

    m = _RESOLUTION_RE.search(title)
    if m:
        result["resolution"] = m.group(1).lower()
    m = _CODEC_RE.search(title)
    if m:
        result["codec"] = m.group(1).lower().replace(".", "")
    m = _SOURCE_RE.search(title)
    if m:
        result["source"] = m.group(1).lower()
    m = _AUDIO_RE.search(title)
    if m:
        result["audio"] = m.group(1).lower()

    result["group"] = _extract_group(title, is_anime)
    result["normalized_title"] = _normalize_for_grouping(title)

    return result
