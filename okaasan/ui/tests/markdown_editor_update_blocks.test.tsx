import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { newBlock, BlockDef } from '../src/components/article/base';
import { parseMarkdown } from '../src/components/article/markdown';

// Register blocks used in the tests
import '../src/components/article/blocks/paragraph';
import '../src/components/article/blocks/text';
import '../src/components/article/blocks/item';
import '../src/components/article/blocks/list';
import '../src/components/article/blocks/layout';

vi.mock('../src/components/article/markdown', () => ({
    parseMarkdown: vi.fn()
}));

const system = createSystem(defaultConfig);

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <ChakraProvider value={system}>{children}</ChakraProvider>;
};

const renderWithProvider = (component: React.ReactNode) => {
    return render(<TestWrapper>{component}</TestWrapper>);
};

const createMockArticle = () => ({
    updateBlock: vi.fn(),
    insertBlock: vi.fn(),
    notify: vi.fn(),
    options: { editTrigger: "click" as const },
});

const baseDef = (kind: string, data: any, extra?: Partial<BlockDef>): BlockDef => ({
    id: 1,
    page_id: 1,
    parent_id: 0,
    kind,
    data,
    extension: {},
    sequence: 0,
    ...extra
});

const showEditor = (container: HTMLElement) => {
    const wrapper = container.querySelector('.TOP_LEVEL_BLOCK') as HTMLElement;
    expect(wrapper).toBeTruthy();
    fireEvent.click(wrapper);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    return textarea;
};

describe('MarkdownEditor updateBlocks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates block in-place when parsed kind matches', () => {
        const article = createMockArticle();
        const def = baseDef('paragraph', { text: 'Original' });
        const block = newBlock(article as any, def);

        (parseMarkdown as any).mockReturnValue({
            kind: 'paragraph',
            data: { text: 'Updated' },
            children: [
                { kind: 'separator', data: {}, children: [] },
                { kind: 'text', data: { text: 'child' }, children: [] }
            ]
        });

        const { container } = renderWithProvider(<>{block.react()}</>);
        const textarea = showEditor(container);
        fireEvent.change(textarea, { target: { value: 'Updated' } });
        fireEvent.blur(textarea);

        expect(article.updateBlock).toHaveBeenCalledTimes(1);
        const updatedDef = article.updateBlock.mock.calls[0][1];
        expect(updatedDef.kind).toBe('paragraph');
        expect(updatedDef.children.length).toBe(1);
        expect(updatedDef.children[0].kind).toBe('text');
        expect(article.insertBlock).not.toHaveBeenCalled();
    });

    it('adds child when editing an empty item block', () => {
        const article = createMockArticle();
        const def = baseDef('item', { text: '' }, { children: [] });
        const block = newBlock(article as any, def);

        (parseMarkdown as any).mockReturnValue({
            kind: 'paragraph',
            data: { text: 'Inserted' },
            children: []
        });

        const { container } = renderWithProvider(<>{block.react()}</>);
        const textarea = showEditor(container);
        fireEvent.change(textarea, { target: { value: 'Inserted' } });
        fireEvent.blur(textarea);

        expect(article.updateBlock).not.toHaveBeenCalled();
        expect(article.insertBlock).not.toHaveBeenCalled();
        expect(block.def.children?.length).toBe(1);
        expect(block.children.length).toBe(1);
        expect(block.children[0].def.kind).toBe('paragraph');
    });

    it('splits parsed items into update + insert when parsed kind is item', () => {
        const article = createMockArticle();

        const parent = {
            def: { children: [] as BlockDef[] },
            children: [] as any[]
        };

        const def = baseDef('paragraph', { text: 'Original' });
        const block = newBlock(article as any, def, parent as any);
        parent.children.push(block);

        (parseMarkdown as any).mockReturnValue({
            kind: 'item',
            data: {},
            children: [
                { kind: 'paragraph', data: { text: 'Updated' }, children: [] },
                { kind: 'separator', data: {}, children: [] },
                { kind: 'paragraph', data: { text: 'Extra' }, children: [] }
            ]
        });

        const { container } = renderWithProvider(<>{block.react()}</>);
        const textarea = showEditor(container);
        fireEvent.change(textarea, { target: { value: 'Updated\nExtra' } });
        fireEvent.blur(textarea);

        expect(article.updateBlock).toHaveBeenCalledTimes(1);
        expect(article.insertBlock).toHaveBeenCalledTimes(1);
        expect(article.insertBlock).toHaveBeenCalledWith(
            parent,
            block,
            'after',
            [{ kind: 'paragraph', data: { text: 'Extra' }, children: [] }]
        );
    });

    it('inserts parsed items when editing an input block with item result', () => {
        const article = createMockArticle();
        const parent = { def: { children: [] as BlockDef[] }, children: [] as any[] };
        const inputDef = baseDef('input', { text: '' });
        const inputBlock = newBlock(article as any, inputDef, parent as any);

        (parseMarkdown as any).mockReturnValue({
            kind: 'item',
            data: {},
            children: [
                { kind: 'paragraph', data: { text: 'First' }, children: [] },
                { kind: 'paragraph', data: { text: 'Second' }, children: [] }
            ]
        });

        const { container } = renderWithProvider(<>{inputBlock.react()}</>);
        const textarea = showEditor(container);
        fireEvent.change(textarea, { target: { value: 'First\nSecond' } });
        fireEvent.blur(textarea);

        expect(article.insertBlock).toHaveBeenCalledWith(
            parent,
            null,
            'after',
            [
                { kind: 'paragraph', data: { text: 'First' }, children: [] },
                { kind: 'paragraph', data: { text: 'Second' }, children: [] }
            ]
        );
    });

    it('inserts a parsed block after the last sibling when input block gets a single block', () => {
        const article = createMockArticle();
        const parent = { def: { children: [] as BlockDef[] }, children: [] as any[] };

        const existingDef = baseDef('paragraph', { text: 'Existing' });
        const existingBlock = newBlock(article as any, existingDef, parent as any);
        parent.children.push(existingBlock);

        const inputDef = baseDef('input', { text: '' });
        const inputBlock = newBlock(article as any, inputDef, parent as any);

        (parseMarkdown as any).mockReturnValue({
            kind: 'paragraph',
            data: { text: 'Inserted' },
            children: []
        });

        const { container } = renderWithProvider(<>{inputBlock.react()}</>);
        const textarea = showEditor(container);
        fireEvent.change(textarea, { target: { value: 'Inserted' } });
        fireEvent.blur(textarea);

        expect(article.insertBlock).toHaveBeenCalledWith(
            parent,
            existingBlock,
            'after',
            [{ kind: 'paragraph', data: { text: 'Inserted' }, children: [] }]
        );
    });
});

