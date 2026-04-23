import { describe, it, expect } from 'vitest';
import { newBlock, BlockDef, MarkdownGeneratorContext } from '../src/components/article/base';
import { parseMarkdown } from '../src/components/article/markdown';

import '../src/components/article/blocks/heading';
import '../src/components/article/blocks/paragraph';
import '../src/components/article/blocks/text';
import '../src/components/article/blocks/link';
import '../src/components/article/blocks/list';
import '../src/components/article/blocks/item';
import '../src/components/article/blocks/code';
import '../src/components/article/blocks/codespan';
import '../src/components/article/blocks/checkbox';
import '../src/components/article/blocks/blockquote';
import '../src/components/article/blocks/hr';
import '../src/components/article/blocks/br';
import '../src/components/article/blocks/html';

const mockArticle = { def: {} };

let idCounter = 1;
function makeBlockDef(kind: string, data: any, children?: BlockDef[]): BlockDef {
    return {
        id: idCounter++,
        page_id: 1,
        parent_id: 0,
        kind,
        data,
        extension: {},
        sequence: idCounter,
        children,
    };
}

function toMarkdown(src: string): string {
    const parsed = parseMarkdown(src);
    const def = normalizeBlock(parsed);
    const block = newBlock(mockArticle as any, def);
    return block.as_markdown(new MarkdownGeneratorContext());
}

function normalizeBlock(block: any, parentId: number | null = null, idRef = { value: 1 }): BlockDef {
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
}

describe('List markdown generation', () => {

    describe('simple flat lists', () => {
        it('should generate markdown for a simple unordered list', () => {
            const md = toMarkdown('* Item one\n* Item two');
            expect(md).toBe('* Item one\n* Item two');
        });

        it('should generate markdown for a simple ordered list', () => {
            const md = toMarkdown('1. First\n2. Second\n3. Third');
            expect(md).toBe('1. First\n2. Second\n3. Third');
        });

        it('should round-trip a flat list', () => {
            const input = '* Alpha\n* Beta\n* Gamma';
            const md1 = toMarkdown(input);
            const md2 = toMarkdown(md1);
            expect(md2).toBe(md1);
        });
    });

    describe('nested lists', () => {
        it('should add a newline between item text and nested list', () => {
            const input = '* Item one\n  * Nested one\n  * Nested two';
            const md = toMarkdown(input);

            // The nested list must start on a new line after "Item one"
            expect(md).toContain('* Item one\n');
            expect(md).not.toContain('Item one  *');
            expect(md).not.toContain('Item one*');
        });

        it('should generate valid nested unordered list markdown', () => {
            const input = '* Item one\n  * Nested one\n  * Nested two\n* Item two';
            const md = toMarkdown(input);

            const expected = '* Item one\n  * Nested one\n  * Nested two\n* Item two';
            expect(md).toBe(expected);
        });

        it('should round-trip a nested list', () => {
            const input = '* Item one\n  * Nested one\n  * Nested two\n* Item two';
            const md1 = toMarkdown(input);
            const md2 = toMarkdown(md1);
            expect(md2).toBe(md1);
        });

        it('should handle three levels of nesting', () => {
            const input = '* A\n  * B\n    * C';
            const md = toMarkdown(input);

            expect(md).toContain('* A\n');
            expect(md).toContain('  * B\n');
            expect(md).toContain('    * C');
            expect(md).not.toContain('A  *');
            expect(md).not.toContain('B    *');
        });

        it('should round-trip three levels of nesting', () => {
            const input = '* A\n  * B\n    * C';
            const md1 = toMarkdown(input);
            const md2 = toMarkdown(md1);
            expect(md2).toBe(md1);
        });

        it('should handle nested ordered list inside unordered', () => {
            const input = '* Item\n  1. First\n  2. Second';
            const md = toMarkdown(input);

            expect(md).toContain('* Item\n');
            expect(md).not.toContain('Item  1.');
            expect(md).not.toContain('Item1.');
        });

        it('should handle multiple items with nested lists', () => {
            const input = '* A\n  * A1\n  * A2\n* B\n  * B1';
            const md = toMarkdown(input);

            expect(md).toContain('* A\n');
            expect(md).toContain('* B\n');
            expect(md).not.toContain('A  *');
            expect(md).not.toContain('B  *');
        });

        it('should round-trip multiple items with nested lists', () => {
            const input = '* A\n  * A1\n  * A2\n* B\n  * B1';
            const md1 = toMarkdown(input);
            const md2 = toMarkdown(md1);
            expect(md2).toBe(md1);
        });
    });

    describe('list items with inline formatting', () => {
        it('should not add spurious newlines between inline children', () => {
            const input = '* This is **bold** text';
            const md = toMarkdown(input);

            // inline elements should stay on the same line
            expect(md).not.toContain('\n');
            expect(md).toContain('__bold__');
        });

        it('should handle inline formatting with nested list', () => {
            const input = '* **Bold item**\n  * Nested';
            const md = toMarkdown(input);

            // bold should be on same line as marker, nested list on new line
            expect(md).toMatch(/\* .*bold.*\n\s+\* Nested/i);
        });
    });

    describe('list items with checkboxes', () => {
        it('should round-trip checkbox list items', () => {
            const input = '* [x] Done\n* [ ] Todo';
            const md1 = toMarkdown(input);
            const md2 = toMarkdown(md1);
            expect(md2).toBe(md1);
        });
    });

    describe('edge cases', () => {
        it('should handle a single item list', () => {
            const md = toMarkdown('* Only item');
            expect(md).toBe('* Only item');
        });

        it('should handle empty nested list item text', () => {
            const input = '* \n  * Nested';
            const md = toMarkdown(input);
            expect(md).toContain('* Nested');
        });
    });
});
