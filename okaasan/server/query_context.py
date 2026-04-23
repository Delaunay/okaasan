"""
Thread-local context flags for query filtering.

Usage:
    with public_articles_only():
        response = client.get('/articles/1')
        # All Article queries in this block are automatically filtered
        # to public == True via the SQLAlchemy do_orm_execute event.
"""
import threading
from contextlib import contextmanager

_local = threading.local()


def is_public_only() -> bool:
    return getattr(_local, 'public_only', False)


@contextmanager
def public_articles_only():
    old = getattr(_local, 'public_only', False)
    _local.public_only = True
    try:
        yield
    finally:
        _local.public_only = old
