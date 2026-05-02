from math import isclose

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from okaasan.server.models import Base, User
from okaasan.server.recipe.models import Ingredient, IngredientComposition, Recipe, RecipeIngredient
from okaasan.server.recipe.nutrition_calculator import calculate_recipe_nutrition


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_calculates_recipe_nutrition_per_100g_and_reports_missing_data():
    db = _session()
    user = User(username="tester", email="tester@example.com", password_hash="x")
    flour = Ingredient(name="Flour")
    salt = Ingredient(name="Salt")
    db.add_all([user, flour, salt])
    db.flush()

    recipe = Recipe(title="Bread", instructions=[], author_id=user._id)
    db.add(recipe)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=recipe._id, ingredient_id=flour._id, quantity=200, unit="g"),
        RecipeIngredient(recipe_id=recipe._id, ingredient_id=salt._id, quantity=50, unit="g"),
        IngredientComposition(
            ingredient_id=flour._id,
            kind="Nutrient",
            name="Calories",
            quantity=364,
            unit="kcal",
            daily_value=18.2,
        ),
    ])
    db.commit()

    result = calculate_recipe_nutrition(db, recipe._id)

    assert result["recipe_id"] == recipe._id
    assert result["normalization"] == {"type": "per_100g", "value": 100.0, "unit": "g"}
    assert result["error"] is True
    assert result["missing_nutrition_ingredients"][0]["ingredient_id"] == salt._id
    assert result["missing_nutrition_ingredients"][0]["name"] == "Salt"
    assert result["missing_nutrition_ingredients"][0]["reason"] == "no_composition"
    assert result["compositions"][0]["kind"] == "Nutrient"
    assert result["compositions"][0]["name"] == "Calories"
    assert isclose(result["compositions"][0]["quantity"], 291.2)
    assert result["compositions"][0]["unit"] == "kcal"
    assert isclose(result["compositions"][0]["daily_value"], 14.56)


def test_calculates_recipe_nutrition_per_portion():
    db = _session()
    user = User(username="tester", email="tester@example.com", password_hash="x")
    sugar = Ingredient(name="Sugar")
    db.add_all([user, sugar])
    db.flush()

    recipe = Recipe(title="Syrup", instructions=[], author_id=user._id)
    db.add(recipe)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=recipe._id, ingredient_id=sugar._id, quantity=200, unit="g"),
        IngredientComposition(
            ingredient_id=sugar._id,
            kind="Nutrient",
            name="Calories",
            quantity=400,
            unit="kcal",
            daily_value=20,
        ),
    ])
    db.commit()

    result = calculate_recipe_nutrition(db, recipe._id, portion_weight_g=50)

    assert result["error"] is False
    assert result["normalization"] == {"type": "per_portion", "value": 50.0, "unit": "g"}
    assert result["missing_nutrition_ingredients"] == []
    assert result["compositions"][0]["kind"] == "Nutrient"
    assert result["compositions"][0]["name"] == "Calories"
    assert isclose(result["compositions"][0]["quantity"], 200.0)
    assert result["compositions"][0]["unit"] == "kcal"
    assert isclose(result["compositions"][0]["daily_value"], 10.0)


def test_invalid_weight_data_returns_error_result_without_exception():
    db = _session()
    user = User(username="tester", email="tester@example.com", password_hash="x")
    vanilla = Ingredient(name="Vanilla")
    db.add_all([user, vanilla])
    db.flush()

    recipe = Recipe(title="Cake", instructions=[], author_id=user._id)
    db.add(recipe)
    db.flush()
    db.add_all([
        RecipeIngredient(recipe_id=recipe._id, ingredient_id=vanilla._id, quantity=1, unit="dash"),
        IngredientComposition(
            ingredient_id=vanilla._id,
            kind="Nutrient",
            name="Calories",
            quantity=288,
            unit="kcal",
            daily_value=14,
        ),
    ])
    db.commit()

    result = calculate_recipe_nutrition(db, recipe._id)

    assert result["error"] is True
    assert result["missing_nutrition_ingredients"][0]["reason"] == "unsupported_unit"
    assert result["compositions"] == []
    assert any("Total recipe weight is zero or unknown" in msg for msg in result["error_messages"])
