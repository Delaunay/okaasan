from __future__ import annotations

import logging
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from .models import Ingredient, IngredientComposition, Recipe, RecipeIngredient
from .route_units import MASS_UNITS, VOLUME_UNITS

log = logging.getLogger("okaasan.recipes.nutrition")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _empty_result(recipe_id: int, portion_weight_g: float | None = None) -> dict[str, Any]:
    normalization_value = portion_weight_g if portion_weight_g is not None else 100.0
    return {
        "recipe_id": recipe_id,
        "calculation_time": _utc_now_iso(),
        "error": False,
        "error_messages": [],
        "missing_nutrition_ingredients": [],
        "normalization": {
            "type": "per_portion" if portion_weight_g is not None else "per_100g",
            "value": normalization_value,
            "unit": "g",
        },
        "compositions": [],
    }


def _ingredient_display(recipe_ingredient: RecipeIngredient) -> tuple[int | None, str | None]:
    if recipe_ingredient.ingredient_id:
        return (
            recipe_ingredient.ingredient_id,
            recipe_ingredient.ingredient.name if recipe_ingredient.ingredient else None,
        )
    if recipe_ingredient.ingredient_recipe_id:
        return (
            recipe_ingredient.ingredient_recipe_id,
            recipe_ingredient.ingredient_recipe.title if recipe_ingredient.ingredient_recipe else None,
        )
    return None, None


def _missing_entry(recipe_ingredient: RecipeIngredient, reason: str) -> dict[str, Any]:
    ingredient_id, name = _ingredient_display(recipe_ingredient)
    entry = {
        "ingredient_id": ingredient_id,
        "name": name or "Unknown ingredient",
        "reason": reason,
    }
    if recipe_ingredient.ingredient_recipe_id and not recipe_ingredient.ingredient_id:
        entry["ingredient_recipe_id"] = recipe_ingredient.ingredient_recipe_id
    if recipe_ingredient._id is not None:
        entry["recipe_ingredient_id"] = recipe_ingredient._id
    return entry


def _quantity_in_grams(recipe_ingredient: RecipeIngredient) -> tuple[float | None, str | None]:
    """Return the recipe ingredient quantity in grams, or an error reason.

    IngredientComposition.quantity values are treated as values per 100g, so
    recipe ingredient quantities must be expressed as gram weights before
    nutrition can be scaled and normalized.
    """
    quantity = recipe_ingredient.quantity
    if quantity is None:
        return None, "missing_quantity"

    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return None, "invalid_quantity"

    if quantity <= 0:
        return None, "non_positive_quantity"

    unit = (recipe_ingredient.unit or "").strip().lower()
    if not unit:
        return None, "missing_unit"

    if unit in MASS_UNITS:
        return quantity * MASS_UNITS[unit], None

    ingredient: Ingredient | None = recipe_ingredient.ingredient

    # Convert volume to grams when density is available. Density is stored as
    # g/ml in the Ingredient model.
    if unit in VOLUME_UNITS:
        density = getattr(ingredient, "density", None)
        if density is None or density <= 0:
            return None, "missing_density_for_volume_conversion"
        return quantity * VOLUME_UNITS[unit] * float(density), None

    if unit in {"piece", "pieces", "pc", "unit", "units", "item", "items", "each", "ea"}:
        item_avg_weight = getattr(ingredient, "item_avg_weight", None)
        if item_avg_weight is None or item_avg_weight <= 0:
            return None, "missing_item_avg_weight"
        return quantity * float(item_avg_weight), None

    return None, "unsupported_unit"


def _get_compositions(db: Session, recipe_ingredient: RecipeIngredient) -> list[IngredientComposition]:
    if recipe_ingredient.ingredient_id:
        return (
            db.query(IngredientComposition)
            .filter_by(ingredient_id=recipe_ingredient.ingredient_id)
            .all()
        )
    if recipe_ingredient.ingredient_recipe_id:
        return (
            db.query(IngredientComposition)
            .filter_by(recipe_id=recipe_ingredient.ingredient_recipe_id)
            .all()
        )
    return []


