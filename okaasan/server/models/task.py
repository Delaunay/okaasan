from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index, or_
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base



class Task(Base):
    __tablename__ = 'tasks'

    _id = Column(Integer, primary_key=True)
    root_id = Column(Integer, nullable=True, default=None) # ForeignKey('tasks._id')
    parent_id = Column(Integer, ForeignKey('tasks._id'), nullable=True, default=None)

    title = Column(String(100), nullable=False)
    description = Column(Text)
    datetime_deadline = Column(DateTime)
    datetime_done = Column(DateTime)
    done = Column(Boolean, default=False)
    priority = Column(Integer, default=0)

    # Budgeting
    price_budget = Column(Float)
    price_real = Column(Float)
    people_count = Column(Integer)

    # Template Task
    template = Column(Boolean, default=False)
    recuring = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    #
    extension = Column(JSON)

    # # Relationships
    parent = relationship(
        "Task",
        remote_side=[_id],
        foreign_keys=[parent_id],
        back_populates="children"
    )

    children = relationship(
        "Task",
        foreign_keys=[parent_id],
        back_populates="parent",
        cascade="save-update"
    )

    def __repr__(self):
        return f'<Task {self.title}>'


    @staticmethod
    def get_task_forest(session, task_ids):
        nodes = (
            session.query(Task)
            .filter(or_(Task.root_id.in_(task_ids), Task._id.in_(task_ids)))
            .order_by(Task.priority.desc(), Task._id)
            .order_by(Task._id.asc())
            .all()
        )

        parents = {}
        roots = []
        children = []

        for node in nodes:
            if node._id == node.root_id or node.parent_id is None:
                obj = node.to_json()
                parents[node._id] = obj
                roots.append(obj)
            else:
                children.append(node)

        assert len(roots) == len(task_ids), "All roots should have been fetched"

        # If the query order by task_id, it should do this loop in a single pass
        # because parent need to be created first so their _id will be smaller
        # than the children
        while len(children) > 0:
            missed = []
            for task in children:
                parent = parents.get(task.parent_id)
                if parent is not None:
                    obj = task.to_json()
                    parent.setdefault("children", []).append(obj)
                    parents[task._id] = obj
                else:
                    missed.append(task)

            children = missed
            assert len(children) == 0, "All the children should have been sorted correctly"

        return roots

    @staticmethod
    def get_task_tree(session, task_id):
        return Task.get_task_forest(session, task_ids=[task_id])[0]

    def to_json(self):
        return {
            'id': self._id,
            'root_id': self.root_id,
            'parent_id': self.parent_id,
            'title': self.title,
            'description': self.description,
            'datetime_deadline': self.datetime_deadline.isoformat() if self.datetime_deadline else None,
            'done': self.done,
            'price_budget': self.price_budget,
            'price_real': self.price_real,
            'people_count': self.people_count,
            'template': self.template,
            'recuring': self.recuring,
            'active': self.active,
            'extension': self.extension,
            "priority": self.priority if self.priority is not None else 0,
            "children": []
        }