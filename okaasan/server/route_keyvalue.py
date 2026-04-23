from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session
from sqlalchemy import func

from .models import KeyValueStore

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/kv")
def list_topics(db: Session = Depends(get_db)):
    try:
        topics = db.query(KeyValueStore.topic).distinct().all()
        return [topic[0] for topic in topics]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kv/{topic}")
def list_keys(topic: str, db: Session = Depends(get_db)):
    try:
        keys = db.query(KeyValueStore.key).filter(KeyValueStore.topic == topic).all()
        return [key[0] for key in keys]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kv/{topic}/{key}")
def get_keyvalue(topic: str, key: str, db: Session = Depends(get_db)):
    try:
        kv_entry = db.query(KeyValueStore).filter(
            KeyValueStore.topic == topic,
            KeyValueStore.key == key
        ).first()

        if kv_entry:
            return kv_entry.to_json()
        else:
            raise HTTPException(status_code=404, detail="Key not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kv/{topic}/{key}")
async def put_value(topic: str, key: str, request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        if not data or 'value' not in data:
            raise HTTPException(status_code=400, detail="Value is required in request body")

        value = data['value']

        stmt = insert(KeyValueStore).values(
            topic=topic,
            key=key,
            value=value,
            created_at=func.COALESCE(
                db.query(KeyValueStore.created_at)
                .filter(KeyValueStore.topic == topic, KeyValueStore.key == key)
                .scalar_subquery(),
                func.datetime('now')
            ),
            updated_at=func.datetime('now')
        )

        stmt = stmt.on_conflict_do_update(
            index_elements=['topic', 'key'],
            set_=dict(
                value=stmt.excluded.value,
                updated_at=stmt.excluded.updated_at
            )
        )

        db.execute(stmt)
        db.commit()
        return {"message": "Value stored successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
