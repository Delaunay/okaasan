"""Self-contained audit module.

Call ``activate()`` once at startup to enable automatic change tracking
on all content models via SQLAlchemy ORM hooks.
"""

from .model import AuditLog
from .hooks import register_hooks
from .queries import get_feed, get_report, get_entity_history, backfill


def activate():
    """Register ORM hooks on all tracked models.

    Safe to call multiple times -- models are deduplicated internally.
    """
    from ..recipe.models import Recipe
    from ..articles.models import Article, ArticleBlock
    from ..tasks.models import Task
    from ..calendar.models import Event
    from ..product.models import Product

    register_hooks(Recipe, Article, ArticleBlock, Task, Event, Product)


__all__ = [
    "AuditLog",
    "activate",
    "get_feed",
    "get_report",
    "get_entity_history",
    "backfill",
]
