import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/components/article/markdown';

type Node = { kind: string; data: any; children: Node[] };

function findAll(node: Node, predicate: (n: Node) => boolean, path = 'root'): { path: string; node: Node }[] {
    const results: { path: string; node: Node }[] = [];
    if (predicate(node)) results.push({ path, node });
    for (let i = 0; i < (node.children?.length ?? 0); i++) {
        results.push(...findAll(node.children[i], predicate, `${path}/${node.kind}[${i}]`));
    }
    return results;
}

function flattenData(node: Node, path = ''): { path: string; data: any }[] {
    const p = `${path}/${node.kind}`;
    const result = [{ path: p, data: { ...node.data } }];
    for (let i = 0; i < (node.children?.length ?? 0); i++) {
        result.push(...flattenData(node.children[i], `${p}[${i}]`));
    }
    return result;
}

describe('parseMarkdown structure', () => {

    describe('no redundant text nesting', () => {
        const cases = [
            ['plain paragraph', 'Hello world'],
            ['bold paragraph', 'Hello **bold** world'],
            ['italic paragraph', 'Hello *italic* world'],
            ['code paragraph', 'Hello `code` world'],
            ['del paragraph', 'Hello ~~deleted~~ world'],
            ['mixed inline', '**bold** and *italic* and `code`'],
            ['heading plain', '# Hello World'],
            ['heading with bold', '# Hello **World**'],
            ['heading with link', '# Hello [world](http://x.com)'],
            ['flat list', '* Item 1\n* Item 2\n* Item 3'],
            ['ordered list', '1. First\n2. Second\n3. Third'],
            ['nested list', '* Item 1\n* Item 2\n  * Sub 1\n  * Sub 2\n* Item 3'],
            ['deep nesting', '* A\n  * B\n    * C\n      * D'],
            ['bold list item', '* **Bold item**\n* Normal'],
            ['list with link', '* [Link](http://x.com)\n* Normal'],
            ['task list', '* [x] Done\n* [ ] Todo'],
            ['blockquote', '> This is a quote'],
            ['blockquote with bold', '> Quote with **bold**'],
            ['blockquote with list', '> * Item 1\n> * Item 2'],
            ['table', '| A | B |\n|---|---|\n| 1 | 2 |'],
            ['link with bold', '[**bold**](http://x.com)'],
            ['complex list item', '* First **bold** and *italic*\n  * Sub with [link](http://x.com)'],
        ];

        it.each(cases)('%s', (_name, md) => {
            const parsed = parseMarkdown(md as string);
            const redundant = findAll(parsed, (n) =>
                n.kind === 'text' &&
                n.data?.style === null &&
                n.children?.length === 1 &&
                n.children[0].kind === 'text' &&
                n.children[0].data?.style === null &&
                n.children[0].data?.text === n.data.text
            );
            expect(redundant).toEqual([]);
        });
    });

    describe('no token.text leak in list items', () => {
        const cases = [
            ['nested list', '* Item 1\n* Item 2\n  * Item 2.1\n* Item 3'],
            ['deep nested', '* A\n  * B\n    * C'],
            ['mixed nesting', '* Item\n  1. Ordered sub\n  2. Second sub'],
            ['bold item nested', '* **Bold**\n  * Sub'],
            ['link item nested', '* [Link](http://x.com)\n  * Sub'],
            ['multi sub', '* Parent\n  * Sub 1\n  * Sub 2\n  * Sub 3'],
        ];

        it.each(cases)('%s', (_name, md) => {
            const parsed = parseMarkdown(md as string);
            const items = findAll(parsed, (n) => n.kind === 'item');
            for (const { path, node } of items) {
                const text = node.data?.text ?? '';
                expect(text, `item at ${path} should not contain child markup`).not.toMatch(/\n[*\-#>]/);
            }
        });
    });

    describe('no non-inline children in text blocks', () => {
        const allowedInline = ['text', 'codespan', 'br', 'link', 'image'];

        const cases = [
            ['paragraph with bold', 'Hello **bold** world'],
            ['nested list', '* Item 1\n* Item 2\n  * Sub\n* Item 3'],
            ['heading inline', '# **Bold** heading'],
            ['blockquote inline', '> Text with **bold**'],
            ['table inline', '| **Bold** | *Italic* |\n|---|---|\n| a | b |'],
            ['link inline', '[**bold**](http://x.com)'],
            ['complex', '* **Bold** and *italic*\n  * Sub [link](http://x.com)'],
        ];

        it.each(cases)('%s', (_name, md) => {
            const parsed = parseMarkdown(md as string);
            const textBlocks = findAll(parsed, (n) => n.kind === 'text' && (n.children?.length ?? 0) > 0);
            for (const { path, node } of textBlocks) {
                for (const child of node.children) {
                    expect(
                        allowedInline,
                        `text at ${path} has non-inline child '${child.kind}'`
                    ).toContain(child.kind);
                }
            }
        });
    });

    describe('idempotent data fields', () => {
        const cases = [
            ['heading', '# Hello'],
            ['heading bold', '# Hello **World**'],
            ['paragraph', 'Hello world'],
            ['paragraph bold', 'Hello **bold** world'],
            ['list', '* A\n* B'],
            ['nested list', '* A\n  * B\n* C'],
            ['task list', '* [x] Done\n* [ ] Todo'],
            ['code', '```js\ncode\n```'],
            ['blockquote', '> Quote'],
            ['table', '| A | B |\n|---|---|\n| 1 | 2 |'],
            ['hr', '---'],
            ['link', '[text](http://x.com)'],
            ['image', '![alt](http://img.png)'],
            ['mixed', '# Title\n\nParagraph with **bold**\n\n* List\n  * Sub'],
        ];

        it.each(cases)('%s', (_name, md) => {
            const d1 = flattenData(parseMarkdown(md as string));
            const d2 = flattenData(parseMarkdown(md as string));

            expect(d1.length).toBe(d2.length);
            for (let i = 0; i < d1.length; i++) {
                expect(d1[i].path).toBe(d2[i].path);
                expect(JSON.stringify(d1[i].data)).toBe(JSON.stringify(d2[i].data));
            }
        });
    });

    describe('correct tree structure for specific constructs', () => {
        it('nested list item has clean text and correct children', () => {
            const parsed = parseMarkdown('* Item 1\n* Item 2\n  * Item 2.1\n* Item 3');
            expect(parsed.kind).toBe('list');
            expect(parsed.children.length).toBe(3);

            const item2 = parsed.children[1];
            expect(item2.kind).toBe('item');
            expect(item2.data.text).toBe('Item 2');
            expect(item2.children.length).toBe(2);
            expect(item2.children[0].kind).toBe('text');
            expect(item2.children[0].data.text).toBe('Item 2');
            expect(item2.children[0].children.length).toBe(0);
            expect(item2.children[1].kind).toBe('list');
            expect(item2.children[1].children[0].kind).toBe('item');
            expect(item2.children[1].children[0].data.text).toBe('Item 2.1');
        });

        it('heading with inline content has empty text and inline children', () => {
            const parsed = parseMarkdown('# Hello **World**');
            expect(parsed.kind).toBe('heading');
            expect(parsed.data.text).toBe('');
            expect(parsed.data.level).toBe(1);
            expect(parsed.children.length).toBe(2);
            expect(parsed.children[0].kind).toBe('text');
            expect(parsed.children[0].data.text).toBe('Hello ');
            expect(parsed.children[1].kind).toBe('text');
            expect(parsed.children[1].data.style).toBe('strong');
        });

        it('paragraph with mixed inline has correct children', () => {
            const parsed = parseMarkdown('Hello **bold** and `code`');
            expect(parsed.kind).toBe('paragraph');
            expect(parsed.children.length).toBe(4);
            expect(parsed.children[0].data.text).toBe('Hello ');
            expect(parsed.children[1].data.style).toBe('strong');
            expect(parsed.children[2].data.text).toBe(' and ');
            expect(parsed.children[3].kind).toBe('codespan');
        });

        it('blockquote with nested list preserves structure', () => {
            const parsed = parseMarkdown('> * Item 1\n> * Item 2');
            expect(parsed.kind).toBe('blockquote');
            expect(parsed.children.length).toBe(1);
            expect(parsed.children[0].kind).toBe('list');
            expect(parsed.children[0].children.length).toBe(2);
        });

        it('deeply nested list has correct parent text at each level', () => {
            const parsed = parseMarkdown('* A\n  * B\n    * C');
            expect(parsed.kind).toBe('list');
            const itemA = parsed.children[0];
            expect(itemA.data.text).toBe('A');
            expect(itemA.children.length).toBe(2);
            expect(itemA.children[0].kind).toBe('text');
            expect(itemA.children[1].kind).toBe('list');

            const itemB = itemA.children[1].children[0];
            expect(itemB.data.text).toBe('B');
            expect(itemB.children.length).toBe(2);
            expect(itemB.children[0].kind).toBe('text');
            expect(itemB.children[1].kind).toBe('list');

            const itemC = itemB.children[1].children[0];
            expect(itemC.data.text).toBe('C');
        });

        it('link preserves children and data.text consistently', () => {
            const parsed = parseMarkdown('[**bold**](http://x.com)');
            expect(parsed.kind).toBe('paragraph');
            const link = parsed.children[0];
            expect(link.kind).toBe('link');
            expect(link.data.url).toBe('http://x.com');
            expect(link.children.length).toBe(1);
            expect(link.children[0].data.style).toBe('strong');
        });

        it('table cells have proper inline children', () => {
            const parsed = parseMarkdown('| **Bold** | *Italic* |\n|---|---|\n| normal | `code` |');
            expect(parsed.kind).toBe('table');
            const headerRow = parsed.children[0];
            expect(headerRow.children[0].children[0].data.style).toBe('strong');
            expect(headerRow.children[1].children[0].data.style).toBe('em');
            const bodyRow = parsed.children[1];
            expect(bodyRow.children[0].children[0].kind).toBe('text');
            expect(bodyRow.children[1].children[0].kind).toBe('codespan');
        });

        it('task list items have checkbox and correct text', () => {
            const parsed = parseMarkdown('* [x] Done\n* [ ] Todo');
            expect(parsed.kind).toBe('list');
            const done = parsed.children[0];
            expect(done.children[0].kind).toBe('checkbox');
            expect(done.children[0].data.checked).toBe(true);
            const todo = parsed.children[1];
            expect(todo.children[0].kind).toBe('checkbox');
            expect(todo.children[0].data.checked).toBe(false);
        });

        it('code block preserves language and content', () => {
            const parsed = parseMarkdown('```python\nprint("hello")\n```');
            expect(parsed.kind).toBe('code');
            expect(parsed.data.language).toBe('python');
            expect(parsed.data.code).toBe('print("hello")');
            expect(parsed.children.length).toBe(0);
        });

        it('multiple top-level blocks are wrapped in item', () => {
            const parsed = parseMarkdown('# Title\n\nParagraph\n\n* List');
            expect(parsed.kind).toBe('item');
            expect(parsed.children.length).toBe(3);
            expect(parsed.children[0].kind).toBe('heading');
            expect(parsed.children[1].kind).toBe('paragraph');
            expect(parsed.children[2].kind).toBe('list');
        });
    });
});
