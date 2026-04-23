"""
USDA CSV Reader Utility

This module provides efficient access to USDA FoodData Central CSV files.
Since the CSV files are very large (2M+ rows), we use CSV iteration rather than loading everything into memory.
"""

import csv
import os
from typing import List, Dict, Optional, Tuple
from functools import lru_cache

HERE = os.path.dirname(__file__)
USDA_FOLDER = os.path.join(HERE, "..", "..", "data", "usda")


class USDAReader:
    """Reader for USDA FoodData Central CSV files"""

    def __init__(self, usda_folder: str = USDA_FOLDER):
        self.usda_folder = usda_folder
        self.food_csv = os.path.join(usda_folder, "food.csv")
        self.food_nutrient_csv = os.path.join(usda_folder, "food_nutrient.csv")
        self.nutrient_csv = os.path.join(usda_folder, "nutrient.csv")
        self.food_category_csv = os.path.join(usda_folder, "food_category.csv")

    def search_foods(self, query: str, limit: int = 20, data_type: Optional[str] = None) -> List[Dict]:
        """
        Search for foods by description

        Args:
            query: Search term to match against food description
            limit: Maximum number of results to return
            data_type: Optional filter for data_type (e.g., 'branded_food', 'sr_legacy_food')

        Returns:
            List of food items matching the query
        """
        results = []
        query_lower = query.lower()

        with open(self.food_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                print(query)
                # Check if description matches query
                description = row.get('description', '')
                if query_lower in description.lower():
                    # Apply data_type filter if specified
                    if data_type and row.get('data_type', '') != data_type:
                        continue

                    results.append({
                        'fdc_id': row['fdc_id'],
                        'data_type': row['data_type'],
                        'description': description,
                        'food_category_id': row.get('food_category_id', ''),
                        'publication_date': row.get('publication_date', '')
                    })

                    if len(results) >= limit:
                        break

        return results

    @lru_cache(maxsize=128)
    def get_nutrient_info(self, nutrient_id: str) -> Optional[Dict]:
        """
        Get nutrient information by ID (cached)

        Args:
            nutrient_id: The nutrient ID to look up

        Returns:
            Dict with nutrient name and unit, or None if not found
        """
        with open(self.nutrient_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['id'] == nutrient_id:
                    return {
                        'id': row['id'],
                        'name': row['name'],
                        'unit_name': row['unit_name'],
                        'nutrient_nbr': row.get('nutrient_nbr', ''),
                        'rank': row.get('rank', '')
                    }
        return None

    def get_food_nutrients(self, fdc_id: str) -> List[Dict]:
        """
        Get all nutrients for a specific food

        Args:
            fdc_id: The food's FDC ID

        Returns:
            List of nutrients with their amounts
        """
        nutrients = []

        with open(self.food_nutrient_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['fdc_id'] == fdc_id:
                    nutrient_id = row['nutrient_id']
                    nutrient_info = self.get_nutrient_info(nutrient_id)

                    if nutrient_info:
                        amount = row.get('amount', '')
                        try:
                            amount_float = float(amount) if amount else 0.0
                        except ValueError:
                            amount_float = 0.0

                        # Try to parse percent daily value
                        pdv = row.get('percent_daily_value', '')
                        try:
                            pdv_float = float(pdv) if pdv else 0.0
                        except ValueError:
                            pdv_float = 0.0

                        nutrients.append({
                            'nutrient_id': nutrient_id,
                            'name': nutrient_info['name'],
                            'amount': amount_float,
                            'unit': nutrient_info['unit_name'],
                            'percent_daily_value': pdv_float
                        })

        return nutrients

    def get_food_details(self, fdc_id: str) -> Optional[Dict]:
        """
        Get complete details for a food including all nutrients

        Args:
            fdc_id: The food's FDC ID

        Returns:
            Dict with food info and nutrients, or None if not found
        """
        # First, find the food
        food_info = None
        with open(self.food_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['fdc_id'] == fdc_id:
                    food_info = {
                        'fdc_id': row['fdc_id'],
                        'data_type': row['data_type'],
                        'description': row['description'],
                        'food_category_id': row.get('food_category_id', ''),
                        'publication_date': row.get('publication_date', '')
                    }
                    break

        if not food_info:
            return None

        # Get all nutrients for this food
        nutrients = self.get_food_nutrients(fdc_id)
        food_info['nutrients'] = nutrients

        return food_info

    @lru_cache(maxsize=128)
    def get_food_category(self, category_id: str) -> Optional[Dict]:
        """
        Get food category information by ID (cached)

        Args:
            category_id: The category ID to look up

        Returns:
            Dict with category info, or None if not found
        """
        if not category_id:
            return None

        with open(self.food_category_csv, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['id'] == category_id:
                    return {
                        'id': row['id'],
                        'code': row.get('code', ''),
                        'description': row.get('description', '')
                    }
        return None

