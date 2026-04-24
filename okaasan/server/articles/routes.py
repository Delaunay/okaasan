import traceback
from traceback import print_exc

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, event
from sqlalchemy.orm import Session, with_loader_criteria

from .models import Article, ArticleBlock
from ..decorators import expose
from ..query_context import is_public_only, public_articles_only

router = APIRouter()


@event.listens_for(Session, "do_orm_execute")
def _filter_public_articles(execute_state):
    """Transparently restrict all Article queries to public == True
    when running inside a `public_articles_only()` context (static build)."""
    if execute_state.is_select and is_public_only():
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                Article,
                Article.public == True,
                include_aliases=True,
            )
        )


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/articles")
def get_articles(db: Session = Depends(get_db)):
    try:
        articles = db.query(Article).filter(Article.parent.is_(None)).all()
        return [article.to_json() for article in articles]
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/articles/public")
@expose()
def get_public_articles(db: Session = Depends(get_db)):
    try:
        articles = (
            db.query(Article)
            .filter(Article.parent.is_(None), Article.public == True)
            .all()
        )
        return [article.to_json() for article in articles]
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/articles/last-accessed")
@expose()
def latest_accessed_articles(db: Session = Depends(get_db)):
    try:
        articles = db.query(Article).filter(Article.parent.is_(None)).all()
        return [article.to_json() for article in articles]
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/articles/{article_id:int}")
@expose(article_id=select(Article._id).where(Article.public == True))
def get_article(article_id: int, db: Session = Depends(get_db)):
    try:
        article = db.query(Article).get(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="Article not found")
        article_json = article.to_json(session=db, children=True)
        articles = [article_json]
        Article.get_block_forest(db, articles)
        article_json["children"] = Article.get_article_forest(
            db, article, public_only=is_public_only(),
        )
        return article_json
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/article/search/{name}")
def search_article(name: str, db: Session = Depends(get_db)):
    try:
        articles = db.query(Article).filter(Article.title.ilike(f"%{name}%")).all()
        return [article.to_json() for article in articles]
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/article/move/{article_id}/{new_parent}")
def move_page(article_id: int, new_parent: int, db: Session = Depends(get_db)):
    article = db.query(Article).get(article_id)
    parent = db.query(Article).get(new_parent)

    if not article or not parent:
        raise HTTPException(status_code=404, detail="Article or parent not found")

    root_id = parent.root_id if parent.root_id is not None else parent._id
    article.parent = parent._id
    article.root_id = root_id

    queue = list(db.query(Article).filter(Article.parent == article._id).all())
    while queue:
        child = queue.pop()
        child.root_id = root_id
        queue.extend(db.query(Article).filter(Article.parent == child._id).all())

    db.commit()
    return article.to_json()


