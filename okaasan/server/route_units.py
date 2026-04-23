from typing import List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Ingredient, UnitConversion, RecipeIngredient
from .decorators import expose


MASS_UNITS = {
    'g': 1, 'kg': 1000, 'mg': 0.001, 'lb': 453.592, 'oz': 28.3495
}

VOLUME_UNITS = {
    'ml': 1, 'cl': 10, 'l': 1000, "cm3": 1,
    'fl oz': 29.5735, 'tbsp': 14.7868, 'tsp': 4.92892,
    'cup': 236.588, "pint": 473.176, "quart": 946.353, "gallon": 3785.
}

DEFAULT_MASS_UNIT = "g"
DEFAULT_VOLUME_UNIT = "ml"

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


def _get_unit(db: Session, unit: str):
    return db.execute(select(UnitConversion).where(
        UnitConversion.from_unit == unit,
        UnitConversion.to_unit == unit
    )).scalar()


def _get_ingredient(db: Session, ingredient_id: int):
    return db.execute(select(Ingredient).where(Ingredient._id == ingredient_id)).scalar()


def _conversion_factor(db: Session, from_unit: str, to_unit: str):
    return db.execute(select(UnitConversion).where(
        UnitConversion.from_unit == from_unit,
        UnitConversion.to_unit == to_unit,
        UnitConversion.ingredient_id.is_(None)
    )).scalar()


@router.get("/unit/definition/{name}")
@expose(name=lambda: [])
def flask_get_unit(name: str, db: Session = Depends(get_db)):
    unit = _get_unit(db, name)
    if unit is not None:
        return unit.to_json()
    return {}


@router.get("/unit/convert/{from_unit}/{to_unit}")
@expose(from_unit=lambda: [], to_unit=lambda: [])
def convert_unit(from_unit: str, to_unit: str, db: Session = Depends(get_db)):
    conversion = _conversion_factor(db, from_unit, to_unit)
    if conversion is not None:
        return conversion.to_json()
    return {}


@router.get("/units/available")
@expose()
def all_units(db: Session = Depends(get_db)):
    conversions = db.query(UnitConversion.to_unit).distinct().all()
    return [unit for (unit,) in conversions]


@router.get("/units/available/volume")
@expose()
def get_volume_units(db: Session = Depends(get_db)):
    conversions = (
        db.query(UnitConversion.to_unit)
        .filter(UnitConversion.is_volume == True)
        .distinct()
        .all()
    )
    return [unit for (unit,) in conversions]


@router.get("/units/suggestion")
def get_units_suggestion(db: Session = Depends(get_db)):
    return all_units(db)


@router.get("/units/suggestion/{ingredient_id}")
def get_units_for_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    units = (
        db.query(RecipeIngredient.unit)
        .filter(RecipeIngredient.ingredient_id == ingredient_id)
        .distinct()
        .all()
    )
    return [unit for (unit,) in units]


@router.get("/units/available/mass")
@expose()
def get_mass_units(db: Session = Depends(get_db)):
    conversions = (
        db.query(UnitConversion.to_unit)
        .filter(UnitConversion.is_volume == False)
        .distinct()
        .all()
    )
    return [unit for (unit,) in conversions]


@router.get("/unit/conversions")
@expose()
def get_all_conversions(db: Session = Depends(get_db)):
    conversions = db.query(UnitConversion).all()
    return [conv.to_json() for conv in conversions]


