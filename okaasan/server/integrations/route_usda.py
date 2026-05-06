from __future__ import annotations

import logging
import os
import csv
import time
import traceback

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..models import Ingredient, IngredientComposition
from .usda.usda_reader import USDAReader

log = logging.getLogger("okaasan.usda.routes")

HERE = os.path.dirname(__file__)
USDA_FOLDER = os.path.join(HERE, "..", "..", "data", "usda")


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

    log.info("Initializing USDA reader from %s", USDA_FOLDER)
    usda_reader = USDAReader(USDA_FOLDER)

    # Try to load the FDC library for analyze/nutrient-group features
    fdc_client = None
    fdc_extras = {}
    try:
        from usda_fdc.client import FdcClient
        from usda_fdc.analysis import analyze_food, DriType, Gender
        from usda_fdc.analysis.nutrients import NUTRIENT_GROUPS

        class RateLimitedClient(FdcClient):
            def __init__(self, api_key, requests_per_minute=10, **kwargs):
                super().__init__(api_key, **kwargs)
                self.requests_per_minute = requests_per_minute
                self.interval = 60 / requests_per_minute
                self.last_request_time = 0

            def _make_request(self, endpoint, method="GET", params=None, data=None):
                current_time = time.time()
                time_since_last = current_time - self.last_request_time
                if time_since_last < self.interval:
                    time.sleep(self.interval - time_since_last)
                result = super()._make_request(endpoint, method, params, data)
                self.last_request_time = time.time()
                return result

        api_key = os.getenv("FDC_API_KEY")
        if api_key:
            fdc_client = RateLimitedClient(api_key)
            fdc_extras = {
                "analyze_food": analyze_food,
                "DriType": DriType,
                "Gender": Gender,
                "NUTRIENT_GROUPS": NUTRIENT_GROUPS,
            }
            log.info("FDC API client initialized (rate-limited)")
        else:
            log.info("FDC_API_KEY not set, FDC API features disabled")
    except (ImportError, ModuleNotFoundError):
        traceback.print_exc()
    except Exception:
        traceback.print_exc()

    # --- Search ---

    def _do_search(q: str, limit: int = 20, data_type: str = "foundation_food"):
        if not q:
            raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        limit = min(max(1, limit), 100)
        log.info("search q=%r limit=%d data_type=%s", q, limit, data_type)
        t0 = time.monotonic()
        try:
            results = usda_reader.search_foods(q, limit=limit, data_type=data_type)
            log.info("search done: %d results in %.2fs", len(results), time.monotonic() - t0)
            return results
        except Exception as e:
            log.error("search failed after %.2fs: %s", time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/usda/search/{name:path}")
    def search_usda_by_name(name: str, limit: int = 20, data_type: str = "foundation_food"):
        return _do_search(name, limit, data_type)

    @router.get("/usda/search")
    def search_usda(q: str = "", limit: int = 20, data_type: str = "foundation_food"):
        return _do_search(q, limit, data_type)

    # --- Food details ---

    @router.get("/usda/food/{fdc_id}")
    def get_food_details(fdc_id: str):
        log.info("food details fdc_id=%s", fdc_id)
        t0 = time.monotonic()
        try:
            food_details = usda_reader.get_food_details(fdc_id)
            if not food_details:
                raise HTTPException(status_code=404, detail=f"Food with FDC ID {fdc_id} not found")
            category_id = food_details.get('food_category_id')
            if category_id:
                category = usda_reader.get_food_category(category_id)
                if category:
                    food_details['category'] = category
            log.info("food details done in %.2fs", time.monotonic() - t0)
            return food_details
        except HTTPException:
            raise
        except Exception as e:
            log.error("food details failed after %.2fs: %s", time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    # --- Nutrients ---

    @router.get("/usda/food/{fdc_id}/nutrients")
    def get_food_nutrients(fdc_id: str):
        log.info("food nutrients fdc_id=%s", fdc_id)
        t0 = time.monotonic()
        try:
            nutrients = usda_reader.get_food_nutrients(fdc_id)
            if not nutrients:
                food_details = usda_reader.get_food_details(fdc_id)
                if not food_details:
                    raise HTTPException(status_code=404, detail=f"Food with FDC ID {fdc_id} not found")
                log.info("food nutrients: 0 nutrients in %.2fs", time.monotonic() - t0)
                return {"fdc_id": fdc_id, "count": 0, "nutrients": []}
            log.info("food nutrients done: %d nutrients in %.2fs", len(nutrients), time.monotonic() - t0)
            return {"fdc_id": fdc_id, "count": len(nutrients), "nutrients": nutrients}
        except HTTPException:
            raise
        except Exception as e:
            log.error("food nutrients failed after %.2fs: %s", time.monotonic() - t0, e)
            raise HTTPException(status_code=500, detail=str(e))

    # --- Analyze (requires FDC library) ---

    @router.get("/usda/analyze/{fdc_id:int}")
    def analyze_ingredient(fdc_id: int):
        if not fdc_client:
            raise HTTPException(status_code=501, detail="FDC API not available (usda_fdc not installed or FDC_API_KEY not set)")
        from dataclasses import asdict
        try:
            analyze_food = fdc_extras["analyze_food"]
            DriType = fdc_extras["DriType"]
            Gender = fdc_extras["Gender"]
            food = fdc_client.get_food(fdc_id)
            analysis = analyze_food(
                food, dri_type=DriType.RDA, gender=Gender.MALE, serving_size=100.0
            )
            return asdict(analysis)
        except Exception as e:
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
        try:
            data = await request.json()
            if not data:
                raise HTTPException(status_code=400, detail="Request body is required")

            ingredient_id = data.get('ingredient_id')
            fdc_id = data.get('fdc_id')
            overwrite = data.get('overwrite', False)
            log.info("apply ingredient_id=%s fdc_id=%s overwrite=%s", ingredient_id, fdc_id, overwrite)

            if not ingredient_id:
                raise HTTPException(status_code=400, detail="ingredient_id is required")
            if not fdc_id:
                raise HTTPException(status_code=400, detail="fdc_id is required")

            ingredient = db.query(Ingredient).filter_by(_id=ingredient_id).first()
            if not ingredient:
                raise HTTPException(status_code=404, detail=f"Ingredient with ID {ingredient_id} not found")

            t0 = time.monotonic()
            food_details = usda_reader.get_food_details(fdc_id)
            if not food_details:
                raise HTTPException(status_code=404, detail=f"USDA food with FDC ID {fdc_id} not found")
            log.info("apply: fetched food details in %.2fs", time.monotonic() - t0)

            if overwrite:
                db.query(IngredientComposition).filter_by(ingredient_id=ingredient_id, source='USDA').delete()

            nutrients = food_details.get('nutrients', [])
            added_count = 0
            for nutrient in nutrients:
                if not nutrient['amount'] or nutrient['amount'] == 0:
                    continue
                if not overwrite:
                    existing = db.query(IngredientComposition).filter_by(
                        ingredient_id=ingredient_id, name=nutrient['name'], source='USDA'
                    ).first()
                    if existing:
                        continue

                composition = IngredientComposition(
                    ingredient_id=ingredient_id,
                    kind='nutrient',
                    name=nutrient['name'],
                    quantity=nutrient['amount'],
                    unit=nutrient['unit'],
                    daily_value=nutrient.get('percent_daily_value', 0.0),
                    source='USDA',
                    extension={
                        'fdc_id': fdc_id,
                        'usda_description': food_details['description'],
                        'nutrient_id': nutrient['nutrient_id']
                    }
                )
                db.add(composition)
                added_count += 1

            db.commit()
            log.info("apply done: added %d compositions in %.2fs", added_count, time.monotonic() - t0)
            updated_ingredient = db.query(Ingredient).filter_by(_id=ingredient_id).first()
            return {
                "success": True,
                "ingredient": updated_ingredient.to_json(),
                "added_compositions": added_count,
                "usda_food": food_details['description'],
                "fdc_id": fdc_id
            }
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            log.exception("apply failed")
            raise HTTPException(status_code=500, detail=str(e))

    # --- Nutrient list ---

    @router.get("/usda/nutrient-list")
    def get_nutrient_list():
        try:
            nutrients = []
            with open(usda_reader.nutrient_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    nutrients.append({
                        'id': row['id'],
                        'name': row['name'],
                        'unit': row['unit_name'],
                        'nutrient_nbr': row.get('nutrient_nbr', '')
                    })
            return {"count": len(nutrients), "nutrients": nutrients}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router
