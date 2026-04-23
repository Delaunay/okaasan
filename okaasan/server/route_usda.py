from __future__ import annotations

import os
import csv
import time
import traceback
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .models import Ingredient, IngredientComposition
from .usda.usda_reader import USDAReader

HERE = os.path.dirname(__file__)
USDA_FOLDER = os.path.join(HERE, "..", "data", "usda")


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


def create_usda_routers(engine):
    fdc_router = APIRouter()
    csv_router = APIRouter()

    get_db = get_db_from_engine(engine)

    # FDC API routes
    try:
        from usda_fdc.client import FdcClient
        from usda_fdc.models import SearchResult, Food
        from usda_fdc.analysis.recipe import parse_ingredient as _parse_ingredient
        from usda_fdc.analysis import analyze_food, DriType, Gender
        from usda_fdc.analysis.recipe import create_recipe, analyze_recipe as _analyze_recipe
        from usda_fdc.analysis.nutrients import get_nutrient_by_usda_id, NUTRIENT_GROUPS

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
        client = RateLimitedClient(api_key)

        @fdc_router.get("/usda/search/{name}")
        def search_usda_foods(name: str):
            rows: SearchResult = client.search(name, data_type="Foundation")
            return [asdict(row) for row in rows.foods]

        @fdc_router.get("/usda/food/{fdc_id:int}")
        def get_food(fdc_id: int):
            food: Food = client.get_food(fdc_id, nutrients=None)
            return asdict(food)

        @fdc_router.get("/usda/analyze/{fdc_id:int}")
        def analyze_ingredient(fdc_id: int):
            try:
                food = client.get_food(fdc_id)
                analysis = analyze_food(
                    food, dri_type=DriType.RDA, gender=Gender.MALE, serving_size=100.0
                )
                return asdict(analysis)
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        @fdc_router.get("/usda/nutrient/group/{name}")
        def get_nutrient(name: str):
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
    except (ImportError, ModuleNotFoundError):
        pass

    # CSV-based USDA routes
    usda_reader = USDAReader(USDA_FOLDER)

    @csv_router.get("/usda/search")
    def search_usda_csv(q: str = "", limit: int = 20, data_type: str = "foundation_food"):
        if not q:
            raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
        limit = min(max(1, limit), 100)
        try:
            results = usda_reader.search_foods(q, limit=limit, data_type=data_type)
            return {"query": q, "count": len(results), "results": results}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @csv_router.get("/usda/food/{fdc_id}")
    def get_usda_food_details(fdc_id: str):
        try:
            food_details = usda_reader.get_food_details(fdc_id)
            if not food_details:
                raise HTTPException(status_code=404, detail=f"Food with FDC ID {fdc_id} not found")
            category_id = food_details.get('food_category_id')
            if category_id:
                category = usda_reader.get_food_category(category_id)
                if category:
                    food_details['category'] = category
            return food_details
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @csv_router.get("/usda/food/{fdc_id}/nutrients")
    def get_usda_food_nutrients(fdc_id: str):
        try:
            nutrients = usda_reader.get_food_nutrients(fdc_id)
            if not nutrients:
                food_details = usda_reader.get_food_details(fdc_id)
                if not food_details:
                    raise HTTPException(status_code=404, detail=f"Food with FDC ID {fdc_id} not found")
                return {"fdc_id": fdc_id, "count": 0, "nutrients": []}
            return {"fdc_id": fdc_id, "count": len(nutrients), "nutrients": nutrients}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @csv_router.post("/usda/apply")
    async def apply_usda_to_ingredient(request: Request, db: Session = Depends(get_db)):
        try:
            data = await request.json()
            if not data:
                raise HTTPException(status_code=400, detail="Request body is required")

            ingredient_id = data.get('ingredient_id')
            fdc_id = data.get('fdc_id')
            overwrite = data.get('overwrite', False)

            if not ingredient_id:
                raise HTTPException(status_code=400, detail="ingredient_id is required")
            if not fdc_id:
                raise HTTPException(status_code=400, detail="fdc_id is required")

            ingredient = db.query(Ingredient).filter_by(_id=ingredient_id).first()
            if not ingredient:
                raise HTTPException(status_code=404, detail=f"Ingredient with ID {ingredient_id} not found")

            food_details = usda_reader.get_food_details(fdc_id)
            if not food_details:
                raise HTTPException(status_code=404, detail=f"USDA food with FDC ID {fdc_id} not found")

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
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    @csv_router.get("/usda/nutrient-list")
    def get_usda_nutrient_list():
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

    return fdc_router, csv_router
