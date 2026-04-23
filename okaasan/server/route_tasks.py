from datetime import datetime
from traceback import print_exc

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .models import Task

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
        db.delete(task)
        db.commit()
        return {"message": "Task deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
