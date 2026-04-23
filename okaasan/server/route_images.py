from __future__ import annotations

import os
import uuid
import traceback

from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse

from ..tools.images import centercrop_resize_image

router = APIRouter()

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _secure_filename(filename: str) -> str:
    """Minimal filename sanitization."""
    import re
    filename = os.path.basename(filename)
    filename = re.sub(r'[^\w\s\-.]', '', filename).strip()
    return filename or "unnamed"


@router.post("/upload", status_code=201)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    namespace: str = Form(None),
):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed. Please use: png, jpg, jpeg, gif, webp")
        if not namespace:
            raise HTTPException(status_code=400, detail="missing namespace")

        upload_folder = request.app.state.upload_folder
        originals_folder = request.app.state.originals_folder
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{namespace}.{file_extension}"

        if os.path.exists(originals_folder):
            original_path = os.path.join(originals_folder, filename)
            folder_path = os.path.dirname(original_path)
            os.makedirs(folder_path, exist_ok=True)
            if os.path.exists(original_path):
                os.rename(original_path, original_path + '.old')
            contents = await file.read()
            with open(original_path, 'wb') as f:
                f.write(contents)
            await file.seek(0)

        image = Image.open(file.file)
        result_filename = centercrop_resize_image(upload_folder, image, namespace, file_extension)
        file_url = f"/uploads/{result_filename}"

        return {"url": file_url, "filename": result_filename, "folder": ""}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download-image", status_code=201)
async def download_image(
    request: Request,
    file: UploadFile = File(...),
    path: str = Form(""),
):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not allowed. Please use: png, jpg, jpeg, gif, webp")
        if not path:
            raise HTTPException(status_code=400, detail="Missing article path")

        upload_folder = request.app.state.upload_folder
        safe_parts = [_secure_filename(p) for p in path.split('/') if p.strip()]
        if not safe_parts:
            raise HTTPException(status_code=400, detail="Invalid article path")

        filename = _secure_filename(file.filename)
        dest_dir = os.path.join(upload_folder, *safe_parts)
        os.makedirs(dest_dir, exist_ok=True)

        dest_path = os.path.join(dest_dir, filename)
        if os.path.exists(dest_path):
            name, ext = os.path.splitext(filename)
            filename = f"{name}_{uuid.uuid4().hex[:8]}{ext}"
            dest_path = os.path.join(dest_dir, filename)

        contents = await file.read()
        with open(dest_path, 'wb') as f:
            f.write(contents)

        relative = '/'.join(safe_parts + [filename])
        file_url = f"/api/uploads/{relative}"
        return {"url": file_url, "filename": filename}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/uploads/{filepath:path}")
def uploaded_file(filepath: str, request: Request):
    upload_folder = request.app.state.upload_folder
    full_path = os.path.join(upload_folder, filepath)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(full_path)
