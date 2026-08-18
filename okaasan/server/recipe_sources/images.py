"""Download and locally cache images for recipes/ingredients from external sources.

Run as a separate pass after ``sync_source`` — recipes and ingredients are
created with the source's original image URL stashed in
``extension[source]["image_url"]`` (and no local image yet); this fills the
local copy in from there.
"""
from __future__ import annotations

import io
import logging
import time
from typing import Callable

import httpx
from PIL import Image
from sqlalchemy.orm import Session

from ..paths import thirdparty_folder
from ..recipe.models import Ingredient, Recipe
from ...tools.images import centercrop_resize_image

log = logging.getLogger("okaasan.recipe_sources.images")

REQUEST_DELAY_SECONDS = 0.1

# If the CDN/origin is down or blocking us, fail fast instead of grinding
# through the whole catalog making doomed requests for hours.
CIRCUIT_BREAKER_THRESHOLD = 15


def _run_download(
    entities: list,
    *,
    get_image_url: Callable,
    has_image: Callable,
    apply_image: Callable,
    entity_id: Callable,
    db: Session,
    limit: int | None,
    on_progress: Callable[[dict], None] | None,
) -> dict:
    stats = {"downloaded": 0, "skipped": 0, "failed": 0, "errors": []}
    attempted = 0
    consecutive_failures = 0

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        for entity in entities:
            if has_image(entity):
                stats["skipped"] += 1
                continue

            image_url = get_image_url(entity)
            if not image_url:
                stats["skipped"] += 1
                continue

            if limit is not None and attempted >= limit:
                break
            attempted += 1

            try:
                resp = client.get(image_url)
                resp.raise_for_status()
                pil_image = Image.open(io.BytesIO(resp.content)).convert("RGB")
                apply_image(entity, pil_image)
                db.commit()
                stats["downloaded"] += 1
                consecutive_failures = 0
            except Exception as e:
                db.rollback()
                log.warning("Failed to download image for %s: %s", entity_id(entity), e)
                stats["failed"] += 1
                stats["errors"].append(f"{entity_id(entity)}: {e}")
                consecutive_failures += 1
                if consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
                    stats["errors"].append(
                        f"Aborted after {consecutive_failures} consecutive failures — "
                        "likely a CDN/network outage rather than per-item issues. Re-run later."
                    )
                    break

            time.sleep(REQUEST_DELAY_SECONDS)
            if on_progress:
                on_progress(dict(stats))

    return stats


def download_images(
    source_name: str,
    session_factory: Callable[[], Session],
    *,
    limit: int | None = None,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Download recipe photos for every ``source_name`` recipe missing one."""
    folder = thirdparty_folder() / source_name
    folder.mkdir(parents=True, exist_ok=True)

    db = session_factory()
    try:
        recipes = db.query(Recipe).filter(Recipe.source == source_name).all()

        def apply_image(recipe, pil_image):
            filename = centercrop_resize_image(str(folder), pil_image, f"{recipe._id}/preview_1", "jpg")
            recipe.images = [f"/thirdparty/{source_name}/{filename}"]

        return _run_download(
            recipes,
            get_image_url=lambda r: (r.extension or {}).get(source_name, {}).get("image_url"),
            has_image=lambda r: bool(r.images),
            apply_image=apply_image,
            entity_id=lambda r: r._id,
            db=db,
            limit=limit,
            on_progress=on_progress,
        )
    finally:
        db.close()


def download_ingredient_images(
    source_name: str,
    session_factory: Callable[[], Session],
    *,
    limit: int | None = None,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Download ingredient photos for every ``source_name``-sourced ingredient missing one."""
    folder = thirdparty_folder() / source_name / "ingredients"
    folder.mkdir(parents=True, exist_ok=True)

    db = session_factory()
    try:
        ingredients = (
            db.query(Ingredient)
            .filter(Ingredient.extension.isnot(None))
            .all()
        )
        # Ingredient.extension holds arbitrary per-source data (not just this
        # source's), so filter in Python rather than trying to express the
        # JSON key lookup in SQL.
        ingredients = [i for i in ingredients if (i.extension or {}).get(source_name, {}).get("image_url")]

        def apply_image(ingredient, pil_image):
            filename = centercrop_resize_image(str(folder), pil_image, f"{ingredient._id}/preview_1", "jpg")
            ingredient.image = f"/thirdparty/{source_name}/ingredients/{filename}"

        return _run_download(
            ingredients,
            get_image_url=lambda i: (i.extension or {}).get(source_name, {}).get("image_url"),
            has_image=lambda i: bool(i.image),
            apply_image=apply_image,
            entity_id=lambda i: i._id,
            db=db,
            limit=limit,
            on_progress=on_progress,
        )
    finally:
        db.close()


def download_step_images(
    source_name: str,
    session_factory: Callable[[], Session],
    *,
    limit: int | None = None,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Download instruction-step photos for every ``source_name`` recipe.

    Each recipe can have several step images, so the "entity" here is a
    (recipe, step_index) pair rather than one row per recipe.
    """
    folder = thirdparty_folder() / source_name
    folder.mkdir(parents=True, exist_ok=True)

    db = session_factory()
    try:
        recipes = db.query(Recipe).filter(Recipe.source == source_name).all()

        tasks = [
            (recipe, idx)
            for recipe in recipes
            for idx, step in enumerate(recipe.instructions or [])
            if (step.get("image") or "").startswith("http")
        ]

        def apply_image(task, pil_image):
            recipe, idx = task
            filename = centercrop_resize_image(str(folder), pil_image, f"{recipe._id}/step_{idx + 1}", "jpg")
            # Copy-then-reassign (not an in-place mutation) so SQLAlchemy's
            # dirty-tracking actually sees this JSON column as changed.
            instructions = list(recipe.instructions)
            instructions[idx] = {**instructions[idx], "image": f"/thirdparty/{source_name}/{filename}"}
            recipe.instructions = instructions

        return _run_download(
            tasks,
            get_image_url=lambda t: t[0].instructions[t[1]].get("image"),
            has_image=lambda t: not (t[0].instructions[t[1]].get("image") or "").startswith("http"),
            apply_image=apply_image,
            entity_id=lambda t: f"{t[0]._id}:step{t[1] + 1}",
            db=db,
            limit=limit,
            on_progress=on_progress,
        )
    finally:
        db.close()
