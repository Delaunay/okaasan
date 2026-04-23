from datetime import datetime, timedelta
import traceback

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .models import Event

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/routine/{owner}/{name}")
def get_routine_events(owner: str, name: str, db: Session = Depends(get_db)):
    try:
        query = db.query(Event).filter(
            Event.template == True,
            Event.owner == owner,
            Event.name == name
        )
        events = query.all()
        return [event.to_json() for event in events]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
def get_events(start: str = None, end: str = None, db: Session = Depends(get_db)):
    try:
        query = db.query(Event)

        if not start and not end:
            today = datetime.now()
            days_since_monday = today.weekday()
            monday = today - timedelta(days=days_since_monday)
            start = monday.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
            sunday = monday + timedelta(days=6)
            end = sunday.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()

        if start and end:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
            query = query.filter(
                Event.datetime_start >= start_dt,
                Event.datetime_end <= end_dt
            )

        events = query.all()
        return [event.to_json() for event in events]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/events", status_code=201)
async def create_event(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        event = Event(
            title=data.get('title'),
            description=data.get('description'),
            datetime_start=datetime.fromisoformat(data.get('datetime_start').replace('Z', '+00:00')),
            datetime_end=datetime.fromisoformat(data.get('datetime_end').replace('Z', '+00:00')),
            location=data.get('location'),
            color=data.get('color', '#3182CE'),
            kind=data.get('kind', 1),
            done=data.get('done', False),
            price_budget=data.get('price_budget'),
            price_real=data.get('price_real'),
            people_count=data.get('people_count'),
            active=data.get('active', True),
            template=data.get('template', False),
            owner=data.get('owner'),
            name=data.get('name')
        )
        db.add(event)
        db.commit()
        return event.to_json()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    try:
        event = db.query(Event).get(event_id)
        if event:
            return event.to_json()
        raise HTTPException(status_code=404, detail="Event not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/events/{event_id}")
async def update_event(event_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        event = db.query(Event).get(event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        data = await request.json()
        event.title = data.get('title', event.title)
        event.description = data.get('description', event.description)
        if data.get('datetime_start'):
            event.datetime_start = datetime.fromisoformat(data.get('datetime_start').replace('Z', '+00:00'))
        if data.get('datetime_end'):
            event.datetime_end = datetime.fromisoformat(data.get('datetime_end').replace('Z', '+00:00'))
        event.location = data.get('location', event.location)
        event.color = data.get('color', event.color)
        event.kind = data.get('kind', event.kind)
        event.done = data.get('done', event.done)
        event.price_budget = data.get('price_budget', event.price_budget)
        event.price_real = data.get('price_real', event.price_real)
        event.people_count = data.get('people_count', event.people_count)
        event.active = data.get('active', event.active)
        if 'template' in data:
            event.template = data.get('template')
        if 'owner' in data:
            event.owner = data.get('owner')
        if 'name' in data:
            event.name = data.get('name')

        db.commit()
        return event.to_json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    try:
        event = db.query(Event).get(event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        db.delete(event)
        db.commit()
        return {"message": "Event deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
