from typing import List, Dict, Any

from flask import jsonify

from .models import Product, ProductIngredient, Ingredient


def produt_routes(app):
    """Routes to manage products (actual ingredients bought in stores)"""

