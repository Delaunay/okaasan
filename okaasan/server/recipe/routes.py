from __future__ import annotations

import logging
import traceback

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .models import Recipe, Ingredient, Category, RecipeIngredient, IngredientComposition
from .nutrition_calculator import calculate_recipe_nutrition
from ..decorators import expose

log = logging.getLogger("okaasan.recipes")

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


def _resolve_ingredient(db: Session, ing_data: dict, recipe_id: int | None = None):
    """Resolve an ingredient dict into (ingredient_id, ingredient_recipe_id).

    Raises HTTPException with a user-friendly message on validation errors.
    """
    ingredient_id = None
    ingredient_recipe_id = None

    if ing_data.get('ingredient_recipe_id'):
        if ing_data['ingredient_recipe_id'] == recipe_id:
            raise HTTPException(
                status_code=400,
                detail="A recipe cannot reference itself as an ingredient",
            )
        ingredient_recipe_id = ing_data['ingredient_recipe_id']

    elif ing_data.get('ingredient_id'):
        ingredient_id = ing_data['ingredient_id']

    else:
        name = ing_data.get('name')
        if not name or not name.strip():
            raise HTTPException(
                status_code=400,
                detail="Ingredient is missing a name (and has no ingredient_id or ingredient_recipe_id)",
            )
        ingredient = db.query(Ingredient).filter_by(name=name).first()
        if not ingredient:
            ingredient = Ingredient(name=name)
            db.add(ingredient)
            db.flush()
        ingredient_id = ingredient._id

    return ingredient_id, ingredient_recipe_id


def _save_ingredients(db: Session, recipe: Recipe, ingredients: list[dict]):
    """Validate and persist a list of ingredient dicts for a recipe."""
    for i, ing_data in enumerate(ingredients):
        ingredient_id, ingredient_recipe_id = _resolve_ingredient(
            db, ing_data, recipe._id,
        )

        qty = ing_data.get('quantity', 1.0)
        try:
            qty = float(qty)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail=f"Ingredient #{i + 1} ({ing_data.get('name', '?')}): "
                       f"quantity must be a number, got {qty!r}",
            )
        if qty <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Ingredient #{i + 1} ({ing_data.get('name', '?')}): "
                       f"quantity must be > 0, got {qty}",
            )

        unit = ing_data.get('unit', 'piece')
        if not unit or not str(unit).strip():
            raise HTTPException(
                status_code=400,
                detail=f"Ingredient #{i + 1} ({ing_data.get('name', '?')}): unit cannot be empty",
            )

        recipe_ingredient = RecipeIngredient(
            recipe_id=recipe._id,
            ingredient_id=ingredient_id,
            ingredient_recipe_id=ingredient_recipe_id,
            quantity=qty,
            unit=unit,
            fdc_id=ing_data.get('fdc_id'),
        )
        db.add(recipe_ingredient)


def _save_categories(db: Session, recipe: Recipe, categories: list[dict]):
    """Validate and persist a list of category dicts for a recipe."""
    for cat_data in categories:
        cat_id = cat_data.get('id', 0)
        cat_name = cat_data.get('name', '')

        if cat_id is not None and cat_id < 0:
            if not cat_name or not cat_name.strip():
                raise HTTPException(
                    status_code=400,
                    detail="New category is missing a name",
                )
            category = db.query(Category).filter_by(name=cat_name).first()
            if not category:
                category = Category(name=cat_name, description=cat_data.get('description', ''))
                db.add(category)
                db.flush()
            recipe.categories.append(category)
        else:
            category = db.get(Category, cat_id)
            if not category:
                log.warning("Category id=%s not found, skipping", cat_id)
                continue
            recipe.categories.append(category)


@router.get("/ingredient/search/{name}")
def search_ingredient(name: str, db: Session = Depends(get_db)):
    ingredients = db.query(Ingredient).filter(Ingredient.name.like(f'%{name}%')).all()
    recipes = db.query(Recipe).filter(Recipe.title.like(f'%{name}%')).all()
    return (
        [{'id': ing._id, 'name': ing.name, 'type': "ingredient"} for ing in ingredients] +
        [{'id': recipe._id, 'name': recipe.title, 'type': "recipe"} for recipe in recipes]
    )


@router.get("/recipes")
@expose()
def get_recipes(db: Session = Depends(get_db)):
    recipes = db.query(Recipe).all()
    return [recipe.to_json() for recipe in recipes]


@router.get("/recipes/{start}/{end}")
def get_recipes_range(start: int, end: int, db: Session = Depends(get_db)):
    recipes = db.query(Recipe).offset(start).limit(end - start).all()
    return [recipe.to_json() for recipe in recipes]


