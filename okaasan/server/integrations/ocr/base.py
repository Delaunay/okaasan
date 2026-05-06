"""Abstract OCR engine contract.

Every concrete backend (EasyOCR, Tesseract, Cloud Vision, ...) must
subclass :class:`OCREngine` and implement :meth:`scan`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PIL import Image


@dataclass
class OCRLine:
    """A single detected text region.

    ``bbox`` coordinates are **normalised to 0-1** relative to image
    dimensions so the frontend can overlay boxes at any display size.
    Format: ``(x1, y1, x2, y2)`` — top-left / bottom-right corners.
    """

    text: str
    bbox: tuple[float, float, float, float]
    confidence: float


@dataclass
class OCRResult:
    lines: list[OCRLine] = field(default_factory=list)
    image_width: int = 0
    image_height: int = 0


class OCREngine(ABC):
    """Pluggable OCR backend."""

    @abstractmethod
    def scan(self, image: "Image.Image", lang: str = "en") -> OCRResult:
        """Run OCR on *image* and return detected lines."""
