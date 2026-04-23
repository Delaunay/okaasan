import os
import json
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from .decorators import expose
from . import gitsync

router = APIRouter()


def safe_name(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)


def _store_dir(request: Request) -> str:
    return os.path.join(request.app.state.upload_folder, 'data')


@router.get("/store/{collection}")
def jsonstore_list(collection: str, request: Request):
    folder = os.path.join(_store_dir(request), safe_name(collection))
    if not os.path.isdir(folder):
        return []
    names = sorted(
        os.path.splitext(f)[0]
        for f in os.listdir(folder)
        if f.endswith('.json') and not f.startswith('_')
    )
    return names


@router.get("/store/{collection}/{key}")
def jsonstore_get(collection: str, key: str, request: Request):
    path = os.path.join(_store_dir(request), safe_name(collection), safe_name(key) + '.json')
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type='application/json')


@router.put("/store/{collection}/{key}")
async def jsonstore_put(collection: str, key: str, request: Request):
    folder = os.path.join(_store_dir(request), safe_name(collection))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, safe_name(key) + '.json')
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    gitsync.notify_write()
    return {"message": "Saved", "path": f"data/{safe_name(collection)}/{safe_name(key)}.json"}


@router.delete("/store/{collection}/{key}")
def jsonstore_delete(collection: str, key: str, request: Request):
    path = os.path.join(_store_dir(request), safe_name(collection), safe_name(key) + '.json')
    if os.path.isfile(path):
        os.remove(path)
        gitsync.notify_write()
        return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Not found")
