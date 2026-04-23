from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base


class Product(Base):
    """Grocery list + prices"""
    __tablename__ = 'products'

    _id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)               # Name of the product
    brand = Column(String(50))
    quantity = Column(Float)                                # Quantity in the package
    unit = Column(String(50))                               # unit of quantity
    price = Column(Float)                                   # unitary price
    count = Column(Integer)                                 # Number of item purchase
    organic = Column(Boolean)                               # Organic or not
    created_at = Column(DateTime, default=lambda: datetime.now(datetime.UTC))  # Date of purchase
    ingredient = Column(String(50))                         # Ingredient this is usually used for
    fdc_id = Column(Integer)

    def to_json(self):
        return {
            'id': self._id,
            'name': self.name,
            'quantity': self.quantity,
            'unit': self.unit,
            'price': self.price,
            'organic': self.organic,
        }


class ProductInventory(Base):
    """Food currently in inventory, buying things increase the quantity, cooking lowers it"""
    __tablename__ = 'product_inventory'

    _id = Column(Integer, primary_key=True)
    name = Column(String(50), nullable=False)               # Name of the product
    quantity = Column(Float)                                # Current amount in inventory

    # price = Column(Float) += price / qty

    def to_json(self):
        return {
            'id': self._id,
            'name': self.name,
            'quantity': self.quantity
        }

class IngredientProduct(Base):
    """Match an ingredient to a product"""
    __tablename__ = 'ingredient_product_mapping'

    _id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey('products._id'), nullable=False)
    ingredient_id = Column(Integer, ForeignKey('ingredients._id'), nullable=False)
