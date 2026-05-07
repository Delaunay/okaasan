from __future__ import annotations

import logging
import time
import traceback

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..models import Ingredient, IngredientComposition
from .usda import get_fdc_client

log = logging.getLogger("okaasan.usda.routes")


def get_db_from_engine(engine):
    from sqlalchemy.orm import sessionmaker
    SessionLocal = sessionmaker(bind=engine)

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    return get_db


def create_usda_router(engine):
    router = APIRouter()
    get_db = get_db_from_engine(engine)

    fdc_client = get_fdc_client()

    fdc_extras = {}
    try:
        from usda_fdc.analysis import analyze_food, DriType, Gender
        from usda_fdc.analysis.nutrients import NUTRIENT_GROUPS

        fdc_extras = {
            "analyze_food": analyze_food,
            "DriType": DriType,
            "Gender": Gender,
            "NUTRIENT_GROUPS": NUTRIENT_GROUPS,
        }
    except (ImportError, ModuleNotFoundError):
        traceback.print_exc()
    except Exception:
        traceback.print_exc()

    # --- Search ---

    def _do_search(q: str, limit: int = 20, data_type: str = "foundation_food"):
        if not q:
            raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        limit = min(max(1, limit), 100)
        log.warning("[USDA] search start q=%r limit=%d data_type=%s", q, limit, data_type)
        t0 = time.monotonic()

        if fdc_client:
            try:
                data_type_map = {
                    "foundation_food": ["Foundation"],
                    "sr_legacy_food": ["SR Legacy"],
                    "branded_food": ["Branded"],
                    "survey_fndds_food": ["Survey (FNDDS)"],
                }
                api_data_type = data_type_map.get(data_type)
                search_result = fdc_client.search(q, data_type=api_data_type, page_size=limit)
                results = [
                    {
                        "fdc_id": food.fdc_id,
                        "data_type": food.data_type or "",
                        "description": food.description,
                        "food_category_id": "",
                        "publication_date": food.publication_date or "",
                    }
                    for food in search_result.foods
                ]
                log.warning("[USDA] search done: %d results in %.2fs", len(results), time.monotonic() - t0)
                return results
            except Exception as e:
                log.error("[USDA] search FAILED after %.2fs: %s", time.monotonic() - t0, e)
                raise HTTPException(status_code=500, detail=str(e))
        else:
            raise HTTPException(status_code=501, detail="FDC API not available (usda_fdc not installed or FDC_API_KEY not set)")

    @router.get("/usda/search/{name:path}")
    def search_usda_by_name(name: str, limit: int = 20, data_type: str = "foundation_food"):
        return _do_search(name, limit, data_type)

    @router.get("/usda/search")
    def search_usda(q: str = "", limit: int = 20, data_type: str = "foundation_food"):
        return _do_search(q, limit, data_type)

    # --- Food details ---

    @router.get("/usda/food/{fdc_id}")
    def get_food_details(fdc_id: str):
        if not fdc_client:
            raise HTTPException(status_code=501, detail="FDC API not available")
        log.warning("[USDA] food details start fdc_id=%s", fdc_id)
        t0 = time.monotonic()
        try:
            food = fdc_client.get_food(int(fdc_id))
            food_details = {
                "fdc_id": food.fdc_id,
                "data_type": food.data_type or "",
                "description": food.description,
                "food_category_id": "",
                "publication_date": food.publication_date or "",
                "nutrients": [
                    {
                        "nutrient_id": n.id,
                        "name": n.name,
                        "amount": n.amount,
                        "unit": n.unit_name,
                        "percent_daily_value": 0.0,
                    }
                    for n in food.nutrients
                ],
            }
            log.warning("[USDA] food details done fdc_id=%s in %.2fs", fdc_id, time.monotonic() - t0)
            return food_details
        except HTTPException:
            raise
        except Exception as e:
            log.error("[USDA] food details FAILED fdc_id=%s after %.2fs: %s", fdc_id, time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    # --- Nutrients ---

    @router.get("/usda/food/{fdc_id}/nutrients")
    def get_food_nutrients(fdc_id: str):
        if not fdc_client:
            raise HTTPException(status_code=501, detail="FDC API not available")
        log.warning("[USDA] food nutrients start fdc_id=%s", fdc_id)
        t0 = time.monotonic()
        try:
            food = fdc_client.get_food(int(fdc_id))
            nutrients = [
                {
                    "nutrient_id": n.id,
                    "name": n.name,
                    "amount": n.amount,
                    "unit": n.unit_name,
                    "percent_daily_value": 0.0,
                }
                for n in food.nutrients
            ]
            log.warning("[USDA] food nutrients done fdc_id=%s: %d nutrients in %.2fs", fdc_id, len(nutrients), time.monotonic() - t0)
            return {"fdc_id": fdc_id, "count": len(nutrients), "nutrients": nutrients}
        except HTTPException:
            raise
        except Exception as e:
            log.error("[USDA] food nutrients FAILED fdc_id=%s after %.2fs: %s", fdc_id, time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    # --- Analyze (requires FDC library) ---

    @router.get("/usda/analyze/{fdc_id:int}")
    def analyze_ingredient(fdc_id: int):
        if not fdc_client:
            raise HTTPException(status_code=501, detail="FDC API not available (usda_fdc not installed or FDC_API_KEY not set)")
        from dataclasses import asdict
        log.warning("[USDA] analyze start fdc_id=%s", fdc_id)
        t0 = time.monotonic()
        try:
            analyze_food = fdc_extras["analyze_food"]
            DriType = fdc_extras["DriType"]
            Gender = fdc_extras["Gender"]
            food = fdc_client.get_food(fdc_id)
            log.warning("[USDA] analyze: got food in %.2fs, running analysis...", time.monotonic() - t0)
            analysis = analyze_food(
                food, dri_type=DriType.RDA, gender=Gender.MALE, serving_size=100.0
            )
            log.warning("[USDA] analyze done fdc_id=%s in %.2fs", fdc_id, time.monotonic() - t0)
            return asdict(analysis)
        except Exception as e:
            log.error("[USDA] analyze FAILED fdc_id=%s after %.2fs: %s", fdc_id, time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    # --- Nutrient group (requires FDC library) ---

    @router.get("/usda/nutrient/group/{name}")
    def get_nutrient_group(name: str):
        if not fdc_extras.get("NUTRIENT_GROUPS"):
            raise HTTPException(status_code=501, detail="FDC API not available (usda_fdc not installed)")

        NUTRIENT_GROUPS = fdc_extras["NUTRIENT_GROUPS"]
        original_name = name
        name_lower = name.split(",")[0].lower()
        dname = name_lower.capitalize()

        if 'total lipid' in name_lower:
            return {"name": "", "group": "Fat"}
        if 'fatty' in name_lower:
            n = original_name.split(",")[1].replace("total", "").strip().capitalize()
            return {"name": n, "group": "Fat"}
        if 'fat' in name_lower:
            return {"name": dname, "group": 'Fat'}
        if 'vitamin' in name_lower:
            return {"name": dname, "group": 'Vitamin'}
        if 'energy' in name_lower:
            return {"name": "", "group": "Calories"}

        for group, items in NUTRIENT_GROUPS.items():
            if name_lower in items:
                if group == 'macronutrient':
                    return {"name": dname, "group": dname}
                return {"name": dname, "group": group.capitalize()}

        return {"name": dname, "group": 'Others'}

    # --- Apply USDA data to ingredient ---

    @router.post("/usda/apply")
    async def apply_usda_to_ingredient(request: Request, db: Session = Depends(get_db)):
        if not fdc_client:
            raise HTTPException(status_code=501, detail="FDC API not available")
        try:
            data = await request.json()
            if not data:
                raise HTTPException(status_code=400, detail="Request body is required")

            ingredient_id = data.get('ingredient_id')
            fdc_id = data.get('fdc_id')
            overwrite = data.get('overwrite', False)
            log.warning("[USDA] apply start ingredient_id=%s fdc_id=%s overwrite=%s", ingredient_id, fdc_id, overwrite)

            if not ingredient_id:
                raise HTTPException(status_code=400, detail="ingredient_id is required")
            if not fdc_id:
                raise HTTPException(status_code=400, detail="fdc_id is required")

            ingredient = db.query(Ingredient).filter_by(_id=ingredient_id).first()
            if not ingredient:
                raise HTTPException(status_code=404, detail=f"Ingredient with ID {ingredient_id} not found")

            t0 = time.monotonic()
            food = fdc_client.get_food(int(fdc_id))
            log.warning("[USDA] apply: fetched food from API in %.2fs", time.monotonic() - t0)

            if overwrite:
                db.query(IngredientComposition).filter_by(ingredient_id=ingredient_id, source='USDA').delete()

            from .usda import normalize_nutrient_name

            added_count = 0
            for nutrient in food.nutrients:
                if not nutrient.amount or nutrient.amount == 0:
                    continue

                kind, name = normalize_nutrient_name(nutrient.name, nutrient.unit_name or "")
                if kind == "_skip":
                    continue

                if not overwrite:
                    existing = db.query(IngredientComposition).filter_by(
                        ingredient_id=ingredient_id, name=name, kind=kind, source='USDA'
                    ).first()
                    if existing:
                        continue

                composition = IngredientComposition(
                    ingredient_id=ingredient_id,
                    kind=kind,
                    name=name,
                    quantity=nutrient.amount,
                    unit=nutrient.unit_name,
                    daily_value=0.0,
                    source='USDA',
                    extension={
                        'fdc_id': str(fdc_id),
                        'usda_description': food.description,
                        'nutrient_id': nutrient.id,
                    }
                )
                db.add(composition)
                added_count += 1

            db.commit()
            log.warning("[USDA] apply done: added %d compositions in %.2fs", added_count, time.monotonic() - t0)
            updated_ingredient = db.query(Ingredient).filter_by(_id=ingredient_id).first()
            return {
                "success": True,
                "ingredient": updated_ingredient.to_json(),
                "added_compositions": added_count,
                "usda_food": food.description,
                "fdc_id": fdc_id
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            log.exception("apply failed")
            raise HTTPException(status_code=500, detail=str(e))

    return router
