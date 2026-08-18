"""Scraper for hellofresh.ca.

HelloFresh's recipe pages are a Next.js app. The page embeds a short-lived
anonymous Bearer token (``__NEXT_DATA__.props.pageProps.ssrPayload.serverAuth``)
that unlocks their internal recipe API, and their sitemap lists every
published recipe id — that combination lets us enumerate and fetch the full
catalog without going through their (buggy, 10k-row-capped) search endpoint.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Iterator

import httpx

from ..integrations.usda import normalize_nutrient_name
from .base import (
    NormalizedIngredient,
    NormalizedInstructionStep,
    NormalizedNutrition,
    NormalizedRecipe,
    RecipeSource,
)

log = logging.getLogger("okaasan.recipe_sources.hellofresh")

# normalize_nutrient_name() knows USDA's verbose nomenclature; HelloFresh
# uses plainer names for the same nutrients, so translate first.
_NUTRIENT_NAME_ALIASES = {
    "calories": "energy",
    "saturated fat": "fatty acids, total saturated",
    "trans fat": "fatty acids, total trans",
    "monounsaturated fat": "fatty acids, total monounsaturated",
    "polyunsaturated fat": "fatty acids, total polyunsaturated",
    "sugar": "sugars",
}


def _normalize_hellofresh_nutrient(raw_name: str, unit: str) -> tuple[str, str]:
    if raw_name.strip().lower() == "energy (kj)":
        return "_skip", ""  # redundant with Calories in kcal, same as the app's own kJ/kcal convention
    lookup_name = _NUTRIENT_NAME_ALIASES.get(raw_name.strip().lower(), raw_name)
    return normalize_nutrient_name(lookup_name, unit)

BASE_URL = "https://www.hellofresh.ca"
# Any recipe page works as a token source; this one is stable and lightweight.
TOKEN_PAGE_URL = f"{BASE_URL}/recipes/spicy-recipes"
SITEMAP_INDEX_URL = f"{BASE_URL}/sitemap_index.xml"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Be polite: HelloFresh isn't rate-limit-friendly to hammer, and the full
# catalog is ~15k recipes.
REQUEST_DELAY_SECONDS = 0.15
MAX_RETRIES = 3

# HelloFresh's own `imageLink` field (a d3hvwccx09j84u.cloudfront.net URL) no
# longer resolves — that distribution 502s "failed to contact origin" for
# every path, old and freshly-scraped alike. Their current working image CDN
# is media.hellofresh.com, which takes the same *relative* path (imagePath /
# a step image's "path" / an ingredient's imagePath) behind a transform
# prefix and a literal "hellofresh_s3" segment. Confirmed by hand against
# both a real recipe photo and a real ingredient photo.
MEDIA_BASE_URL = "https://media.hellofresh.com"


def _media_url(image_path: str | None, width: int = 750) -> str | None:
    if not image_path:
        return None
    return f"{MEDIA_BASE_URL}/w_{width},q_auto,f_auto,c_limit,fl_lossy/hellofresh_s3{image_path}"


_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S
)
_RECIPE_ID_RE = re.compile(r'-([0-9a-f]{24})(?:\?|$)')
_LOC_RE = re.compile(r'<loc>([^<]*)</loc>')
_DURATION_RE = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?')


def _parse_duration_minutes(value: str | None) -> int | None:
    """Parse an ISO-8601 duration like 'PT1H30M' or 'PT35M' into minutes."""
    if not value:
        return None
    m = _DURATION_RE.fullmatch(value.strip())
    if not m:
        return None
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    total = hours * 60 + minutes
    return total or None


class HelloFreshSource(RecipeSource):
    name = "hellofresh"
    display_name = "HelloFresh"

    def __init__(self, *, client: httpx.Client | None = None):
        self._client = client or httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=20.0,
        )
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ── Auth ─────────────────────────────────────────────────────

    def _get_token(self, force: bool = False) -> str:
        if not force and self._token and time.monotonic() < self._token_expires_at:
            return self._token

        resp = self._client.get(
            TOKEN_PAGE_URL,
            headers={"Accept": "text/html", "User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
        m = _NEXT_DATA_RE.search(resp.text)
        if not m:
            raise RuntimeError("Could not find __NEXT_DATA__ on HelloFresh token page")

        import json
        data = json.loads(m.group(1))
        auth = data["props"]["pageProps"]["ssrPayload"]["serverAuth"]
        self._token = auth["access_token"]
        # Refresh a bit early rather than right at expiry.
        self._token_expires_at = time.monotonic() + max(auth.get("expires_in", 1800) - 300, 300)
        return self._token

    def _authed_get(self, url: str, **kwargs) -> httpx.Response:
        for attempt in range(MAX_RETRIES):
            token = self._get_token()
            resp = self._client.get(
                url, headers={"Authorization": f"Bearer {token}"}, **kwargs
            )
            if resp.status_code == 401:
                self._get_token(force=True)
                continue
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(1.0 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp
        resp.raise_for_status()
        return resp

    # ── Discovery ────────────────────────────────────────────────

    def iter_external_ids(self) -> Iterator[str]:
        index_resp = self._client.get(SITEMAP_INDEX_URL)
        index_resp.raise_for_status()
        locs = _LOC_RE.findall(index_resp.text)
        recipe_sitemap_url = next((l for l in locs if "sitemap_recipe_pages" in l), None)
        if not recipe_sitemap_url:
            raise RuntimeError("Could not find sitemap_recipe_pages.xml in sitemap index")

        sitemap_resp = self._client.get(recipe_sitemap_url)
        sitemap_resp.raise_for_status()

        seen: set[str] = set()
        for loc in _LOC_RE.findall(sitemap_resp.text):
            m = _RECIPE_ID_RE.search(loc)
            if not m:
                continue
            recipe_id = m.group(1)
            if recipe_id in seen:
                continue
            seen.add(recipe_id)
            yield recipe_id

    # ── Fetch + normalize ────────────────────────────────────────

    def fetch_recipe(self, external_id: str) -> NormalizedRecipe:
        resp = self._authed_get(
            f"{BASE_URL}/gw/recipes/recipes/{external_id}",
            params={"country": "CA", "locale": "en-CA"},
        )
        time.sleep(REQUEST_DELAY_SECONDS)
        item = resp.json()
        return self._normalize(item)

    def _normalize(self, item: dict) -> NormalizedRecipe:
        ingredients_by_id = {ing["id"]: ing for ing in item.get("ingredients", [])}

        yields = item.get("yields") or []
        default_yield = min(yields, key=lambda y: y.get("yields", 0)) if yields else None

        ingredients: list[NormalizedIngredient] = []
        if default_yield:
            for entry in default_yield.get("ingredients", []):
                ing = ingredients_by_id.get(entry["id"])
                name = ing["name"] if ing else entry["id"]
                # HelloFresh leaves amount null for "to taste"-style ingredients.
                ingredients.append(
                    NormalizedIngredient(
                        name=name,
                        quantity=entry.get("amount") or 0,
                        unit=entry.get("unit") or "unit(s)",
                        image_url=_media_url(ing.get("imagePath"), 200) if ing else None,
                    )
                )

        instructions: list[NormalizedInstructionStep] = []
        for step in item.get("steps", []):
            images = step.get("images") or []
            instructions.append(
                NormalizedInstructionStep(
                    step=step.get("index", len(instructions) + 1),
                    description=(step.get("instructions") or "").strip(),
                    image=_media_url(images[0]["path"], 600) if images else None,
                )
            )

        nutrition = []
        for n in item.get("nutrition", []):
            kind, name = _normalize_hellofresh_nutrient(n["name"], n["unit"])
            if kind == "_skip":
                continue
            nutrition.append(NormalizedNutrition(kind=kind, name=name, quantity=n["amount"], unit=n["unit"]))

        categories = sorted({
            *(t["name"] for t in item.get("tags", []) if t.get("name")),
            *(c["name"] for c in item.get("cuisines", []) if c.get("name")),
        })
        utensils = sorted({u["name"] for u in item.get("utensils", []) if u.get("name")})
        allergens = sorted({a["name"] for a in item.get("allergens", []) if a.get("name")})

        prep_time_min = _parse_duration_minutes(item.get("prepTime"))
        total_time_min = _parse_duration_minutes(item.get("totalTime"))
        cook_time_min = None
        if prep_time_min is not None and total_time_min is not None and total_time_min > prep_time_min:
            cook_time_min = total_time_min - prep_time_min

        return NormalizedRecipe(
            external_id=item["id"],
            source_url=item.get("websiteUrl") or f"{BASE_URL}/recipes/{item.get('slug', item['id'])}",
            title=item["name"],
            description=item.get("description"),
            headline=item.get("headline"),
            image_url=_media_url(item.get("imagePath"), 750),
            instructions=instructions,
            ingredients=ingredients,
            nutrition=nutrition,
            prep_time_min=prep_time_min,
            cook_time_min=cook_time_min,
            servings=default_yield.get("yields") if default_yield else None,
            categories=categories,
            utensils=utensils,
            allergens=allergens,
            extension={
                "difficulty": item.get("difficulty"),
                "average_rating": item.get("averageRating"),
                "ratings_count": item.get("ratingsCount"),
                "unique_recipe_code": item.get("uniqueRecipeCode"),
                "video_link": item.get("videoLink"),
                "image_url": _media_url(item.get("imagePath"), 750),
                "total_time": item.get("totalTime"),
            },
        )