@router.post("/unit/conversions", status_code=201)
async def create_unit_conversion(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        conversion = UnitConversion(
            from_unit=data.get('from_unit'),
            to_unit=data.get('to_unit'),
            conversion_factor=data.get('conversion_factor'),
            category=data.get('category', 'custom'),
            ingredient_id=data.get('ingredient_id') if data.get('ingredient_id') else None,
            is_volume=data.get('is_volume')
        )
        db.add(conversion)
        db.commit()
        return conversion.to_json()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/unit/conversions/{conversion_id}")
def get_unit_conversion(conversion_id: int, db: Session = Depends(get_db)):
    conversion = db.get(UnitConversion, conversion_id)
    if not conversion:
        raise HTTPException(status_code=404, detail="Unit conversion not found")
    return conversion.to_json()


@router.put("/unit/conversions/{conversion_id}")
async def update_unit_conversion(conversion_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        conversion = db.get(UnitConversion, conversion_id)
        if not conversion:
            raise HTTPException(status_code=404, detail="Unit conversion not found")

        data = await request.json()
        conversion.from_unit = data.get('from_unit', conversion.from_unit)
        conversion.to_unit = data.get('to_unit', conversion.to_unit)
        conversion.conversion_factor = data.get('conversion_factor', conversion.conversion_factor)
        conversion.category = data.get('category', conversion.category)
        conversion.ingredient_id = data.get('ingredient_id') if data.get('ingredient_id') else None
        if data.get('is_volume') is not None:
            conversion.is_volume = data.get('is_volume')

        db.commit()
        return conversion.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/unit/conversions/{conversion_id}")
def delete_unit_conversion(conversion_id: int, db: Session = Depends(get_db)):
    try:
        conversion = db.get(UnitConversion, conversion_id)
        if not conversion:
            raise HTTPException(status_code=404, detail="Unit conversion not found")
        db.delete(conversion)
        db.commit()
        return {"message": "Unit conversion deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/ingredients/{ingredient_id}/conversion-matrix")
def get_conversion_matrix(ingredient_id: int, db: Session = Depends(get_db)):
    try:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            raise HTTPException(status_code=404, detail="Ingredient not found")

        volume_units = ['ml', 'cl', 'l', 'cm3', 'fl oz', 'tbsp', 'tsp', 'cup', 'pint', 'quart', 'gallon']
        weight_units = ['g', 'kg', 'mg', 'lb', 'oz']

        matrix = {
            'ingredient': ingredient.to_json(),
            'volume_units': volume_units,
            'weight_units': weight_units,
            'conversions': {}
        }

        for vol_unit in volume_units:
            matrix['conversions'][vol_unit] = {}
            for weight_unit in weight_units:
                matrix['conversions'][vol_unit][weight_unit] = None

        return matrix
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ingredients/{ingredient_id}/units-used")
def get_ingredient_units_used(ingredient_id: int, db: Session = Depends(get_db)):
    try:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            raise HTTPException(status_code=404, detail="Ingredient not found")

        recipe_ingredients = db.query(RecipeIngredient).filter_by(ingredient_id=ingredient_id).all()
        unit_usage = {}
        recipe_names = {}
        for ri in recipe_ingredients:
            unit = ri.unit
            if unit:
                if unit not in unit_usage:
                    unit_usage[unit] = 0
                    recipe_names[unit] = []
                unit_usage[unit] += 1
                if ri.recipe:
                    recipe_names[unit].append(ri.recipe.title)

        all_conversion_units = set()
        for (u,) in db.query(UnitConversion.from_unit).distinct().all():
            if u:
                all_conversion_units.add(u)
        for (u,) in db.query(UnitConversion.to_unit).distinct().all():
            if u:
                all_conversion_units.add(u)

        existing_conversions = {}
        for unit in unit_usage:
            conversions_from = db.query(UnitConversion).filter(
                UnitConversion.from_unit == unit,
                UnitConversion.ingredient_id == ingredient_id
            ).all()
            existing_conversions[unit] = [conv.to_unit for conv in conversions_from]

        return {
            'ingredient': ingredient.to_json(),
            'units_used': sorted(unit_usage.keys()),
            'unit_usage_count': unit_usage,
            'recipe_names': recipe_names,
            'existing_conversions': existing_conversions,
            'all_available_units': sorted(list(all_conversion_units)),
            'total_uses': sum(unit_usage.values())
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/units/used-in-recipes")
@expose()
def get_units_used_in_recipes(db: Session = Depends(get_db)):
    try:
        recipe_units = db.query(RecipeIngredient.unit).distinct().all()
        units_from_recipes = [unit[0] for unit in recipe_units if unit[0]]

        all_conversion_units = set()
        for (u,) in db.query(UnitConversion.from_unit).distinct().all():
            if u:
                all_conversion_units.add(u)
        for (u,) in db.query(UnitConversion.to_unit).distinct().all():
            if u:
                all_conversion_units.add(u)

        unit_usage = {}
        for unit in units_from_recipes:
            count = db.query(RecipeIngredient).filter_by(unit=unit).count()
            unit_usage[unit] = count

        return {
            'units_in_recipes': sorted(units_from_recipes),
            'unit_usage_count': unit_usage,
            'all_available_units': sorted(list(all_conversion_units)),
            'total_recipe_ingredients': db.query(RecipeIngredient).count()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def insert_base_conversions(session):
    session.query(UnitConversion).delete()
    session.commit()

    for unit in MASS_UNITS:
        session.add(UnitConversion(ingredient_id=None, from_unit=unit, to_unit=unit, conversion_factor=1, category="default", is_volume=False))
    for unit in VOLUME_UNITS:
        session.add(UnitConversion(ingredient_id=None, from_unit=unit, to_unit=unit, conversion_factor=1, category="default", is_volume=True))

    for unit, factor in MASS_UNITS.items():
        session.add(UnitConversion(ingredient_id=None, from_unit=DEFAULT_MASS_UNIT, to_unit=unit, conversion_factor=1/factor, category="default", is_volume=False))
        session.add(UnitConversion(ingredient_id=None, from_unit=unit, to_unit=DEFAULT_MASS_UNIT, conversion_factor=factor, category="default", is_volume=False))

    for unit, factor in VOLUME_UNITS.items():
        session.add(UnitConversion(ingredient_id=None, from_unit=DEFAULT_VOLUME_UNIT, to_unit=unit, conversion_factor=1/factor, category="default", is_volume=True))
        session.add(UnitConversion(ingredient_id=None, from_unit=unit, to_unit=DEFAULT_VOLUME_UNIT, conversion_factor=factor, category="default", is_volume=True))

    session.commit()
