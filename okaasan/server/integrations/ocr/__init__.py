"""OCR engine registry.

Use :func:`get_ocr_engine` to obtain the currently configured backend.
"""

from __future__ import annotations

import logging
from typing import Optional

from .base import OCREngine, OCRLine, OCRResult

log = logging.getLogger(__name__)

_engine: Optional[OCREngine] = None


def get_ocr_engine() -> OCREngine:
    """Return the singleton OCR engine, lazily initialised."""
    global _engine
    if _engine is None:
        from .easyocr_engine import EasyOCREngine

        _engine = EasyOCREngine()
        log.info("OCR engine initialised: EasyOCR")
    return _engine


__all__ = ["OCREngine", "OCRLine", "OCRResult", "get_ocr_engine"]
