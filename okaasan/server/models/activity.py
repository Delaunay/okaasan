#
# Actvity tracking from Garmin Watch
#

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Table,
    Text,
    UniqueConstraint,
    JSON,
    create_engine,
    select,
    Boolean,
    Index,
)
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base



class Post(Base):
    """A Post or an Activity, this is to broadcast change on the website,
    New recipe, new project, advancement in a project etc...

    """

    __tablename__ = "post"

    _id = Column(Integer, primary_key=True)

    title = Column(String(50))
    namespace = Column(String(255))
    tags = Column(JSON)
    extension = Column(JSON)

    created_at = Column(DateTime, default=lambda: datetime.now(datetime.UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(datetime.UTC))

    public = Column(Boolean, default=False)

    # Generic
    # content_type = Column(String(25))
    # content_id = Column(Integer, nullable=True)
    #
    #   OR
    #

    # Post Type
    article_id = Column(Integer, ForeignKey("articles._id"), nullable=True)
    recipe_id = Column(Integer, ForeignKey("recipes._id"), nullable=True)

