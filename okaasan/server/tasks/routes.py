from datetime import datetime
from traceback import print_exc

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .models import Task
from ..calendar.models import Event

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/tasks")
def get_tasks(db: Session = Depends(get_db)):
    try:
        task_ids = (
            db.query(Task._id)
            .filter(Task.parent_id.is_(None))
            .all()
        )
        return Task.get_task_forest(db, [t[0] for t in task_ids])
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tasks", status_code=201)
async def create_task(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        task = Task(
            title=data.get('title'),
            description=data.get('description'),
            datetime_deadline=datetime.fromisoformat(data.get('datetime_deadline').replace('Z', '+00:00')) if data.get('datetime_deadline') else None,
            done=data.get('done', False),
            priority=data.get('priority', 0),
            price_budget=data.get('price_budget'),
            price_real=data.get('price_real'),
            people_count=data.get('people_count'),
            template=data.get('template', False),
            recuring=data.get('recuring', False),
            active=data.get('active', True),
            tag=Task.capitalize_tags(data.get('tag')),
            periodicity=data.get('periodicity'),
            time_estimate=data.get('time_estimate'),
            parent_id=data.get('parent_id', None),
            root_id=data.get('root_id', None),
        )

        if task.parent_id and task.root_id is None:
            parent = db.query(Task).get(task.parent_id)
            if parent:
                task.root_id = parent.root_id if parent.root_id else parent._id

        db.add(task)
        db.commit()

        if not task.parent_id:
            task.root_id = task._id
            db.commit()

        return task.to_json()
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


DEFAULT_TIME_ESTIMATE = 180  # 3 hours in minutes
MAX_TASKS_PER_SLOT = 3


@router.get("/tasks/weekly-digest")
def weekly_digest(
    owner: str = "default",
    routine: str = "work",
    db: Session = Depends(get_db),
):
    try:
        routine_events = (
            db.query(Event)
            .filter(Event.template == True, Event.owner == owner, Event.name == routine)
            .all()
        )

        events_sorted = sorted(routine_events, key=lambda e: (
            e.datetime_start.weekday() if e.datetime_start else 0,
            e.datetime_start if e.datetime_start else datetime.min,
        ))

        root_ids = (
            db.query(Task._id)
            .filter(Task.parent_id.is_(None), Task.done == False, Task.active == True)
            .all()
        )

        if root_ids:
            actionable = Task.get_task_forest(db, [r[0] for r in root_ids], actionable_only=True)
        else:
            actionable = []

        # Index tasks by each tag they carry (capitalized)
        by_tag = {}
        for task in actionable:
            tags = task.get("effective_tags") or []
            for t in tags:
                by_tag.setdefault(t.capitalize(), []).append(task)

        for tag_key in by_tag:
            by_tag[tag_key].sort(key=lambda t: t.get("priority", 0), reverse=True)

        packed_ids = set()

        slots = []
        for event in events_sorted:
            event_tag = (event.title or "").strip().capitalize()
            candidates = [t for t in by_tag.get(event_tag, []) if t["id"] not in packed_ids]

            slot_minutes = 0
            if event.datetime_start and event.datetime_end:
                delta = event.datetime_end - event.datetime_start
                slot_minutes = int(delta.total_seconds() / 60)

            packed = []
            used_minutes = 0

            for task in candidates:
                est = task.get("time_estimate") or DEFAULT_TIME_ESTIMATE
                if len(packed) < MAX_TASKS_PER_SLOT and used_minutes + est <= slot_minutes:
                    packed.append(task)
                    used_minutes += est
                    packed_ids.add(task["id"])

            slots.append({
                "event": event.to_json(),
                "tasks": packed,
                "slot_minutes": slot_minutes,
                "used_minutes": used_minutes,
            })

        unscheduled = [t for t in actionable if t["id"] not in packed_ids]

        return {
            "slots": slots,
            "unscheduled": unscheduled,
        }
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db)):
    try:
        tree = Task.get_task_tree(session=db, task_id=task_id)
        return tree
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tasks/{task_id}")
async def update_task(task_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        task = db.query(Task).get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        data = await request.json()
        task.title = data.get('title', task.title)
        task.description = data.get('description', task.description)
        if data.get('datetime_deadline'):
            task.datetime_deadline = datetime.fromisoformat(data.get('datetime_deadline').replace('Z', '+00:00'))
        task.done = data.get('done', task.done)
        task.priority = data.get('priority', task.priority)
        task.price_budget = data.get('price_budget', task.price_budget)
        task.price_real = data.get('price_real', task.price_real)
        task.people_count = data.get('people_count', task.people_count)
        task.template = data.get('template', task.template)
        task.recuring = data.get('recuring', task.recuring)
        task.active = data.get('active', task.active)
        if 'tag' in data:
            task.tag = Task.capitalize_tags(data.get('tag'))
        task.periodicity = data.get('periodicity', task.periodicity)
        task.time_estimate = data.get('time_estimate', task.time_estimate)

        if 'parent_id' in data:
            old_parent_id = task.parent_id
            task.parent_id = data.get('parent_id')
            if task.parent_id != old_parent_id:
                if task.parent_id:
                    parent = db.query(Task).get(task.parent_id)
                    if parent:
                        task.root_id = parent.root_id if parent.root_id else parent._id
                else:
                    task.root_id = task._id

        db.commit()
        return {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    try:
        task = db.query(Task).get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Delete all descendants (subtasks) by root_id or walk the tree
        if task.parent_id is None:
            db.query(Task).filter(Task.root_id == task_id, Task._id != task_id).delete()
        else:
            # For non-root tasks, recursively collect all descendant IDs
            to_delete = []
            queue = [task_id]
            while queue:
                parent = queue.pop()
                children = db.query(Task._id).filter(Task.parent_id == parent).all()
                for (child_id,) in children:
                    to_delete.append(child_id)
                    queue.append(child_id)
            if to_delete:
                db.query(Task).filter(Task._id.in_(to_delete)).delete(synchronize_session=False)

        db.delete(task)
        db.commit()
        return {"message": "Task deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


