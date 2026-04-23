import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, newBlock } from '../src/components/article/base';

// Mocks for external libraries
vi.mock('@monaco-editor/react', () => ({
    default: ({ value, language }: any) => <div className="mock-monaco-editor" data-language={language}>{value}</div>,
    DiffEditor: ({ original, modified }: any) => <div className="mock-monaco-diff-editor">{original} | {modified}</div>
}));

vi.mock('katex', () => ({
    default: {
        render: (formula: string, element: HTMLElement) => { element.innerHTML = formula; }
    }
}));

vi.mock('mermaid', () => ({
    default: {
        initialize: () => { },
        render: async (id: string, text: string) => ({ svg: `<svg>${text}</svg>` })
    }
}));

vi.mock('vega-themes', () => ({
    dark: {},
    default: {}
}));

vi.mock('../src/contexts/VegaContext', () => ({
    useVega: () => ({
        isLoaded: true,
        embed: async (el: HTMLElement, spec: any) => { el.innerHTML = 'Vega-Lite Plot'; },
        error: null
    })
}));

// Mock ArticleInstance
class MockArticleInstance {
    def: any = {};
}

// Create the theme system for Chakra UI v3 (same as App.tsx)
const system = createSystem(defaultConfig);

// Test wrapper with ChakraProvider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return <ChakraProvider value={system}>{children}</ChakraProvider>;
};

const renderWithProvider = (component: React.ReactNode) => {
    return render(<TestWrapper>{component}</TestWrapper>);
};

// Import all blocks to ensure they're registered - using the same pattern as article.tsx
import '../src/components/article/blocks/heading';
import '../src/components/article/blocks/paragraph';
import '../src/components/article/blocks/text';
import '../src/components/article/blocks/codespan';
import '../src/components/article/blocks/br';
import '../src/components/article/blocks/hr';
import '../src/components/article/blocks/html';
import '../src/components/article/blocks/checkbox';
import '../src/components/article/blocks/blockquote';
import '../src/components/article/blocks/tablecell';
import '../src/components/article/blocks/tablerow';
import '../src/components/article/blocks/list';
import '../src/components/article/blocks/item';
import '../src/components/article/blocks/layout';
import '../src/components/article/blocks/toc';
import '../src/components/article/blocks/code';
import '../src/components/article/blocks/image';
import '../src/components/article/blocks/video';
import '../src/components/article/blocks/audio';
import '../src/components/article/blocks/latex';
import '../src/components/article/blocks/mermaid';
import '../src/components/article/blocks/reference';
import '../src/components/article/blocks/footnote';
import '../src/components/article/blocks/bibliography';
import '../src/components/article/blocks/footnotes';
import '../src/components/article/blocks/spreadsheet';
import '../src/components/article/blocks/plot';
import '../src/components/article/blocks/table';
import '../src/components/article/blocks/timeline';
import '../src/components/article/blocks/accordion';
import '../src/components/article/blocks/alert';
import '../src/components/article/blocks/quiz';
import '../src/components/article/blocks/toggle';
import '../src/components/article/blocks/button';
import '../src/components/article/blocks/embed';
import '../src/components/article/blocks/form';
import '../src/components/article/blocks/gallery';
import '../src/components/article/blocks/slideshow';
import '../src/components/article/blocks/animation';
import '../src/components/article/blocks/iframe';
import '../src/components/article/blocks/model3d';
import '../src/components/article/blocks/diff';
import '../src/components/article/blocks/cli';
import '../src/components/article/blocks/sandbox';
import '../src/components/article/blocks/definition';
import '../src/components/article/blocks/glossary';
import '../src/components/article/blocks/theorem';
import '../src/components/article/blocks/citation';
import '../src/components/article/blocks/graph';
import '../src/components/article/blocks/blockly';
import '../src/components/article/blocks/electrical';
import '../src/components/article/blocks/drawing';
import '../src/components/article/blocks/workflow';
import '../src/components/article/blocks/constraint';
import '../src/components/article/blocks/filetree';
import '../src/components/article/blocks/datastructure';
import '../src/components/article/blocks/trace';
import '../src/components/article/blocks/ast';
import '../src/components/article/blocks/bnf';