def calculate_recipe_nutrition(
    db: Session,
    recipe_id: int,
    portion_weight_g: float | None = None,
) -> dict[str, Any]:
    """Calculate normalized nutrition for a recipe.

    ``IngredientComposition.quantity`` and ``daily_value`` values are assumed to
    be per 100g. Each ingredient contribution is multiplied by
    ``ingredient_weight_g / 100`` and then totals are normalized per 100g
    (default) or per ``portion_weight_g``.
    """
    result = _empty_result(recipe_id, portion_weight_g)

    if portion_weight_g is not None:
        try:
            portion_weight_g = float(portion_weight_g)
            result["normalization"]["value"] = portion_weight_g
        except (TypeError, ValueError):
            result["error"] = True
            result["error_messages"].append("portion_weight_g must be a number")
            return result
        if portion_weight_g <= 0:
            result["error"] = True
            result["error_messages"].append("portion_weight_g must be > 0")
            return result

    try:
        recipe = db.get(Recipe, recipe_id)
        if recipe is None:
            result["error"] = True
            result["error_messages"].append("Recipe not found")
            return result

        recipe_ingredients = list(recipe.recipe_ingredients or [])
        if not recipe_ingredients:
            result["error"] = True
            result["error_messages"].append("Recipe has no ingredients")
            return result

        totals: OrderedDict[tuple[str | None, str | None, str | None], dict[str, Any]] = OrderedDict()
        total_weight_g = 0.0
        unknown_weight_count = 0

        for recipe_ingredient in recipe_ingredients:
            ingredient_id, ingredient_name = _ingredient_display(recipe_ingredient)
            ingredient_label = ingredient_name or f"ingredient {ingredient_id or 'unknown'}"

            weight_g, weight_error = _quantity_in_grams(recipe_ingredient)
            if weight_error is not None or weight_g is None:
                unknown_weight_count += 1
                result["missing_nutrition_ingredients"].append(
                    _missing_entry(recipe_ingredient, weight_error or "missing_weight")
                )
                log.warning(
                    "Cannot calculate weight for recipe_id=%s ingredient=%s: %s",
                    recipe_id,
                    ingredient_label,
                    weight_error,
                )
                continue

            total_weight_g += weight_g
            compositions = _get_compositions(db, recipe_ingredient)
            if not compositions:
                result["missing_nutrition_ingredients"].append(
                    _missing_entry(recipe_ingredient, "no_composition")
                )
                log.info(
                    "No nutrition composition for recipe_id=%s ingredient=%s",
                    recipe_id,
                    ingredient_label,
                )
                continue

            quantity_multiplier = weight_g / 100.0
            for composition in compositions:
                if composition.quantity is None:
                    result["error"] = True
                    message = (
                        f"Composition {composition._id} ({composition.name or 'unknown'}) "
                        f"for {ingredient_label} is missing quantity"
                    )
                    result["error_messages"].append(message)
                    log.warning(message)
                    continue

                try:
                    composition_quantity = float(composition.quantity)
                except (TypeError, ValueError):
                    result["error"] = True
                    message = (
                        f"Composition {composition._id} ({composition.name or 'unknown'}) "
                        f"for {ingredient_label} has invalid quantity"
                    )
                    result["error_messages"].append(message)
                    log.warning(message)
                    continue

                key = (composition.kind, composition.name, composition.unit)
                if key not in totals:
                    totals[key] = {
                        "kind": composition.kind,
                        "name": composition.name,
                        "quantity": 0.0,
                        "unit": composition.unit,
                        "daily_value": 0.0,
                    }

                totals[key]["quantity"] += composition_quantity * quantity_multiplier

                if composition.daily_value is not None:
                    try:
                        totals[key]["daily_value"] += float(composition.daily_value) * quantity_multiplier
                    except (TypeError, ValueError):
                        log.warning(
                            "Invalid daily_value for composition_id=%s; treating as 0",
                            composition._id,
                        )

        if result["missing_nutrition_ingredients"]:
            result["error"] = True
            result["error_messages"].append(
                "Nutrition calculation is incomplete because some ingredients lack usable nutrition or weight data"
            )

        if unknown_weight_count:
            result["error"] = True
            result["error_messages"].append(
                f"Could not determine gram weight for {unknown_weight_count} ingredient(s)"
            )

        if total_weight_g <= 0:
            result["error"] = True
            result["error_messages"].append(
                "Total recipe weight is zero or unknown; normalized nutrition could not be calculated"
            )
            result["compositions"] = list(totals.values())
            return result

        normalization_weight_g = float(portion_weight_g) if portion_weight_g is not None else 100.0
        normalization_factor = normalization_weight_g / total_weight_g

        result["compositions"] = [
            {
                "kind": composition["kind"],
                "name": composition["name"],
                "quantity": composition["quantity"] * normalization_factor,
                "unit": composition["unit"],
                "daily_value": composition["daily_value"] * normalization_factor,
            }
            for composition in totals.values()
        ]
        return result

    except Exception as exc:
        log.exception("Unexpected error calculating nutrition for recipe_id=%s", recipe_id)
        result["error"] = True
        result["error_messages"].append(
            f"Unexpected error while calculating nutrition: {type(exc).__name__}: {exc}"
        )
        return result
