
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base


#
# Facts database
#
#   Facts are referencable pieces for informations
#
#
# So it needs to save the data in a format that can be referenced


class Facts:
    __tablename__ = 'derived_facts'

    # Example
    #                SRC   NAME            VALUE   TIME
    #   According to FRED, GDP increased by 2% in 2025
    #       =>
    #           (GDP pct(2025,2024) from fred)
    #       =>
    #   (select GDP where time=2025) / (select GDP where time=2024) 
    #

    kind = Column(String) 

    #
    # Arguments used to make the data query to compute the fact
    #
    start  = Column(DateTime)  # Time the value was measured or calculated 
    end    = Column(DateTime)  # Time the value was measured or calculated 
    name   = Column(String)    # Name of the value (GDP)
    source = Column(String)

    # Metric kind to compute (average, change over time etc..)
    operator = Column(String)


# because the value does not need to be a value this works for anything
# the problem is the facts needs to be verified
class Data:
    __tablename__ = 'data_facts'

    _id = Column(Integer, primary_key=True)

    name = Column(String)       # Name of the value (GDP)
    source = Column(String)     # Source of the 
    
    value = Column(JSON)           # Actual Value
    unit = Column(JSON)            # Unit of the measure ($)
    value_start = Column(DateTime) # Time the value was measured or calculated
    value_end = Column(DateTime)   # Time the value was measured or calculated

    published_time = Column(DateTime) # Time the value was published
