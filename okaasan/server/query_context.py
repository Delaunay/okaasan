"""
Context flags for query filtering.

Uses ``contextvars`` so the flag propagates correctly across
Starlette's ``run_in_threadpool`` (used for sync FastAPI endpoints)
and through ``anyio.from_thread.BlockingPortal`` (used by TestClient).
``threading.local`` does *not* propagate in those scenarios, which
caused private articles to leak into the static build.

Usage:
    with public_articles_only():
        response = client.get('/articles/1')
        # All Article queries in this block are automatically filtered
        # to public == True via the SQLAlchemy do_orm_execute event.
"""
from contextvars import ContextVar
from contextlib import contextmanager

_public_only: ContextVar[bool] = ContextVar('public_only', default=False)


def is_public_only() -> bool:
    return _public_only.get()


@contextmanager
def public_articles_only():
    token = _public_only.set(True)
    try:
        yield
    finally:
        _public_only.reset(token)
