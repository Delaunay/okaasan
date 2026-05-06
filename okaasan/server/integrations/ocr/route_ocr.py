"""Receipt OCR scanning endpoint."""

from __future__ import annotations

import logging
import traceback
from dataclasses import asdict

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from . import get_ocr_engine

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/scan")
async def scan_receipt(
    file: UploadFile = File(...),
    lang: str = Form("en"),
):
    """Run OCR on an uploaded receipt image.

    Returns a list of detected text lines with normalised bounding boxes
    and confidence scores so the frontend can do spatial post-processing.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    try:
        image = Image.open(file.file)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not open image")

    try:
        engine = get_ocr_engine()
        result = engine.scan(image, lang=lang)
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")

    return asdict(result)
