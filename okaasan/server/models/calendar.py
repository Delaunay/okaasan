from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base


#
# Calendar
#
#
#   How tp handle recuring events ?
#       We can generate events as the time passes
#
#   Generate Task list based on Events ?
#   Prioritized ?
#
#
# Template Day/week ?
#       Winter / Summer / Spring / Fall
#
#   Event is time based, blocks the time
#       they can have task attached to it
#
#   Tasks are things to do but they are not necessarily attached to
#   time to do it
#

#
#   New IDEA
#
#       Calendar is used to specify template days
#
#           Those are used to generate
#           A list of task to achive durint the day
#
#



#
#   The TODO list is a combination of Event and tasks
#

class Event(Base):
    __tablename__ = 'events'

    # To display a calaender
    # Column Week Days
    # Rows Time + Week Count

    _id = Column(Integer, primary_key=True)

    kind = Column(Integer)
    color = Column(String(7))  # Hex color code like #FF0000
    datetime_start = Column(DateTime, nullable=False)
    datetime_end = Column(DateTime, nullable=False)
    location = Column(String(200))
    title = Column(String(100), nullable=False)
    description = Column(Text)
    guests = Column(JSON)  # List of guest names or IDs

    # Scheduled Task ?
    task = Column(Integer, ForeignKey('tasks._id'), nullable=True)
    done = Column(Boolean, default=False)

    # Budgeting
    price_budget = Column(Float)
    price_real = Column(Float)
    people_count = Column(Integer)

    # Template Event
    template = Column(Boolean, default=False)
    recuring = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    owner = Column(String(200))
    name = Column(String(200))

    extension = Column(JSON)

    # Relationships
    # task = relationship('Task', back_populates='events')

    def __repr__(self):
        return f'<Event {self.title}>'

    def to_json(self):
        return {
            'id': self._id,
            'kind': self.kind,
            'color': self.color,
            'datetime_start': self.datetime_start.isoformat() + 'Z' if self.datetime_start else None,
            'datetime_end': self.datetime_end.isoformat() + 'Z' if self.datetime_end else None,
            'location': self.location,
            'title': self.title,
            'description': self.description,
            'guests': self.guests,
            'task': self.task,
            'done': self.done,
            'price_budget': self.price_budget,
            'price_real': self.price_real,
            'people_count': self.people_count,
            'template': self.template,
            'recuring': self.recuring,
            'active': self.active,
            'owner': self.owner,
            'name': self.name
        }