@router.post("/recipes", status_code=201)
async def create_recipe(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body is not valid JSON")

    title = data.get('title')
    if not title or not str(title).strip():
        raise HTTPException(status_code=400, detail="Recipe title is required")

    try:
        recipe = Recipe(
            title=title,
            description=data.get('description'),
            instructions=data.get('instructions', []),
            prep_time=data.get('prep_time'),
            cook_time=data.get('cook_time'),
            servings=data.get('servings'),
            images=data.get('images', []),
            author_id=data.get('author_id', 1),
            component=data.get('component', False),
        )
        db.add(recipe)
        db.flush()

        if 'ingredients' in data:
            _save_ingredients(db, recipe, data['ingredients'])

        if 'categories' in data:
            _save_categories(db, recipe, data['categories'])

        db.commit()
        return recipe.to_json()

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        log.error("Integrity error creating recipe: %s", e)
        raise HTTPException(
            status_code=409,
            detail=f"Database conflict: a recipe or ingredient with that name may already exist ({e.orig})",
        )
    except Exception as e:
        db.rollback()
        log.error("Unexpected error creating recipe:\n%s", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while creating recipe: {type(e).__name__}: {e}",
        )


@router.get("/recipes/{recipe_id}/nutrition/calculate")
@expose(recipe_id=select(Recipe._id))
def calculate_recipe_nutrition_endpoint(
    recipe_id: int,
    db: Session = Depends(get_db),
    portion_weight_g: float | None = Query(
        None,
        gt=0,
        description="Optional portion weight in grams for per-portion normalization. "
                    "If not provided, normalizes per 100g."
    ),
):
    """
    Calculate nutrition for a recipe based on ingredient quantities.

    This endpoint aggregates nutritional values from all ingredients in a recipe,
    scaled by their quantities, and normalizes the results.

    Args:
        recipe_id: The ID of the recipe to calculate nutrition for
        portion_weight_g: Optional portion weight in grams for per-portion normalization.
                         If provided, results are normalized per portion.
                         If not provided, results are normalized per 100g.

    Returns:
        A dictionary containing:
        - recipe_id: The recipe ID
        - calculation_time: When the calculation was performed (ISO format)
        - error: Whether there was an error during calculation
        - error_messages: List of error messages if any
        - missing_nutrition_ingredients: List of ingredients without nutrition data
        - normalization: Normalization type and value
        - compositions: List of nutritional values with kind, name, quantity, unit, daily_value
    """
    log.info(
        "Calculating nutrition for recipe %s with portion_weight_g=%s",
        recipe_id, portion_weight_g
    )

    try:
        result = calculate_recipe_nutrition(db, recipe_id, portion_weight_g)
        return result
    except Exception as e:
        log.error(
            "Unexpected error calculating nutrition for recipe %s:\n%s",
            recipe_id, traceback.format_exc()
        )
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while calculating nutrition: {type(e).__name__}: {e}",
        )


@router.get("/recipes/{recipe_id:int}")
@expose(recipe_id=select(Recipe._id))
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe.to_json()


@router.get("/recipes/{recipe_name:path}")
@expose(recipe_name=lambda: [])
def get_recipe_by_name(recipe_name: str, db: Session = Depends(get_db)):
    formatted_name = recipe_name.replace('-', ' ')
    recipe = db.query(Recipe).filter(Recipe.title.ilike(f"%{formatted_name}%")).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe.to_json()


@router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: int, request: Request, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe {recipe_id} not found")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body is not valid JSON")

    try:
        recipe.title = data.get('title', recipe.title)
        recipe.description = data.get('description', recipe.description)
        recipe.instructions = data.get('instructions', recipe.instructions)
        recipe.prep_time = data.get('prep_time', recipe.prep_time)
        recipe.cook_time = data.get('cook_time', recipe.cook_time)
        recipe.servings = data.get('servings', recipe.servings)
        recipe.images = data.get('images', recipe.images)
        recipe.component = data.get('component', recipe.component)

        if 'ingredients' in data:
            for ri in recipe.recipe_ingredients:
                db.delete(ri)
            db.flush()
            _save_ingredients(db, recipe, data['ingredients'])

        if 'categories' in data:
            recipe.categories.clear()
            _save_categories(db, recipe, data['categories'])

        db.commit()
        return recipe.to_json()

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        log.error("Integrity error updating recipe %s: %s", recipe_id, e)
        raise HTTPException(
            status_code=409,
            detail=f"Database conflict while updating recipe: {e.orig}",
        )
    except Exception as e:
        db.rollback()
        log.error("Unexpected error updating recipe %s:\n%s", recipe_id, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while updating recipe: {type(e).__name__}: {e}",
        )


@router.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe {recipe_id} not found")

    try:
        for ri in recipe.recipe_ingredients:
            db.delete(ri)
        db.flush()
        db.delete(recipe)
        db.commit()
        return {"message": "Recipe deleted successfully"}
    except IntegrityError as e:
        db.rollback()
        log.error("Integrity error deleting recipe %s: %s", recipe_id, e)
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete recipe: it is still referenced by other data ({e.orig})",
        )
    except Exception as e:
        db.rollback()
        log.error("Unexpected error deleting recipe %s:\n%s", recipe_id, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while deleting recipe: {type(e).__name__}: {e}",
        )


@router.get("/recipes/nutrition/{recipe_id}")
@expose(recipe_id=select(Recipe._id))
def get_recipe_nutrition(recipe_id: int, db: Session = Depends(get_db)):
    compositions = db.query(IngredientComposition).filter_by(recipe_id=recipe_id).all()
    return [comp.to_json() for comp in compositions]


@router.patch("/recipes/ingredients/{recipe_ingredient_id}")
async def update_recipe_ingredient(recipe_ingredient_id: int, request: Request, db: Session = Depends(get_db)):
    recipe_ingredient = db.get(RecipeIngredient, recipe_ingredient_id)
    if not recipe_ingredient:
        raise HTTPException(status_code=404, detail=f"Recipe ingredient {recipe_ingredient_id} not found")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body is not valid JSON")

    try:
        if 'fdc_id' in data:
            recipe_ingredient.fdc_id = data['fdc_id']
        if 'quantity' in data:
            try:
                recipe_ingredient.quantity = float(data['quantity'])
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail=f"quantity must be a number, got {data['quantity']!r}",
                )
        if 'unit' in data:
            recipe_ingredient.unit = data['unit']
        db.commit()
        return recipe_ingredient.to_json()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        log.error("Unexpected error updating recipe ingredient %s:\n%s", recipe_ingredient_id, traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Internal error while updating ingredient: {type(e).__name__}: {e}",
        )
