from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Request

from .models import Recipe, Ingredient, Category, RecipeIngredient, IngredientComposition
from .decorators import expose

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


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
        recipe = Recipe(
            title=data.get('title'),
            description=data.get('description'),
            instructions=data.get('instructions', []),
            prep_time=data.get('prep_time'),
            cook_time=data.get('cook_time'),
            servings=data.get('servings'),
            images=data.get('images', []),
            author_id=data.get('author_id', 1),
            component=data.get('component', False)
        )
        db.add(recipe)
        db.flush()

        if 'ingredients' in data:
            for ing_data in data['ingredients']:
                ingredient_id = None
                ingredient_recipe_id = None
                if 'ingredient_recipe_id' in ing_data and ing_data['ingredient_recipe_id']:
                    if ing_data['ingredient_recipe_id'] == recipe._id:
                        raise HTTPException(status_code=400, detail="A recipe cannot reference itself as an ingredient")
                    ingredient_recipe_id = ing_data['ingredient_recipe_id']
                elif 'ingredient_id' in ing_data and ing_data['ingredient_id']:
                    ingredient_id = ing_data['ingredient_id']
                else:
                    ingredient = db.query(Ingredient).filter_by(name=ing_data['name']).first()
                    if not ingredient:
                        ingredient = Ingredient(name=ing_data['name'])
                        db.add(ingredient)
                        db.flush()
                    ingredient_id = ingredient._id

                recipe_ingredient = RecipeIngredient(
                    recipe_id=recipe._id,
                    ingredient_id=ingredient_id,
                    ingredient_recipe_id=ingredient_recipe_id,
                    quantity=ing_data.get('quantity', 1.0),
                    unit=ing_data.get('unit', 'piece'),
                    fdc_id=ing_data.get('fdc_id')
                )
                db.add(recipe_ingredient)

        if 'categories' in data:
            for cat_data in data['categories']:
                if cat_data.get('id', 0) < 0:
                    category = db.query(Category).filter_by(name=cat_data['name']).first()
                    if not category:
                        category = Category(name=cat_data['name'], description=cat_data.get('description', ''))
                        db.add(category)
                        db.flush()
                    recipe.categories.append(category)
                else:
                    category = db.get(Category, cat_data['id'])
                    if category:
                        recipe.categories.append(category)

        db.commit()
        return recipe.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


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
    try:
        recipe = db.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        data = await request.json()
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
            for ing_data in data['ingredients']:
                ingredient_id = None
                ingredient_recipe_id = None
                if 'ingredient_recipe_id' in ing_data and ing_data['ingredient_recipe_id']:
                    if ing_data['ingredient_recipe_id'] == recipe._id:
                        raise HTTPException(status_code=400, detail="A recipe cannot reference itself as an ingredient")
                    ingredient_recipe_id = ing_data['ingredient_recipe_id']
                elif 'ingredient_id' in ing_data and ing_data['ingredient_id']:
                    ingredient_id = ing_data['ingredient_id']
                else:
                    ingredient = db.query(Ingredient).filter_by(name=ing_data['name']).first()
                    if not ingredient:
                        ingredient = Ingredient(name=ing_data['name'])
                        db.add(ingredient)
                        db.flush()
                    ingredient_id = ingredient._id
                recipe_ingredient = RecipeIngredient(
                    recipe_id=recipe._id,
                    ingredient_id=ingredient_id,
                    ingredient_recipe_id=ingredient_recipe_id,
                    quantity=ing_data.get('quantity', 1.0),
                    unit=ing_data.get('unit', 'piece'),
                    fdc_id=ing_data.get('fdc_id')
                )
                db.add(recipe_ingredient)

        if 'categories' in data:
            recipe.categories.clear()
            for cat_data in data['categories']:
                if cat_data.get('id', 0) < 0:
                    category = db.query(Category).filter_by(name=cat_data['name']).first()
                    if not category:
                        category = Category(name=cat_data['name'], description=cat_data.get('description', ''))
                        db.add(category)
                        db.flush()
                    recipe.categories.append(category)
                else:
                    category = db.get(Category, cat_data['id'])
                    if category:
                        recipe.categories.append(category)

        db.commit()
        return recipe.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    try:
        recipe = db.get(Recipe, recipe_id)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        db.delete(recipe)
        db.commit()
        return {"message": "Recipe deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/recipes/nutrition/{recipe_id}")
@expose(recipe_id=select(Recipe._id))
def get_recipe_nutrition(recipe_id: int, db: Session = Depends(get_db)):
    compositions = db.query(IngredientComposition).filter_by(recipe_id=recipe_id).all()
    return [comp.to_json() for comp in compositions]


@router.patch("/recipes/ingredients/{recipe_ingredient_id}")
async def update_recipe_ingredient(recipe_ingredient_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        recipe_ingredient = db.get(RecipeIngredient, recipe_ingredient_id)
        if not recipe_ingredient:
            raise HTTPException(status_code=404, detail="Recipe ingredient not found")
        data = await request.json()
        if 'fdc_id' in data:
            recipe_ingredient.fdc_id = data['fdc_id']
        if 'quantity' in data:
            recipe_ingredient.quantity = data['quantity']
        if 'unit' in data:
            recipe_ingredient.unit = data['unit']
        db.commit()
        return recipe_ingredient.to_json()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
