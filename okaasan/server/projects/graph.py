from fastapi import APIRouter, Request

router = APIRouter()


@router.post("/kiwi/conversion/t2g")
async def text_to_graph(request: Request):
    from .text_to_graph import text_to_graph
    data = await request.json()
    return text_to_graph(data)


@router.post("/kiwi/conversion/g2t")
async def graph_to_text(request: Request):
    from .graph_to_text import graph_to_text
    data = await request.json()
    return graph_to_text(data)


@router.post("/kiwi/conversion/t2b")
async def text_to_block(request: Request):
    from .blockly.text_to_block import text_to_block
    data = await request.json()
    return text_to_block(data)


@router.post("/kiwi/conversion/b2t")
async def block_to_text(request: Request):
    from .blockly.block_to_text import block_to_text
    data = await request.json()
    return block_to_text(data)


@router.get("/kiwi/blockly/toolbox")
def blockly_tools():
    from .blockly.blocks import TOOLBOX
    return TOOLBOX


@router.get("/kiwi/blockly/definitions")
def blockly_def():
    from .blockly.blocks import DEFINITIONS
    return DEFINITIONS
