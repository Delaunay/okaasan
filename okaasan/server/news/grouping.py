"""Group similar news articles across sources.

Uses keyword overlap on titles to find articles covering the same story.
No ML dependencies — pure Python string similarity.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

log = logging.getLogger("okaasan.news.grouping")

_STOP_WORDS = frozenset(
    "a an and are as at be by for from has have he her his how i if in is it "
    "its me my no not of on or our she so that the their them then there these "
    "they this to us was we were what when where which who will with you your "
    "says said after also been new more than into over about up out just can do "
    "would could should may very most some all any much many".split()
)

_MIN_KEYWORD_LEN = 3
_SIMILARITY_THRESHOLD = 0.35
_TIME_WINDOW_HOURS = 48


def _tokenize(text: str) -> set[str]:
    """Extract meaningful lowercase keywords from text."""
    words = re.findall(r"[a-zA-Z']+", text.lower())
    return {
        w for w in words
        if len(w) >= _MIN_KEYWORD_LEN and w not in _STOP_WORDS
    }


def _similarity(a: set[str], b: set[str]) -> float:
    """Jaccard-like similarity weighted toward smaller set overlap."""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    smaller = min(len(a), len(b))
    return intersection / smaller if smaller else 0.0


def group_recent_articles(session_factory, hours: int = _TIME_WINDOW_HOURS) -> int:
    """Group ungrouped articles from the last *hours* by title similarity.

    Returns the number of newly grouped articles.
    """
    from .models import NewsArticle, NewsGroup

    db: Session = session_factory()
    grouped_count = 0

    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        ungrouped = (
            db.query(NewsArticle)
            .filter(
                NewsArticle.group_id.is_(None),
                NewsArticle.published_at >= cutoff,
            )
            .order_by(NewsArticle.published_at.desc())
            .all()
        )

        if not ungrouped:
            return 0

        existing_groups: list[tuple[int, set[str], list[int]]] = []
        rows_with_groups = (
            db.query(NewsArticle)
            .filter(
                NewsArticle.group_id.isnot(None),
                NewsArticle.published_at >= cutoff,
            )
            .all()
        )
        group_tokens: dict[int, set[str]] = defaultdict(set)
        group_sources: dict[int, set[int]] = defaultdict(set)
        for art in rows_with_groups:
            group_tokens[art.group_id] |= _tokenize(art.title)
            group_sources[art.group_id].add(art.source_id)

        for gid, tokens in group_tokens.items():
            existing_groups.append((gid, tokens, list(group_sources[gid])))

        for article in ungrouped:
            tokens = _tokenize(article.title)
            if not tokens:
                continue

            best_group_id = None
            best_score = 0.0

            for gid, gtokens, gsources in existing_groups:
                if article.source_id in gsources:
                    continue
                score = _similarity(tokens, gtokens)
                if score > best_score:
                    best_score = score
                    best_group_id = gid

            if best_score >= _SIMILARITY_THRESHOLD and best_group_id is not None:
                article.group_id = best_group_id
                for g in existing_groups:
                    if g[0] == best_group_id:
                        g[1].update(tokens)
                        g[2].append(article.source_id)
                        break
                grouped_count += 1
                continue

            matched_ungrouped = None
            for other in ungrouped:
                if other is article or other.source_id == article.source_id:
                    continue
                if other.group_id is not None:
                    continue
                other_tokens = _tokenize(other.title)
                score = _similarity(tokens, other_tokens)
                if score >= _SIMILARITY_THRESHOLD:
                    matched_ungrouped = other
                    break

            if matched_ungrouped:
                group = NewsGroup(title=article.title)
                db.add(group)
                db.flush()

                article.group_id = group.id
                matched_ungrouped.group_id = group.id
                grouped_count += 2

                merged_tokens = tokens | _tokenize(matched_ungrouped.title)
                existing_groups.append((
                    group.id,
                    merged_tokens,
                    [article.source_id, matched_ungrouped.source_id],
                ))

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    if grouped_count:
        log.info("Grouped %d articles", grouped_count)
    return grouped_count
