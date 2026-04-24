from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Request

from .models import Ingredient, RecipeIngredient, IngredientComposition
from ..decorators import expose

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/ingredients/{start}/{end}")
def get_ingredients_range(start: int, end: int, db: Session = Depends(get_db)):
    ingredients = db.query(Ingredient).offset(start).limit(end - start).all()
    return [ingredient.to_json() for ingredient in ingredients]


@router.get("/ingredients")
@expose()
def get_ingredients(db: Session = Depends(get_db)):
    ingredients = db.query(Ingredient).all()
    return [ingredient.to_json() for ingredient in ingredients]


@router.post("/ingredients", status_code=201)
async def create_ingredient(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        ingredient = Ingredient(**data)
        db.add(ingredient)
        db.commit()
        return ingredient.to_json()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/ingredients/{ingredient_id:int}")
@expose(ingredient_id=select(Ingredient._id))
def get_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    ingredient = db.get(Ingredient, ingredient_id)
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ingredient.to_json()


@router.get("/ingredients/{ingredient_name:path}")
@expose(ingredient_name=lambda: [])
def get_ingredient_by_name(ingredient_name: str, db: Session = Depends(get_db)):
    formatted_name = ingredient_name.replace('-', ' ')
    ingredient = db.query(Ingredient).filter(Ingredient.name.ilike(f"%{formatted_name}%")).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return ingredient.to_json()


@router.put("/ingredients/{ingredient_id}")
async def update_ingredient(ingredient_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            raise HTTPException(status_code=404, detail="Ingredient not found")

        data = await request.json()
        ingredient.name = data.get('name', ingredient.name)
        ingredient.description = data.get('description', ingredient.description)
        ingredient.fdc_id = data.get('fdc_id', ingredient.fdc_id)
        ingredient.price_high = data.get('price_high', ingredient.price_high)
        ingredient.price_low = data.get('price_low', ingredient.price_low)
        ingredient.price_medium = data.get('price_medium', ingredient.price_medium)
        ingredient.calories = data.get('calories', ingredient.calories)
        ingredient.density = data.get('density', ingredient.density)
        ingredient.composition = data.get('composition', ingredient.composition)
        ingredient.extension = data.get('extension', ingredient.extension)
        ingredient.item_avg_weight = data.get('item_avg_weight', ingredient.item_avg_weight)

        unit_data = data.get('unit', {})
        if unit_data:
            ingredient.unit_metric = unit_data.get('metric', ingredient.unit_metric)
            ingredient.unit_us_customary = unit_data.get('us_customary', ingredient.unit_us_customary)
            ingredient.unit_us_legal = unit_data.get('us_legal', ingredient.unit_us_legal)
            ingredient.unit_canada = unit_data.get('canada', ingredient.unit_canada)
            ingredient.unit_australia = unit_data.get('australia', ingredient.unit_australia)
            ingredient.unit_uk = unit_data.get('uk', ingredient.unit_uk)

        db.commit()
        return ingredient.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/ingredients/{ingredient_id}")
def delete_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    try:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            raise HTTPException(status_code=404, detail="Ingredient not found")
        recipe_count = db.query(RecipeIngredient).filter_by(ingredient_id=ingredient_id).count()
        if recipe_count > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete ingredient. It is used in {recipe_count} recipe(s).")
        db.delete(ingredient)
        db.commit()
        return {"message": "Ingredient deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/ingredients/{ingredient_id:int}/compositions/{source}")
def get_ingredient_compositions_by_source(ingredient_id: int, source: str, db: Session = Depends(get_db)):
    compositions = db.query(IngredientComposition).filter_by(
        ingredient_id=ingredient_id, source=source).all()
    return [comp.to_json() for comp in compositions]


@router.get("/ingredients/{ingredient_id:int}/compositions")
def get_ingredient_compositions(ingredient_id: int, db: Session = Depends(get_db)):
    compositions = db.query(IngredientComposition).filter_by(ingredient_id=ingredient_id).all()
    return [comp.to_json() for comp in compositions]


@router.get("/ingredients/{ingredient_id:int}/compositions/source")
def get_ingredient_composition_sources(ingredient_id: int, db: Session = Depends(get_db)):
    sources = db.query(IngredientComposition.source).filter_by(ingredient_id=ingredient_id).distinct().all()
    return [source[0] for source in sources if source[0] is not None]


@router.post("/ingredients/{ingredient_id}/compositions", status_code=201)
async def create_ingredient_composition(ingredient_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            raise HTTPException(status_code=404, detail="Ingredient not found")
        data = await request.json()
        composition = IngredientComposition(
            ingredient_id=ingredient_id,
            name=data.get('name'),
            kind=data.get('kind'),
            quantity=data.get('quantity'),
            unit=data.get('unit'),
            daily_value=data.get('daily_value'),
            extension=data.get('extension'),
            source=data.get('source')
        )
        db.add(composition)
        db.commit()
        return composition.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/ingredients/compositions/{composition_id}")
async def update_ingredient_composition(composition_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        composition = db.get(IngredientComposition, composition_id)
        if not composition:
            raise HTTPException(status_code=404, detail="Composition not found")
        data = await request.json()
        composition.name = data.get('name', composition.name)
        composition.kind = data.get('kind', composition.kind)
        composition.quantity = data.get('quantity', composition.quantity)
        composition.unit = data.get('unit', composition.unit)
        composition.daily_value = data.get('daily_value', composition.daily_value)
        composition.extension = data.get('extension', composition.extension)
        composition.source = data.get('source', composition.source)
        db.commit()
        return composition.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/ingredients/compositions/{composition_id}")
def delete_ingredient_composition(composition_id: int, db: Session = Depends(get_db)):
    try:
        composition = db.get(IngredientComposition, composition_id)
        if not composition:
            raise HTTPException(status_code=404, detail="Composition not found")
        db.delete(composition)
        db.commit()
        return {"message": "Composition deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