@router.post("/articles", status_code=201)
async def create_article(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        parent_id = data.get("parent_id")
        root_id = data.get("root_id")

        if parent_id and not root_id:
            parent_article = db.query(Article).get(parent_id)
            if parent_article:
                root_id = parent_article.root_id if parent_article.root_id else parent_id

        article = Article(
            title=data.get("title", "Untitled"),
            namespace=data.get("namespace"),
            tags=data.get("tags", []),
            extension=data.get("extension", {}),
            parent=parent_id,
            root_id=root_id,
        )
        db.add(article)
        db.commit()
        return article.to_json()
    except Exception as e:
        print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/articles/{parent_id}/children", status_code=201)
async def create_child_article(parent_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        parent_article = db.query(Article).get(parent_id)
        if not parent_article:
            raise HTTPException(status_code=404, detail="Parent article not found")

        data = await request.json()
        root_id = parent_article.root_id if parent_article.root_id else parent_id

        article = Article(
            title=data.get("title", "Untitled Child"),
            namespace=data.get("namespace"),
            tags=data.get("tags", []),
            extension=data.get("extension", {}),
            parent=parent_id,
            root_id=root_id,
        )
        db.add(article)
        db.commit()
        return article.to_json()
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/articles/{parent_id}/children")
@expose(parent_id=select(Article._id).where(Article.public == True))
def get_child_articles(parent_id: int, db: Session = Depends(get_db)):
    try:
        parent_article = db.query(Article).get(parent_id)
        if not parent_article:
            raise HTTPException(status_code=404, detail="Parent article not found")
        query = db.query(Article).filter(Article.parent == parent_id)
        if is_public_only():
            query = query.filter(Article.public == True)
        child_articles = query.all()
        return [child.to_json() for child in child_articles]
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/articles/{article_id}")
async def update_article(article_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        article = db.query(Article).get(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="Article not found")

        data = await request.json()
        if "title" in data:
            article.title = data["title"]
        if "namespace" in data:
            article.namespace = data["namespace"]
        if "tags" in data:
            article.tags = data["tags"]
        if "extension" in data:
            article.extension = data["extension"]
        if "public" in data:
            article.public = data["public"]
        if "article_kind" in data:
            article.article_kind = data["article_kind"]

        db.commit()
        return article.to_json()
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/articles/{article_id}")
def delete_article(article_id: int, db: Session = Depends(get_db)):
    try:
        article = db.query(Article).get(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="Article not found")
        db.query(ArticleBlock).filter(ArticleBlock.page_id == article_id).delete()
        db.delete(article)
        db.commit()
        return {"message": "Article deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def _insert_blocks(db: Session, insert_data, parent=None, page_id=None, depth=0):
    if parent is None:
        parent = insert_data["parent"]
    if page_id is None:
        page_id = insert_data["page_id"]

    blocks = []
    for child in insert_data.get("children", []):
        block = ArticleBlock(
            page_id=page_id,
            parent=parent,
            kind=child["kind"],
            data=child.get("data", {}),
            extension=child.get("extension", {}),
            sequence=child.get("sequence"),
        )
        db.add(block)
        db.flush()

        ids = []
        if "children" in child:
            result = _insert_blocks(db, child, parent=block._id, page_id=page_id, depth=depth + 1)
            ids.extend(result["children"])

        blocks.append({"id": block._id, "children": ids, "page_id": page_id})

    if depth == 0:
        db.commit()
    return {"action": "insert", "children": blocks}


def _update_blocks(db: Session, update_data, depth=0):
    block = db.query(ArticleBlock).get(update_data["id"])
    children = update_data["block_def"].pop("children", [])
    for item, value in update_data["block_def"].items():
        setattr(block, item, value)
    if depth == 0:
        db.commit()
    return {"action": "update", "id": block._id}


def _reorder_blocks(db: Session, reorder_data, depth=0):
    block = db.query(ArticleBlock).get(reorder_data["id"])
    block.sequence = reorder_data["sequence"]
    if depth == 0:
        db.commit()
    return {"action": "reorder", "id": block._id}


def _delete_blocks(db: Session, delete_data, depth=0):
    if hasattr(delete_data, "_id"):
        block_id = delete_data._id
    else:
        block_id = delete_data["block_id"]

    child_blocks = db.query(ArticleBlock).filter(ArticleBlock.parent == block_id).all()
    children_id = []
    for child in child_blocks:
        children_id.append(_delete_blocks(db, child))

    block = db.query(ArticleBlock).get(block_id)
    db.delete(block)
    if depth == 0:
        db.commit()
    return {"action": "delete", "id": block._id, "children": children_id}


@router.put("/blocks/batch")
async def update_blocks_batch(request: Request, db: Session = Depends(get_db)):
    try:
        actions = await request.json()
        results = []
        for action in actions:
            match action["op"]:
                case "insert":
                    results.append(_insert_blocks(db, action, depth=1))
                case "update":
                    results.append(_update_blocks(db, action, depth=1))
                case "reorder":
                    results.append(_reorder_blocks(db, action, depth=1))
                case "delete":
                    try:
                        results.append(_delete_blocks(db, action, depth=1))
                    except KeyError:
                        pass
        db.commit()
        return results
    except Exception:
        traceback.print_exc()
        return {}


@router.get("/articles/{article_id}/export")
def export_article(article_id: int, db: Session = Depends(get_db)):
    try:
        article = db.query(Article).get(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="Article not found")
        article_json = article.to_json(session=db, children=True)
        articles = [article_json]
        Article.get_block_forest(db, articles)
        return article_json
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))
