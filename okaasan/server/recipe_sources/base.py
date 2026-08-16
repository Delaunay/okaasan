"""Common interface for scraping recipes from an external website."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class NormalizedIngredient:
    name: str
    quantity: float
    unit: str


@dataclass
class NormalizedInstructionStep:
    step: int
    description: str
    duration: str | None = None
    image: str | None = None


@dataclass
class NormalizedNutrition:
    kind: str
    name: str
    quantity: float
    unit: str


@dataclass
class NormalizedRecipe:
    """A recipe scraped from an external site, in a shape ``sync.py`` knows how to store."""

    external_id: str
    source_url: str
    title: str
    description: str | None = None
    headline: str | None = None
    image_url: str | None = None

    instructions: list[NormalizedInstructionStep] = field(default_factory=list)
    ingredients: list[NormalizedIngredient] = field(default_factory=list)
    nutrition: list[NormalizedNutrition] = field(default_factory=list)

    prep_time_min: int | None = None
    cook_time_min: int | None = None
    servings: int | None = None

    categories: list[str] = field(default_factory=list)
    utensils: list[str] = field(default_factory=list)
    allergens: list[str] = field(default_factory=list)

    # Anything source-specific that isn't worth a dedicated column
    # (difficulty, ratings, raw image url for a later download pass, etc).
    extension: dict[str, Any] = field(default_factory=dict)


class RecipeSource(ABC):
    """A scraper for one external recipe website.

    To add a new site: implement this interface in a new module and register
    it in ``registry.py``.
    """

    name: str

    @abstractmethod
    def iter_external_ids(self) -> Iterator[str]:
        """Yield every recipe id currently published on the source site."""

    @abstractmethod
    def fetch_recipe(self, external_id: str) -> NormalizedRecipe:
        """Fetch and normalize a single recipe by its source-native id."""
