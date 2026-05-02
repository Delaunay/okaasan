from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index, or_
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from ..models.common import Base



class Task(Base):
    __tablename__ = 'tasks'

    _id = Column(Integer, primary_key=True)
    root_id = Column(Integer, nullable=True, default=None) # ForeignKey('tasks._id')
    parent_id = Column(Integer, ForeignKey('tasks._id'), nullable=True, default=None)

    title = Column(String(100), nullable=False)
    description = Column(Text)
    datetime_deadline = Column(DateTime)
    datetime_done = Column(DateTime)
    datetime_started = Column(DateTime, nullable=True)
    datetime_completed = Column(DateTime, nullable=True)
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

    # Tags: ["Work", "Sport", "Free"] — used for digest slot matching
    tag = Column(JSON, nullable=True)

    # DEPRECATED: use tags instead
    time_slot = Column(String(50), nullable=True)

    # How often this repeats: "daily", "weekly", "monthly", "yearly"
    periodicity = Column(String(50), nullable=True)

    # Estimated duration in minutes
    time_estimate = Column(Integer, nullable=True)

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

    @staticmethod
    def capitalize_tags(tags):
        if not tags:
            return []
        return [t.capitalize() for t in tags if t]

    def __repr__(self):
        return f'<Task {self.title}>'


    @staticmethod
    def get_task_forest(session, task_ids, actionable_only=False):
        nodes = (
            session.query(Task)
            .filter(or_(Task.root_id.in_(task_ids), Task._id.in_(task_ids)))
            .order_by(Task.priority.desc(), Task._id.asc())
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
            # This does not work because priority sorting make it a bit weird (children being first)
            # assert len(children) == 0, "All the children should have been sorted correctly"

        if not actionable_only:
            return roots

        actionable = []

        def walk(node, inherited_tags, breadcrumb):
            own_tags = node.get("tag") or []
            merged = list(dict.fromkeys(inherited_tags + own_tags))
            effective_tags = Task.capitalize_tags(merged)

            current_path = breadcrumb + [node["title"]]

            kids = node.get("children", [])
            undone_kids = [k for k in kids if not k.get("done")]

            if not kids or not undone_kids:
                if not node.get("done"):
                    node["effective_tags"] = effective_tags
                    node["breadcrumb"] = " / ".join(current_path)
                    actionable.append(node)
            else:
                child_inherited = effective_tags + [node["title"].capitalize()]
                for child in undone_kids:
                    walk(child, child_inherited, current_path)

        for root in roots:
            walk(root, root.get("tag") or [], [])

        return actionable

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
            'datetime_started': self.datetime_started.isoformat() if self.datetime_started else None,
            'datetime_completed': self.datetime_completed.isoformat() if self.datetime_completed else None,
            'done': self.done,
            'price_budget': self.price_budget,
            'price_real': self.price_real,
            'people_count': self.people_count,
            'template': self.template,
            'recuring': self.recuring,
            'active': self.active,
            'tag': Task.capitalize_tags(self.tag),
            'periodicity': self.periodicity,
            'time_estimate': self.time_estimate,
            'extension': self.extension,
            "priority": self.priority if self.priority is not None else 0,
            "children": []
        }