"""Private JSON store -- same API as route_jsonstore but writes to private/data/.

Data stored here is gitignored and never exposed through the static build.
"""
import os
import json
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from .paths import private_folder

router = APIRouter()


def safe_name(name: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)


def _store_dir() -> str:
    return str(private_folder() / "data")


@router.get("/pstore/{collection}")
def pstore_list(collection: str):
    folder = os.path.join(_store_dir(), safe_name(collection))
    if not os.path.isdir(folder):
        return []
    names = sorted(
        os.path.splitext(f)[0]
        for f in os.listdir(folder)
        if f.endswith('.json') and not f.startswith('_')
    )
    return names


@router.get("/pstore/{collection}/{key}")
def pstore_get(collection: str, key: str):
    path = os.path.join(_store_dir(), safe_name(collection), safe_name(key) + '.json')
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, media_type='application/json')


@router.put("/pstore/{collection}/{key}")
async def pstore_put(collection: str, key: str, request: Request):
    folder = os.path.join(_store_dir(), safe_name(collection))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, safe_name(key) + '.json')
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    return {"message": "Saved"}


@router.delete("/pstore/{collection}/{key}")
def pstore_delete(collection: str, key: str):
    path = os.path.join(_store_dir(), safe_name(collection), safe_name(key) + '.json')
    if os.path.isfile(path):
        os.remove(path)
        return {"message": "Deleted"}
    raise HTTPException(status_code=404, detail="Not found")
