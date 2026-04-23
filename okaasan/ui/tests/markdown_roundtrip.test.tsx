import { describe, it, expect } from 'vitest';
import { newBlock, BlockDef, MarkdownGeneratorContext } from '../src/components/article/base';
import { parseMarkdown } from '../src/components/article/markdown';

// Register blocks used in round-trip tests
import '../src/components/article/blocks/heading';
import '../src/components/article/blocks/paragraph';
import '../src/components/article/blocks/text';
import '../src/components/article/blocks/link';
import '../src/components/article/blocks/list';
import '../src/components/article/blocks/item';
import '../src/components/article/blocks/code';
import '../src/components/article/blocks/image';
import '../src/components/article/blocks/blockquote';
import '../src/components/article/blocks/html';
import '../src/components/article/blocks/hr';
import '../src/components/article/blocks/br';
import '../src/components/article/blocks/codespan';
import '../src/components/article/blocks/checkbox';
import '../src/components/article/blocks/table';
import '../src/components/article/blocks/tablecell';
import '../src/components/article/blocks/tablerow';

const mockArticle = { def: {} };

const normalizeBlock = (block: any, parentId: number | null = null, idRef = { value: 1 }): BlockDef => {
    const id = idRef.value++;
    const children = (block.children ?? []).map((child) => normalizeBlock(child, id, idRef));
    return {
        id,
        page_id: 1,
        parent_id: parentId ?? 0,
        kind: block.kind,
        data: block.data ?? {},
        extension: {},
        sequence: id,
        children
    };
};

const toMarkdown = (src: string): string => {
    const parsed = parseMarkdown(src);
    const def = normalizeBlock(parsed);
    const block = newBlock(mockArticle as any, def);
    return block.as_markdown(new MarkdownGeneratorContext());
};

describe('Markdown round-trip per token', () => {
    const cases = [
        { name: 'heading', markdown: '# Heading' },
        { name: 'space', markdown: 'First paragraph.\n\nSecond paragraph.' },
        { name: 'code', markdown: '```js\nconst x = 1;\n```' },
        { name: 'blockquote', markdown: '> Quoted text' },
        { name: 'html', markdown: '<span>Inline HTML</span>' },
        { name: 'hr', markdown: '---' },
        { name: 'list', markdown: '- Item one\n- Item two' },
        { name: 'list_item', markdown: '- Single item' },
        { name: 'checkbox', markdown: '- [x] Done item' },
        { name: 'paragraph', markdown: 'Just a paragraph of text.' },
        { name: 'table', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
        { name: 'strong', markdown: '**Bold**' },
        { name: 'em', markdown: '*Emphasis*' },
        { name: 'codespan', markdown: '`code()`' },
        { name: 'br', markdown: 'Line one  \nLine two' },
        { name: 'del', markdown: '~~Strike~~' },
        { name: 'link', markdown: '[Example](https://example.com "Title")' },
        { name: 'image', markdown: '![Alt](https://example.com/image.png "Caption")' },
        { name: 'text', markdown: 'Plain text token' }
    ];

    cases.forEach(({ name, markdown }) => {
        it(`round-trips ${name} markdown`, () => {
            const md1 = toMarkdown(markdown);
            const md2 = toMarkdown(md1);
            const md3 = toMarkdown(md2);
            expect(md2).toBe(md1);
            expect(md3).toBe(md1);
        });
    });

    it('includes table rows and cells from markdown', () => {
        const parsed = parseMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
        expect(parsed.kind).toBe('table');
        expect(parsed.children?.[0]?.kind).toBe('tablerow');
        expect(parsed.children?.[0]?.children?.[0]?.kind).toBe('tablecell');
    });
});
