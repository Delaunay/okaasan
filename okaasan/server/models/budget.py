from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base


#
#  We need to handle different source of information
#  and then make them match
#

class Receipt(Base):
    """Receipt you receive from the seller"""
    
    __tablename__ = 'receipts'


class ReceiptItem(Base):
    """Item from a receipt, can be used to populate products"""

        __tablename__ = 'receipt_items'

class Expense(Base):
    """Expense Item from your bank/credit card.
    Can be linked to a receipt but does not have to be.
    """

    __tablename__ = 'expenses'

