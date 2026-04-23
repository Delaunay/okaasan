import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArticleInstance } from '../src/components/article/article';
import { BlockBase, BlockDef, ArticleDef, newBlock } from '../src/components/article/base';
import { recipeAPI } from '../src/services/api';

import '../src/components/article/blocks/paragraph';
import '../src/components/article/blocks/text';
import '../src/components/article/blocks/item';
import '../src/components/article/blocks/list';
import '../src/components/article/blocks/heading';

vi.mock('../src/services/api', () => ({
    recipeAPI: {
        updateBlocksBatch: vi.fn().mockResolvedValue([]),
        updateArticle: vi.fn().mockResolvedValue({}),
    }
}));

vi.useFakeTimers();

function makeBlockDef(kind: string, data: any, children?: BlockDef[], extra?: Partial<BlockDef>): BlockDef {
    return {
        id: Math.floor(Math.random() * 100000),
        page_id: 1,
        parent_id: 0,
        kind,
        data,
        extension: {},
        sequence: 0,
        children,
        ...extra
    };
}

function makeArticleDef(blocks: BlockDef[]): ArticleDef {
    for (let i = 0; i < blocks.length; i++) {
        blocks[i].sequence = i;
    }
    return {
        id: 1,
        root_id: 1,
        title: 'Test Article',
        namespace: 'test',
        sequence: 0,
        tags: [],
        extension: {},
        blocks
    };
}

function collectBlocks(block: { children: any[] }): any[] {
    const result: any[] = [];
    for (const child of block.children) {
        result.push(child);
        result.push(...collectBlocks(child));
    }
    return result;
}

function getBlockKinds(block: { children: any[] }): string[] {
    return block.children.map((c: any) => c.def.kind);
}