describe('Article Blocks', () => {
    let mockArticle: MockArticleInstance;

    beforeEach(() => {
        mockArticle = new MockArticleInstance();
    });

    const createBlock = (kind: string, data: any): BlockBase => {
        const def: BlockDef = {
            id: 1,
            page_id: 1,
            parent_id: 0,
            kind,
            data,
            extension: {},
            sequence: 0
        };
        return newBlock(mockArticle as any, def);
    };

    describe('Basic Content Blocks', () => {
        it('should render heading block', () => {
            const block = createBlock('heading', { text: 'Test Heading', level: 1 });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Test Heading');
        });

        it('should render paragraph block', () => {
            const block = createBlock('paragraph', { text: 'Test paragraph text' });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Test paragraph text');
        });

        it('should render text block', () => {
            const block = createBlock('text', { text: 'Test text', style: null });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Test text');
        });

        it('should render text block with strong style', () => {
            const block = createBlock('text', { text: 'Bold text', style: 'strong' });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Bold text');
        });

        it('should render toc block', () => {
            const block = createBlock('toc', { title: 'Table of Contents' });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Table of Contents');
        });

        it('should render code block', () => {
            const block = createBlock('code', { code: 'const x = 1;', language: 'javascript' });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('const x = 1;');
        });
    });

    describe('Media Blocks', () => {
        it('should render image block', () => {
            const block = createBlock('image', {
                url: 'https://example.com/image.jpg',
                alt: 'Test image',
                caption: 'Image caption'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const img = container.querySelector('img');
            expect(img).toBeTruthy();
            expect(img?.getAttribute('src')).toBe('https://example.com/image.jpg');
        });

        it('should render video block', () => {
            const block = createBlock('video', {
                url: 'https://example.com/video.mp4',
                caption: 'Video caption'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const video = container.querySelector('video');
            expect(video).toBeTruthy();
            expect(video?.getAttribute('src')).toBe('https://example.com/video.mp4');
        });

        it('should render audio block', () => {
            const block = createBlock('audio', {
                url: 'https://example.com/audio.mp3',
                caption: 'Audio caption'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const audio = container.querySelector('audio');
            expect(audio).toBeTruthy();
            expect(audio?.getAttribute('src')).toBe('https://example.com/audio.mp3');
        });

        it('should render gallery block', () => {
            const block = createBlock('gallery', {
                caption: 'Gallery caption',
                columns: 3,
                images: [
                    { url: 'https://example.com/img1.jpg', alt: 'Image 1' },
                    { url: 'https://example.com/img2.jpg', alt: 'Image 2' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const images = container.querySelectorAll('img');
            expect(images.length).toBe(2);
        });

        it('should render slideshow block', () => {
            const block = createBlock('slideshow', {
                autoPlay: false,
                interval: 3000,
                showDots: true,
                slides: [
                    { url: 'https://example.com/slide1.jpg', caption: 'Slide 1' },
                    { url: 'https://example.com/slide2.jpg', caption: 'Slide 2' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const img = container.querySelector('img');
            expect(img).toBeTruthy();
        });

        it('should render animation block', () => {
            const block = createBlock('animation', {
                url: 'https://example.com/animation.gif',
                caption: 'Animation caption'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const img = container.querySelector('img');
            expect(img).toBeTruthy();
        });

        it('should render iframe block', () => {
            const block = createBlock('iframe', {
                url: 'https://example.com',
                height: 400
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const iframe = container.querySelector('iframe');
            expect(iframe).toBeTruthy();
        });

        it('should render embed block', () => {
            const block = createBlock('embed', {
                url: 'https://www.youtube.com/watch?v=test',
                caption: 'Embed caption',
                aspectRatio: '16/9'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const iframe = container.querySelector('iframe');
            expect(iframe).toBeTruthy();
        });

        it('should render model3d block', () => {
            const block = createBlock('model3d', {
                url: 'https://example.com/model.glb',
                caption: '3D Model'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('3D Model');
        });
    });

    describe('Mathematical Blocks', () => {
        it('should render latex block', async () => {
            const block = createBlock('latex', { formula: 'E = mc^2' });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            await waitFor(() => {
                expect(container.textContent).toContain('E = mc^2');
            });
        });

        it('should render mermaid block', async () => {
            const block = createBlock('mermaid', {
                diagram: 'graph TD\nA-->B'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            await waitFor(() => {
                expect(container.textContent).toContain('graph TD');
            });
        });
    });

    describe('Reference Blocks', () => {
        it('should render reference block', () => {
            const block = createBlock('reference', {
                citation: 'Smith, J. (2024). Title. Publisher.'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Smith, J. (2024)');
        });

        it('should render footnote block', () => {
            const block = createBlock('footnote', {
                number: '1',
                text: 'Footnote text'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Footnote text');
        });

        it('should render bibliography block', () => {
            const block = createBlock('bibliography', {
                title: 'References',
                style: 'apa'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('References');
        });

        it('should render footnotes block', () => {
            const block = createBlock('footnotes', {
                title: 'Footnotes',
                showDivider: true
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Footnotes');
        });
    });

    describe('Data Visualization Blocks', () => {
        it('should render spreadsheet block', () => {
            const block = createBlock('spreadsheet', {
                title: 'Data Table',
                headers: ['Name', 'Age'],
                showHeaders: true,
                data: [['John', '30'], ['Jane', '25']]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Data Table');
            expect(container.textContent).toContain('John');
        });

        it('should render table block', () => {
            const block = createBlock('table', {
                format: 'json',
                showHeaders: true,
                caption: 'Table Caption',
                data: JSON.stringify([
                    { Name: 'John', Age: '30' },
                    { Name: 'Jane', Age: '25' }
                ])
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Table Caption');
        });

        it('should render timeline block', () => {
            const block = createBlock('timeline', {
                title: 'Project Timeline',
                showProgress: true,
                items: [
                    {
                        task: 'Task 1',
                        start: '2025-01-01',
                        end: '2025-01-15',
                        progress: 100
                    }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Project Timeline');
            expect(container.textContent).toContain('Task 1');
        });

        it('should render plot block', () => {
            const block = createBlock('plot', {
                spec: { mark: 'bar', data: { values: [] } }
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Vega-Lite Plot');
        });
    });

    describe('Interactive Blocks', () => {
        it('should render accordion block', () => {
            const block = createBlock('accordion', {
                allowMultiple: true,
                defaultExpanded: [0],
                items: [
                    { title: 'Item 1', content: 'Content 1' },
                    { title: 'Item 2', content: 'Content 2' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Item 1');
            expect(container.textContent).toContain('Content 1');
        });

        it('should render alert block', () => {
            const block = createBlock('alert', {
                type: 'info',
                title: 'Info',
                message: 'This is an info message'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('This is an info message');
        });

        it('should render quiz block', () => {
            const block = createBlock('quiz', {
                question: 'What is 2+2?',
                options: ['3', '4', '5', '6'],
                correctAnswer: 1,
                explanation: 'Basic math'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('What is 2+2?');
            expect(container.textContent).toContain('4');
        });

        it('should render toggle block', () => {
            const block = createBlock('toggle', {
                title: 'Toggle Title',
                content: 'Toggle content',
                defaultOpen: false
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Toggle Title');
        });

        it('should render button block', () => {
            const block = createBlock('button', {
                text: 'Click Me',
                url: 'https://example.com',
                variant: 'solid',
                colorScheme: 'blue'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            const link = container.querySelector('a');
            expect(link).toBeTruthy();
            expect(link?.textContent).toContain('Click Me');
        });

        it('should render form block', () => {
            const block = createBlock('form', {
                title: 'Contact Form',
                fields: [
                    { id: 'name', label: 'Name', type: 'text', required: true }
                ],
                submitText: 'Submit'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Contact Form');
            expect(container.textContent).toContain('Name');
        });
    });

    describe('Academic Blocks', () => {
        it('should render definition block', () => {
            const block = createBlock('definition', {
                term: 'Algorithm',
                pronunciation: 'al-guh-ri-thuhm',
                partOfSpeech: 'noun',
                definition: 'A step-by-step procedure'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Algorithm');
            expect(container.textContent).toContain('A step-by-step procedure');
        });

        it('should render glossary block', () => {
            const block = createBlock('glossary', {
                title: 'Glossary',
                sortAlphabetically: true
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Glossary');
        });

        it('should render theorem block', () => {
            const block = createBlock('theorem', {
                type: 'theorem',
                number: '1.1',
                title: 'Pythagorean Theorem',
                content: 'a² + b² = c²'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Pythagorean Theorem');
        });

        it('should render citation block', () => {
            const block = createBlock('citation', {
                author: 'Einstein',
                year: '1905',
                text: 'E = mc²'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('E = mc²');
            expect(container.textContent).toContain('Einstein');
        });
    });

    describe('Code-Related Blocks', () => {
        it('should render diff block', () => {
            const block = createBlock('diff', {
                filename: 'test.ts',
                language: 'typescript',
                before: 'const x = 1;',
                after: 'const x = 2;'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('test.ts');
            expect(container.textContent).toContain('const x = 1;');
        });

        it('should render cli block', () => {
            const block = createBlock('cli', {
                command: 'npm install',
                output: 'Installed packages',
                prompt: '$'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('npm install');
        });

        it('should render sandbox block', () => {
            const block = createBlock('sandbox', {
                caption: 'Code Sandbox',
                language: 'javascript',
                code: 'console.log("Hello");'
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Code Sandbox');
            expect(container.textContent).toContain('console.log');
        });
    });

    describe('Advanced Blocks', () => {
        it('should render workflow block', () => {
            const block = createBlock('workflow', {
                caption: 'Workflow',
                layout: 'vertical',
                nodes: [
                    { id: '1', type: 'start', label: 'Start' },
                    { id: '2', type: 'task', label: 'Task' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Start');
            expect(container.textContent).toContain('Task');
        });

        it('should render constraint block', () => {
            const block = createBlock('constraint', {
                caption: 'Constraints',
                constraints: [
                    {
                        name: 'Constraint 1',
                        expression: 'x > 0',
                        satisfied: true,
                        description: 'Test constraint'
                    }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Constraint 1');
        });

        it('should render filetree block', () => {
            const block = createBlock('filetree', {
                title: 'File Tree',
                tree: [
                    { name: 'src', type: 'folder', children: [] },
                    { name: 'index.ts', type: 'file' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('File Tree');
            expect(container.textContent).toContain('src');
        });

        it('should render trace block', () => {
            const block = createBlock('trace', {
                caption: 'Execution Trace',
                steps: [
                    { timestamp: 0, function: 'main', type: 'call' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Execution Trace');
        });

        it('should render ast block', () => {
            const block = createBlock('ast', {
                caption: 'AST',
                sourceCode: 'const x = 1;',
                ast: { type: 'Program' }
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('AST');
        });

        it('should render bnf block', () => {
            const block = createBlock('bnf', {
                caption: 'BNF Grammar',
                notation: 'bnf',
                rules: [
                    { name: 'expr', definition: '<term> + <expr>' }
                ]
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('BNF Grammar');
            expect(container.textContent).toContain('expr');
        });

        it('should render graph block', () => {
            const block = createBlock('graph', {
                caption: 'Graph',
                height: 400,
                graph: { nodes: [], links: [] }
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Graph');
        });

        it('should render blockly block', () => {
            const block = createBlock('blockly', {
                caption: 'Blockly',
                height: 450,
                language: 'JavaScript',
                blocks: {}
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Blockly');
        });

        it('should render electrical block', () => {
            const block = createBlock('electrical', {
                title: 'Circuit',
                width: 600,
                height: 350,
                components: [],
                wires: []
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Circuit');
        });

        it('should render drawing block', () => {
            const block = createBlock('drawing', {
                title: 'Drawing',
                width: 600,
                height: 400
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Drawing');
        });

        it('should render datastructure block', () => {
            const block = createBlock('datastructure', {
                caption: 'Data Structure',
                type: 'tree',
                data: { value: 1 }
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Data Structure');
        });
    });

    describe('List and Layout Blocks', () => {
        it('should render list block', () => {
            const block = createBlock('list', {
                items: ['Item 1', 'Item 2'],
                level: 0
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.textContent).toContain('Item 1');
        });

        it('should render item block', () => {
            const block = createBlock('item', {
                items: [],
                level: 0
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.querySelector('div')).toBeTruthy();
        });

        it('should render layout block', () => {
            const block = createBlock('layout', {
                layout: 'column',
                column: 2
            });
            const { container } = renderWithProvider(<>{block.component('view')}</>);
            expect(container.querySelector('div')).toBeTruthy();
        });
    });

    describe('Markdown Generation', () => {
        it('should generate markdown for heading', () => {
            const block = createBlock('heading', { text: 'Test', level: 1 });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('# Test');
        });

        it('should generate markdown for paragraph', () => {
            const block = createBlock('paragraph', { text: 'Test paragraph' });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('Test paragraph');
        });

        it('should generate markdown for text with strong style', () => {
            const block = createBlock('text', { text: 'Bold', style: 'strong' });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('__Bold__');
        });

        it('should generate markdown for code block', () => {
            const block = createBlock('code', { code: 'const x = 1;', language: 'js' });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('```js');
            expect(md).toContain('const x = 1;');
        });

        it('should generate markdown for image', () => {
            const block = createBlock('image', {
                url: 'https://example.com/img.jpg',
                alt: 'Test image'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('![Test image]');
            expect(md).toContain('https://example.com/img.jpg');
        });

        it('should generate markdown for spreadsheet', () => {
            const block = createBlock('spreadsheet', {
                headers: ['A', 'B'],
                showHeaders: true,
                data: [['1', '2']]
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('| A | B |');
        });

        it('should generate markdown for button', () => {
            const block = createBlock('button', {
                text: 'Click',
                url: 'https://example.com'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('[Click]');
            expect(md).toContain('https://example.com');
        });

        it('should generate markdown for latex', () => {
            const block = createBlock('latex', { formula: 'E = mc^2' });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('$$E = mc^2$$');
        });

        it('should generate markdown for mermaid', () => {
            const block = createBlock('mermaid', { diagram: 'graph TD\nA-->B' });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('```mermaid');
            expect(md).toContain('graph TD');
        });

        it('should generate markdown for reference', () => {
            const block = createBlock('reference', {
                citation: 'Smith, J. (2024). Title.'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('Smith, J. (2024)');
        });

        it('should generate markdown for footnote', () => {
            const block = createBlock('footnote', {
                number: '1',
                text: 'Footnote text'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('[^1]:');
            expect(md).toContain('Footnote text');
        });

        it('should generate markdown for citation', () => {
            const block = createBlock('citation', {
                author: 'Einstein',
                year: '1905',
                text: 'E = mc²'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('E = mc²');
        });

        it('should generate markdown for alert', () => {
            const block = createBlock('alert', {
                type: 'info',
                title: 'Info',
                message: 'Message'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('**Info**: Message');
        });

        it('should generate markdown for definition', () => {
            const block = createBlock('definition', {
                term: 'Term',
                definition: 'Definition text'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('**Term**:');
            expect(md).toContain('Definition text');
        });

        it('should generate markdown for theorem', () => {
            const block = createBlock('theorem', {
                type: 'theorem',
                number: '1.1',
                content: 'Theorem content'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('Theorem content');
        });

        it('should generate markdown for bnf', () => {
            const block = createBlock('bnf', {
                rules: [
                    { name: 'expr', definition: '<term>' }
                ]
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('expr ::=');
        });

        it('should generate markdown for cli', () => {
            const block = createBlock('cli', {
                command: 'npm install',
                output: 'Installed',
                prompt: '$'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('```bash');
            expect(md).toContain('npm install');
        });

        it('should generate markdown for sandbox', () => {
            const block = createBlock('sandbox', {
                code: 'console.log("test");',
                language: 'javascript'
            });
            const ctx = new MarkdownGeneratorContext();
            const md = block.as_markdown(ctx);
            expect(md).toContain('```javascript');
            expect(md).toContain('console.log');
        });
    });

    describe('Block Registration', () => {
        it('should register all block types', () => {
            const blockTypes = [
                'heading', 'paragraph', 'text', 'codespan', 'br', 'hr', 'html', 'checkbox', 'blockquote', 'tablecell', 'tablerow', 'list', 'item', 'layout',
                'toc', 'code', 'image', 'video', 'audio', 'latex', 'mermaid',
                'reference', 'footnote', 'bibliography', 'footnotes',
                'spreadsheet', 'plot', 'table', 'timeline',
                'accordion', 'alert', 'quiz', 'toggle', 'button', 'embed', 'form',
                'gallery', 'slideshow', 'animation', 'iframe', 'model3d',
                'diff', 'cli', 'sandbox',
                'definition', 'glossary', 'theorem', 'citation',
                'graph', 'blockly', 'electrical', 'drawing', 'workflow',
                'constraint', 'filetree', 'datastructure', 'trace', 'ast', 'bnf'
            ];

            blockTypes.forEach(kind => {
                const block = createBlock(kind, {});
                expect(block).toBeTruthy();
                expect(block.def.kind).toBe(kind);
            });
        });
    });

    describe('Block Properties', () => {
        it('should have correct block properties', () => {
            const block = createBlock('heading', { text: 'Test', level: 2 });
            expect(block.def.id).toBe(1);
            expect(block.def.kind).toBe('heading');
            expect(block.def.data.text).toBe('Test');
            expect(block.def.data.level).toBe(2);
        });

        it('should handle children blocks', () => {
            const def: BlockDef = {
                id: 1,
                page_id: 1,
                parent_id: 0,
                kind: 'layout',
                data: { layout: 'column', column: 2 },
                extension: {},
                sequence: 0,
                children: [
                    {
                        id: 2,
                        page_id: 1,
                        parent_id: 1,
                        kind: 'paragraph',
                        data: { text: 'Child paragraph' },
                        extension: {},
                        sequence: 0
                    }
                ]
            };
            const block = newBlock(mockArticle as any, def);
            expect(block.children.length).toBe(1);
        });
    });

    describe('is_md_representable', () => {
        const mdBlocks = ['heading', 'paragraph', 'text', 'code', 'button'];

        mdBlocks.forEach(kind => {
            it(`should return true for markdown-representable block: ${kind}`, () => {
                const block = createBlock(kind, {});
                expect(block.is_md_representable()).toBe(true);
            });
        });

        it('should return false for non-markdown blocks', () => {
            const nonMdBlocks = ['toc', 'accordion', 'quiz', 'gallery', 'plot'];
            nonMdBlocks.forEach(kind => {
                const block = createBlock(kind, {});
                expect(block.is_md_representable()).toBe(false);
            });
        });
    });
});
