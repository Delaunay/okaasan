"""EasyOCR backend for the OCR adapter."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np
import easyocr

from .base import OCREngine, OCRLine, OCRResult

if TYPE_CHECKING:
    from PIL import Image

log = logging.getLogger(__name__)

# Language mapping: our short codes -> EasyOCR language codes
_LANG_MAP: dict[str, list[str]] = {
    "en": ["en"],
    "fr": ["fr"],
    "en+fr": ["en", "fr"],
}


class EasyOCREngine(OCREngine):
    """Wraps the ``easyocr`` library."""

    def __init__(self) -> None:
        self._readers: dict[str, easyocr.Reader] = {}

    def _get_reader(self, lang: str) -> easyocr.Reader:
        if lang not in self._readers:
            codes = _LANG_MAP.get(lang, [lang])
            log.info("Initializing EasyOCR reader for %s", codes)
            self._readers[lang] = easyocr.Reader(codes, gpu=False)
        return self._readers[lang]

    def scan(self, image: "Image.Image", lang: str = "en") -> OCRResult:
        reader = self._get_reader(lang)
        img_array = np.array(image.convert("RGB"))
        h, w = img_array.shape[:2]

        raw = reader.readtext(img_array)

        lines: list[OCRLine] = []
        for bbox_pts, text, conf in raw:
            xs = [p[0] for p in bbox_pts]
            ys = [p[1] for p in bbox_pts]
            x1, x2 = min(xs) / w, max(xs) / w
            y1, y2 = min(ys) / h, max(ys) / h
            lines.append(OCRLine(text=text, bbox=(x1, y1, x2, y2), confidence=float(conf)))

        return OCRResult(lines=lines, image_width=w, image_height=h)