describe('ArticleInstance.updateBlock - list block editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('basic field updates (no children changes)', () => {
        it('should update data fields of a list block', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
                start: 1,
                loose: false,
            }, [
                makeBlockDef('item', { text: 'item 1', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'item 1' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            expect(listBlock.def.kind).toBe('list');
            expect(listBlock.children.length).toBe(1);

            const newDef: BlockDef = {
                ...listBlock.def,
                data: { ...listBlock.def.data, ordered: true, start: 5 },
                children: [
                    {
                        ...listBlock.children[0].def,
                        children: listBlock.children[0].def.children,
                    }
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.def.data.ordered).toBe(true);
            expect(listBlock.def.data.start).toBe(5);
            expect(listBlock.children.length).toBe(1);
        });
    });

    describe('adding children to a list block', () => {
        it('should add a new item to a list with one existing item', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            expect(listBlock.children.length).toBe(1);
            expect(listBlock.children[0].def.id).toBe(10);

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(2);
            expect(listBlock.children[0].def.kind).toBe('item');
            expect(listBlock.children[1].def.kind).toBe('item');
        });

        it('should preserve existing child IDs when adding a new child', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            const originalFirstChild = listBlock.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...originalFirstChild.def, children: originalFirstChild.def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children[0].def.id).toBe(10);
        });

        it('should not create duplicate children when adding items', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    { ...listBlock.children[1].def, children: listBlock.children[1].def.children },
                    makeBlockDef('item', { text: 'third', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'third' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(3);

            const allBlocks = collectBlocks(listBlock);
            const ids = allBlocks.map(b => b.def.id).filter(id => id !== undefined);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });

        it('should track inserted blocks for server ID reconciliation', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            const insertAction = article.pendingChange.find(p => p.action.op === 'insert');
            expect(insertAction).toBeDefined();
            expect(insertAction!.blocks).toBeDefined();
            expect(insertAction!.blocks!.length).toBeGreaterThan(0);

            // The tracked blocks should be the SAME objects as in the tree
            const trackedBlock = insertAction!.blocks![0];
            const actualBlock = listBlock.children[1];
            expect(trackedBlock).toBe(actualBlock);
        });
    });

    describe('removing children from a list block', () => {
        it('should remove the last item from a list with two items', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            expect(listBlock.children.length).toBe(2);

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(1);
            expect(listBlock.children[0].def.id).toBe(10);
        });

        it('should remove a middle item from a list with three items', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
                makeBlockDef('item', { text: 'third', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'third' }),
                ], { id: 12, sequence: 2 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // Remove the second item: the merger treats positional,
            // so "removing the middle" means the 3rd slides into position 2
            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    { ...listBlock.children[2].def, children: listBlock.children[2].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(2);
        });

        it('should generate a delete action for removed nested children', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            const deleteAction = article.pendingChange.find(p => p.action.op === 'delete');
            expect(deleteAction).toBeDefined();
            expect((deleteAction!.action as any).block_id).toBe(11);
        });

        it('should remove all children from a list block', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: []
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(0);
        });
    });

    describe('updating children content', () => {
        it('should update the text of a child paragraph within a list item', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'original', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'original' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    {
                        ...listBlock.children[0].def,
                        data: { text: 'modified', listItem: true },
                        children: [
                            { ...listBlock.children[0].children[0].def, data: { text: 'modified' } },
                        ]
                    },
                ]
            };

            article.updateBlock(listBlock, newDef);

            const itemBlock = listBlock.children[0];
            expect(itemBlock.def.data.text).toBe('modified');
            const paraBlock = itemBlock.children[0];
            expect(paraBlock.def.data.text).toBe('modified');
        });
    });

    describe('combined add and update', () => {
        it('should update existing item and add new item simultaneously', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    {
                        ...listBlock.children[0].def,
                        data: { text: 'first modified', listItem: true },
                        children: [
                            { ...listBlock.children[0].children[0].def, data: { text: 'first modified' } },
                        ]
                    },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(2);
            expect(listBlock.children[0].def.data.text).toBe('first modified');
            expect(listBlock.children[1].def.kind).toBe('item');
        });
    });

    describe('def.children consistency', () => {
        it('should keep def.children and children array in sync after adding', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.def.children?.length).toBe(listBlock.children.length);
        });

        it('should keep def.children and children array in sync after removing', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.def.children?.length).toBe(listBlock.children.length);
        });
    });

    describe('deleteBlock on nested blocks', () => {
        it('should actually remove a nested child block (not just top-level)', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            const secondItem = listBlock.children[1];

            article.deleteBlock(secondItem);

            // The nested child should actually be removed from the parent's children
            expect(listBlock.children.length).toBe(1);
            expect(listBlock.children[0].def.id).toBe(10);
        });
    });

    describe('_updateBlock undo correctness', () => {
        it('should capture old state for undo before mutation', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'original', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'original' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            const originalData = { ...listBlock.def.data };

            const newDef: BlockDef = {
                ...listBlock.def,
                data: { ...listBlock.def.data, ordered: true },
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            // Find the update action
            const updateAction = article.pendingChange.find(p => p.action.op === 'update');
            expect(updateAction).toBeDefined();

            // Execute undo
            updateAction!.undoAction();

            // After undo, the data should be back to original
            expect(listBlock.def.data.ordered).toBe(originalData.ordered);
        });
    });

    describe('action generation correctness', () => {
        it('should generate an insert action when adding children (no data change)', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            const insertActions = article.pendingChange.filter(p => p.action.op === 'insert');
            expect(insertActions.length).toBe(1);
        });

        it('should generate both insert and update actions when data and children change', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                data: { items: [], ordered: true },
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            const insertActions = article.pendingChange.filter(p => p.action.op === 'insert');
            const updateActions = article.pendingChange.filter(p => p.action.op === 'update');

            expect(insertActions.length).toBe(1);
            expect(updateActions.length).toBeGreaterThanOrEqual(1);
        });

        it('should generate correct number of actions for remove operation', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'second', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'second' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, newDef);

            const deleteActions = article.pendingChange.filter(p => p.action.op === 'delete');
            expect(deleteActions.length).toBe(1);
        });
    });

    describe('deeply nested list editing', () => {
        it('should handle adding items to a nested list', () => {
            const nestedListDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'nested 1', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'nested 1' }),
                ], { id: 20, sequence: 0 }),
            ], { id: 2, sequence: 1 });

            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'top 1', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'top 1' }),
                ], { id: 10, sequence: 0 }),
                nestedListDef,
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const outerList = article.children[0];
            const innerList = outerList.children[1];

            expect(innerList.def.kind).toBe('list');
            expect(innerList.children.length).toBe(1);

            const newInnerDef: BlockDef = {
                ...innerList.def,
                children: [
                    { ...innerList.children[0].def, children: innerList.children[0].def.children },
                    makeBlockDef('item', { text: 'nested 2', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'nested 2' }),
                    ]),
                ]
            };

            article.updateBlock(innerList, newInnerDef);

            expect(innerList.children.length).toBe(2);
            expect(outerList.children.length).toBe(2);
        });
    });

    describe('top-level block editing (non-list)', () => {
        it('should update a top-level paragraph block', () => {
            const paraDef = makeBlockDef('paragraph', { text: 'original' }, [], { id: 1, sequence: 0 });
            const article = new ArticleInstance(makeArticleDef([paraDef]));
            const paraBlock = article.children[0];

            const newDef: BlockDef = {
                ...paraBlock.def,
                data: { text: 'modified' },
                children: []
            };

            article.updateBlock(paraBlock, newDef);

            expect(paraBlock.def.data.text).toBe('modified');
        });

        it('should add children to a previously childless block', () => {
            const paraDef = makeBlockDef('paragraph', { text: 'parent' }, [], { id: 1, sequence: 0 });
            const article = new ArticleInstance(makeArticleDef([paraDef]));
            const paraBlock = article.children[0];

            expect(paraBlock.children.length).toBe(0);

            const newDef: BlockDef = {
                ...paraBlock.def,
                children: [
                    makeBlockDef('text', { text: 'child text', style: 'strong' }),
                ]
            };

            article.updateBlock(paraBlock, newDef);

            expect(paraBlock.children.length).toBe(1);
            expect(paraBlock.children[0].def.kind).toBe('text');
        });
    });

    describe('tracked blocks after combined data+children change', () => {
        it('should keep tracked insert blocks valid when data and children change together', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // Change data AND add a child - this triggers both insertBlock and _updateBlock
            const newDef: BlockDef = {
                ...listBlock.def,
                data: { items: [], ordered: true },
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };

            article.updateBlock(listBlock, newDef);

            const insertAction = article.pendingChange.find(p => p.action.op === 'insert');
            expect(insertAction).toBeDefined();
            expect(insertAction!.blocks).toBeDefined();
            expect(insertAction!.blocks!.length).toBeGreaterThan(0);

            // The tracked block should be the SAME object as in the current tree
            // This fails when _updateBlock rebuilds children after insertBlock,
            // orphaning the tracked references
            const trackedBlock = insertAction!.blocks![0];
            const actualBlock = listBlock.children[1];
            expect(trackedBlock).toBe(actualBlock);
        });
    });

    describe('edge cases', () => {
        it('should handle updating with identical definition (no-op)', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            const childCountBefore = listBlock.children.length;

            const sameDef: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                ]
            };

            article.updateBlock(listBlock, sameDef);

            expect(listBlock.children.length).toBe(childCountBefore);
        });

        it('should handle rapid successive updates without corrupting state', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'first', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'first' }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // First update: add second item
            const newDef1: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    makeBlockDef('item', { text: 'second', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'second' }),
                    ]),
                ]
            };
            article.updateBlock(listBlock, newDef1);

            expect(listBlock.children.length).toBe(2);

            // Second update: add third item
            const newDef2: BlockDef = {
                ...listBlock.def,
                children: [
                    { ...listBlock.children[0].def, children: listBlock.children[0].def.children },
                    { ...listBlock.children[1].def, children: listBlock.children[1].def.children },
                    makeBlockDef('item', { text: 'third', listItem: true }, [
                        makeBlockDef('paragraph', { text: 'third' }),
                    ]),
                ]
            };
            article.updateBlock(listBlock, newDef2);

            expect(listBlock.children.length).toBe(3);
        });

        it('should handle replacing all children at once', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
            }, [
                makeBlockDef('item', { text: 'old1', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'old1' }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'old2', listItem: true }, [
                    makeBlockDef('paragraph', { text: 'old2' }),
                ], { id: 11, sequence: 1 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // Replace with completely different children (same count)
            const newDef: BlockDef = {
                ...listBlock.def,
                children: [
                    {
                        ...listBlock.children[0].def,
                        data: { text: 'new1', listItem: true },
                        children: [
                            { ...listBlock.children[0].children[0].def, data: { text: 'new1' } },
                        ]
                    },
                    {
                        ...listBlock.children[1].def,
                        data: { text: 'new2', listItem: true },
                        children: [
                            { ...listBlock.children[1].children[0].def, data: { text: 'new2' } },
                        ]
                    },
                ]
            };

            article.updateBlock(listBlock, newDef);

            expect(listBlock.children.length).toBe(2);
            expect(listBlock.children[0].def.data.text).toBe('new1');
            expect(listBlock.children[1].def.data.text).toBe('new2');
        });
    });

    describe('nested list insert scenario (server batch correctness)', () => {
        it('should generate only insert + update for the changed item when adding a nested list', () => {
            // Simulates the exact user scenario:
            // Start: * Item 1 / * Item 2 / * Item 3
            // Edit:  * Item 1 / * Item 2\n  * Item 2.1 / * Item 3
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
                start: 1,
                loose: false,
            }, [
                makeBlockDef('item', { text: 'Item 1', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 1' }, [], { id: 1476, sequence: 0 }),
                ], { id: 1475, sequence: 0 }),
                makeBlockDef('item', { text: 'Item 2', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 2' }, [], { id: 1478, sequence: 0 }),
                ], { id: 1477, sequence: 1 }),
                makeBlockDef('item', { text: 'Item 3', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 3' }, [], { id: 1480, sequence: 0 }),
                ], { id: 1479, sequence: 2 }),
            ], { id: 1474, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // Simulate parseMarkdown result for the edited list
            const newDef: BlockDef = {
                kind: 'list',
                data: { items: [], ordered: false, start: 1, loose: false },
                children: [
                    {
                        kind: 'item',
                        data: { text: 'Item 1', task: false, loose: false, listItem: true },
                        children: [
                            { kind: 'text', data: { style: null, text: 'Item 1' }, children: [] } as any,
                        ],
                    } as any,
                    {
                        kind: 'item',
                        data: { text: 'Item 2', task: false, loose: false, listItem: true },
                        children: [
                            { kind: 'text', data: { style: null, text: 'Item 2' }, children: [] } as any,
                            {
                                kind: 'list',
                                data: { items: [], ordered: false, start: 1, loose: false },
                                children: [
                                    {
                                        kind: 'item',
                                        data: { text: 'Item 2.1', task: false, loose: false, listItem: true },
                                        children: [
                                            { kind: 'text', data: { style: null, text: 'Item 2.1' }, children: [] } as any,
                                        ],
                                    } as any,
                                ],
                            } as any,
                        ],
                    } as any,
                    {
                        kind: 'item',
                        data: { text: 'Item 3', task: false, loose: false, listItem: true },
                        children: [
                            { kind: 'text', data: { style: null, text: 'Item 3' }, children: [] } as any,
                        ],
                    } as any,
                ],
            } as any;

            article.updateBlock(listBlock, newDef);

            // Verify the tree structure is correct
            expect(listBlock.children.length).toBe(3);
            const item2 = listBlock.children[1];
            expect(item2.children.length).toBe(2);
            expect(item2.children[0].def.kind).toBe('text');
            expect(item2.children[0].def.data.text).toBe('Item 2');
            expect(item2.children[1].def.kind).toBe('list');
            const nestedList = item2.children[1];
            expect(nestedList.children.length).toBe(1);
            expect(nestedList.children[0].def.kind).toBe('item');
            expect(nestedList.children[0].children[0].def.data.text).toBe('Item 2.1');

            // Verify the batch: should have only insert (nested list) + update (item 2 data changed)
            const actions = article.pendingChange.map(p => p.action);
            const inserts = actions.filter(a => a.op === 'insert');
            const updates = actions.filter(a => a.op === 'update');
            const deletes = actions.filter(a => a.op === 'delete');

            expect(deletes.length).toBe(0);
            expect(inserts.length).toBe(1);

            // The insert should be under item 1477, not under text 1478
            expect(inserts[0].parent).toBe(1477);
            expect(inserts[0].children[0].kind).toBe('list');

            // Updates should only be for blocks whose data actually changed
            // Item 1 and Item 3 are unchanged so they should NOT have update actions
            const updateIds = updates.map(u => u.id);
            expect(updateIds).not.toContain(1476); // text "Item 1" unchanged
            expect(updateIds).not.toContain(1475); // item "Item 1" unchanged
            expect(updateIds).not.toContain(1480); // text "Item 3" unchanged
            expect(updateIds).not.toContain(1479); // item "Item 3" unchanged
        });

        it('should not insert children under a text block', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
                start: 1,
                loose: false,
            }, [
                makeBlockDef('item', { text: 'Item 1', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 1' }, [], { id: 100, sequence: 0 }),
                ], { id: 10, sequence: 0 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];

            // Simulate parseMarkdown adding a nested list
            const newDef: BlockDef = {
                kind: 'list',
                data: { items: [], ordered: false, start: 1, loose: false },
                children: [
                    {
                        kind: 'item',
                        data: { text: 'Item 1', task: false, loose: false, listItem: true },
                        children: [
                            { kind: 'text', data: { style: null, text: 'Item 1' }, children: [] } as any,
                            {
                                kind: 'list',
                                data: { items: [], ordered: false, start: 1, loose: false },
                                children: [
                                    {
                                        kind: 'item',
                                        data: { text: 'Sub', task: false, loose: false, listItem: true },
                                        children: [
                                            { kind: 'text', data: { style: null, text: 'Sub' }, children: [] } as any,
                                        ],
                                    } as any,
                                ],
                            } as any,
                        ],
                    } as any,
                ],
            } as any;

            article.updateBlock(listBlock, newDef);

            // No insert should target a text block
            const actions = article.pendingChange.map(p => p.action);
            const inserts = actions.filter(a => a.op === 'insert');
            for (const insert of inserts) {
                // parent should be an item block (10), not a text block (100)
                expect(insert.parent).not.toBe(100);
            }

            // The nested list should be a child of the item, not the text
            const item = listBlock.children[0];
            expect(item.children.length).toBe(2);
            expect(item.children[0].def.kind).toBe('text');
            expect(item.children[1].def.kind).toBe('list');
        });

        it('should correctly delete items when reducing list to single item', () => {
            const listDef = makeBlockDef('list', {
                items: [],
                ordered: false,
                start: 1,
                loose: false,
            }, [
                makeBlockDef('item', { text: 'Item 1', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 1' }, [], { id: 101, sequence: 0 }),
                ], { id: 10, sequence: 0 }),
                makeBlockDef('item', { text: 'Item 2', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 2' }, [], { id: 102, sequence: 0 }),
                ], { id: 20, sequence: 1 }),
                makeBlockDef('item', { text: 'Item 3', task: false, loose: false, listItem: true }, [
                    makeBlockDef('text', { style: null, text: 'Item 3' }, [], { id: 103, sequence: 0 }),
                ], { id: 30, sequence: 2 }),
            ], { id: 1, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([listDef]));
            const listBlock = article.children[0];
            expect(listBlock.children.length).toBe(3);

            // Reduce to just Item 1
            const newDef: BlockDef = {
                kind: 'list',
                data: { items: [], ordered: false, start: 1, loose: false },
                children: [
                    {
                        kind: 'item',
                        data: { text: 'Item 1', task: false, loose: false, listItem: true },
                        children: [
                            { kind: 'text', data: { style: null, text: 'Item 1' }, children: [] } as any,
                        ],
                    } as any,
                ],
            } as any;

            article.updateBlock(listBlock, newDef);

            // Should have exactly 1 item left
            expect(listBlock.children.length).toBe(1);
            expect(listBlock.children[0].def.data.text).toBe('Item 1');

            // Should have 2 delete actions (Item 2 and Item 3)
            const actions = article.pendingChange.map(p => p.action);
            const deletes = actions.filter(a => a.op === 'delete');
            expect(deletes.length).toBe(2);
            const deletedIds = deletes.map(d => d.block_id);
            expect(deletedIds).toContain(20);
            expect(deletedIds).toContain(30);
        });
    });

    describe('multi-block split (adding blocks before/after via editor)', () => {
        // Simulates what MarkdownEditor.updateBlocks does when parseMarkdown
        // returns a multi-block wrapper (item with empty data and multiple children).
        function simulateEditorUpdate(article: ArticleInstance, block: BlockBase, parsed: any) {
            parsed.children = (parsed.children ?? []).filter((c: any) => c.kind !== "separator");

            const isMultiBlockWrapper = parsed.kind === "item" &&
                Object.keys(parsed.data ?? {}).length === 0 &&
                parsed.children?.length > 1;

            if (isMultiBlockWrapper && block.def.kind !== "item") {
                const children = parsed.children;
                const matchIndex = children.findIndex((c: any) => c.kind === block.def.kind);

                if (matchIndex !== -1) {
                    article.updateBlock(block, children[matchIndex]);

                    const parent = block.getParent() ?? article;
                    const blockId = block.def.id;

                    const before = children.slice(0, matchIndex);
                    if (before.length > 0) {
                        article.insertBlock(parent, block, "before", before);
                    }
                    const after = children.slice(matchIndex + 1);
                    if (after.length > 0) {
                        const current = (parent.children as BlockBase[]).find(c => c.def.id === blockId) ?? block;
                        article.insertBlock(parent, current, "after", after);
                    }
                } else {
                    article.updateBlock(block, children[0]);

                    const rest = children.slice(1);
                    if (rest.length > 0) {
                        const parent = block.getParent() ?? article;
                        const blockId = block.def.id;
                        const current = (parent.children as BlockBase[]).find(c => c.def.id === blockId) ?? block;
                        article.insertBlock(parent, current, "after", rest);
                    }
                }
            } else {
                article.updateBlock(block, parsed);
            }
        }

        it('should insert a heading before when user adds # Header 0 above # Header 1', () => {
            const headingDef = makeBlockDef('heading', { level: 1, text: '' }, [
                makeBlockDef('text', { style: null, text: 'Header 1' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([headingDef]));
            expect(article.children.length).toBe(1);
            expect(article.children[0].def.kind).toBe('heading');

            const block = article.children[0];

            // Simulates parseMarkdown("# Header 0\n\n# Header 1")
            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 0' }, children: [] }
                    ]},
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 1' }, children: [] }
                    ]},
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            // Should now have 2 top-level blocks
            expect(article.children.length).toBe(2);
            expect(article.children[0].def.kind).toBe('heading');
            expect(article.children[1].def.kind).toBe('heading');

            // Header 0 was inserted before, Header 1 stays in place
            expect(article.children[0].children[0].def.data.text).toBe('Header 0');
            expect(article.children[1].children[0].def.data.text).toBe('Header 1');

            // Original heading block should still be Header 1 (the match)
            expect(block.def.kind).toBe('heading');
        });

        it('should insert a heading after when user adds # Header 2 below # Header 1', () => {
            const headingDef = makeBlockDef('heading', { level: 1, text: '' }, [
                makeBlockDef('text', { style: null, text: 'Header 1' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([headingDef]));
            const block = article.children[0];

            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 1' }, children: [] }
                    ]},
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 2' }, children: [] }
                    ]},
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            expect(article.children.length).toBe(2);
            expect(article.children[0].children[0].def.data.text).toBe('Header 1');
            expect(article.children[1].children[0].def.data.text).toBe('Header 2');
        });

        it('should insert a paragraph after a heading when user adds text below', () => {
            const headingDef = makeBlockDef('heading', { level: 1, text: '' }, [
                makeBlockDef('text', { style: null, text: 'Title' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([headingDef]));
            const block = article.children[0];

            // parseMarkdown("# Title\n\nSome paragraph text")
            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Title' }, children: [] }
                    ]},
                    { kind: 'paragraph', data: { text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Some paragraph text' }, children: [] }
                    ]},
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            expect(article.children.length).toBe(2);
            expect(article.children[0].def.kind).toBe('heading');
            expect(article.children[1].def.kind).toBe('paragraph');
        });

        it('should insert blocks both before and after when match is in the middle', () => {
            const paraDef = makeBlockDef('paragraph', { text: '' }, [
                makeBlockDef('text', { style: null, text: 'Middle' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([paraDef]));
            const block = article.children[0];

            // parseMarkdown("# Before\n\nMiddle\n\n---")
            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Before' }, children: [] }
                    ]},
                    { kind: 'paragraph', data: { text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Middle' }, children: [] }
                    ]},
                    { kind: 'hr', data: { raw: '---' }, children: [] },
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            expect(article.children.length).toBe(3);
            expect(article.children[0].def.kind).toBe('heading');
            expect(article.children[1].def.kind).toBe('paragraph');
            expect(article.children[2].def.kind).toBe('hr');
        });

        it('should fall back to first child when no kind matches', () => {
            const paraDef = makeBlockDef('paragraph', { text: '' }, [
                makeBlockDef('text', { style: null, text: 'Old text' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([paraDef]));
            const block = article.children[0];

            // User replaces paragraph with two headings (no paragraph in result)
            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Heading 1' }, children: [] }
                    ]},
                    { kind: 'heading', data: { level: 2, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Heading 2' }, children: [] }
                    ]},
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            // First child replaces original, second is inserted after
            expect(article.children.length).toBe(2);
        });

        it('should not split when parsed result is a single block', () => {
            const headingDef = makeBlockDef('heading', { level: 1, text: '' }, [
                makeBlockDef('text', { style: null, text: 'Header 1' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([headingDef]));
            const block = article.children[0];

            // Single heading — no wrapper, just update in place
            const parsed = {
                kind: 'heading',
                data: { level: 1, text: '' },
                children: [
                    { kind: 'text', data: { style: null, text: 'Updated Header' }, children: [] }
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            expect(article.children.length).toBe(1);
            expect(article.children[0].def.kind).toBe('heading');
            expect(article.children[0].children[0].def.data.text).toBe('Updated Header');
        });

        it('should generate correct server actions for the split', () => {
            const headingDef = makeBlockDef('heading', { level: 1, text: '' }, [
                makeBlockDef('text', { style: null, text: 'Header 1' }, [], { id: 200, sequence: 0 }),
            ], { id: 100, sequence: 0 });

            const article = new ArticleInstance(makeArticleDef([headingDef]));
            const block = article.children[0];

            const parsed = {
                kind: 'item',
                data: {},
                children: [
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 0' }, children: [] }
                    ]},
                    { kind: 'heading', data: { level: 1, text: '' }, children: [
                        { kind: 'text', data: { style: null, text: 'Header 1' }, children: [] }
                    ]},
                ]
            };

            simulateEditorUpdate(article, block, parsed);

            const actions = article.pendingChange.map(p => p.action);
            const inserts = actions.filter(a => a.op === 'insert');
            const updates = actions.filter(a => a.op === 'update');

            // findIndex matches the first heading ("Header 0"), so the original
            // heading is updated from "Header 1" → "Header 0", and "Header 1" is inserted after
            expect(inserts.length).toBe(1);
            expect(inserts[0].children[0].kind).toBe('heading');
            expect(updates.length).toBeGreaterThanOrEqual(1);

            // Verify the structure is correct regardless
            expect(article.children.length).toBe(2);
            expect(article.children[0].children[0].def.data.text).toBe('Header 0');
            expect(article.children[1].children[0].def.data.text).toBe('Header 1');
        });
    });
});
