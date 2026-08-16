"""Registry of available recipe scrapers.

To add a new site: implement ``RecipeSource`` in a new module next to
``hellofresh.py`` and add one entry here.
"""
from __future__ import annotations

from .base import RecipeSource
from .hellofresh import HelloFreshSource

SOURCES: dict[str, type[RecipeSource]] = {
    "hellofresh": HelloFreshSource,
}


def get_source(name: str) -> RecipeSource:
    try:
        return SOURCES[name]()
    except KeyError:
        raise ValueError(
            f"Unknown recipe source {name!r}. Available: {sorted(SOURCES)}"
        )
