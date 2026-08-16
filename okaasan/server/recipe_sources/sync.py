"""Generic import/upsert logic shared by every recipe source."""
from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy.orm import Session

from ..recipe.models import (
    Allergen,
    Category,
    Ingredient,
    IngredientComposition,
    Recipe,
    RecipeIngredient,
    Utensil,
)
from .base import NormalizedRecipe
from .registry import get_source

log = logging.getLogger("okaasan.recipe_sources.sync")


def _get_or_create(db: Session, model, name: str):
    name = (name or "").strip()
    if not name:
        return None
    obj = db.query(model).filter_by(name=name).first()
    if not obj:
        obj = model(name=name)
        db.add(obj)
        db.flush()
    return obj


def _import_recipe(db: Session, source_name: str, r: NormalizedRecipe) -> Recipe:
    recipe = Recipe(
        title=r.title,
        description=r.description,
        images=[],  # images are downloaded in a separate later pass
        instructions=[asdict(step) for step in r.instructions],
        prep_time=r.prep_time_min,
        cook_time=r.cook_time_min,
        servings=r.servings,
        source=source_name,
        source_url=r.source_url,
        external_id=r.external_id,
        synced_at=datetime.now(timezone.utc),
        extension={"headline": r.headline, source_name: r.extension},
    )
    db.add(recipe)
    db.flush()

    added_category_ids: set[int] = set()

    def add_category(name: str):
        cat = _get_or_create(db, Category, name)
        if cat and cat._id not in added_category_ids:
            added_category_ids.add(cat._id)
            recipe.categories.append(cat)

    # Explicit "tag them as <source>" so imported recipes can be filtered out.
    add_category(source_name.capitalize())
    for name in r.categories:
        add_category(name)

    for name in r.utensils:
        utensil = _get_or_create(db, Utensil, name)
        if utensil:
            recipe.utensils.append(utensil)

    for name in r.allergens:
        allergen = _get_or_create(db, Allergen, name)
        if allergen:
            recipe.allergens.append(allergen)

    for ing in r.ingredients:
        ingredient = _get_or_create(db, Ingredient, ing.name)
        db.add(RecipeIngredient(
            recipe_id=recipe._id,
            ingredient_id=ingredient._id if ingredient else None,
            quantity=ing.quantity,
            unit=ing.unit,
        ))

    for n in r.nutrition:
        db.add(IngredientComposition(
            recipe_id=recipe._id,
            kind=n.kind,
            name=n.name,
            quantity=n.quantity,
            unit=n.unit,
            source=source_name,
        ))

    return recipe


def sync_source(
    source_name: str,
    session_factory: Callable[[], Session],
    *,
    limit: int | None = None,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Import every not-yet-seen recipe from ``source_name``.

    Already-imported recipes (matched by ``source`` + ``external_id``) are
    skipped, so re-running this is idempotent and resumable — an interrupted
    run just picks back up where it left off.
    """
    source = get_source(source_name)
    db = session_factory()
    stats = {"imported": 0, "skipped": 0, "failed": 0, "errors": []}

    try:
        existing_ids = {
            row[0]
            for row in db.query(Recipe.external_id).filter(Recipe.source == source_name).all()
            if row[0]
        }

        for external_id in source.iter_external_ids():
            if limit is not None and stats["imported"] >= limit:
                break

            if external_id in existing_ids:
                stats["skipped"] += 1
                continue

            try:
                normalized = source.fetch_recipe(external_id)
                _import_recipe(db, source_name, normalized)
                db.commit()
                stats["imported"] += 1
            except Exception as e:
                db.rollback()
                log.warning("Failed to import %s recipe %s: %s", source_name, external_id, e)
                stats["failed"] += 1
                stats["errors"].append(f"{external_id}: {e}")

            if on_progress:
                on_progress(dict(stats))

        return stats
    finally:
        db.close()
