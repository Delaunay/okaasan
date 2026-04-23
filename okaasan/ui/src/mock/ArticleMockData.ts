import { Article } from '../services/type';

/**
 * Comprehensive mock article demonstrating ALL block types
 * This single article showcases every available block type for easy testing
 */
export const comprehensiveArticle: Article = {
    id: 1,
    title: 'Complete Article Block Showcase',
    namespace: 'documentation/blocks',
    tags: ['demo', 'all-blocks', 'comprehensive'],
    extension: {
        author: 'System',
        publishedDate: '2025-11-02',
        readTime: '10 min'
    },
    blocks: [
        // Heading Level 1
        {
            id: 1,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 1,
                text: 'Article Block System Documentation'
            }
        },
        // Paragraph
        {
            id: 2,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'This article demonstrates all available block types in the article system. Each block can be edited, reordered via drag-and-drop, and nested within other blocks. The system is designed to be modular and extensible.'
            }
        },
        // Table of Contents (auto-generated)
        {
            id: 2.5,
            page_id: 1,
            kind: 'toc',
            data: {
                title: 'Table of Contents',
                maxLevel: 3
            }
        },
        // Heading Level 2
        {
            id: 3,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Text and Content Blocks'
            }
        },
        // Simple text block
        {
            id: 4,
            page_id: 1,
            kind: 'text',
            data: {
                content: 'This is a simple text block. It\'s lighter weight than a paragraph and great for short snippets.'
            }
        },
        // Unordered List
        {
            id: 5,
            page_id: 1,
            kind: 'list',
            data: {
                ordered: false,
                items: [
                    'Text blocks for simple content',
                    'Paragraph blocks for longer text',
                    'Heading blocks with 6 levels',
                    'Code blocks with syntax highlighting'
                ]
            },
            children: [
                {
                    kind: "text",
                    data: {
                        text: "another item"
                    }
                },
                {
                    kind: "list",
                    data: {
                        items: []
                    },
                    children: [
                        {
                            kind: "text",
                            data: {
                                text: "nested list"
                            }
                        },
                    ]
                }
            ]
        },
        // Heading Level 2
        {
            id: 6,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Code and Technical Content'
            }
        },
        // Code block
        {
            id: 7,
            page_id: 1,
            kind: 'code',
            data: {
                language: 'typescript',
                code: `// Example TypeScript code
interface ArticleBlock {
    id?: number;
    kind?: string;
    data?: any;
    children?: ArticleBlock[];
}

function renderBlock(block: ArticleBlock) {
    return BlockFactory.render({ block, readonly: false });
}`
            }
        },
        // Paragraph
        {
            id: 8,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Code blocks support syntax highlighting for multiple languages including JavaScript, TypeScript, Python, and more.'
            }
        },
        // Heading Level 2
        {
            id: 9,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Media Blocks'
            }
        },
        // Image
        {
            id: 10,
            page_id: 1,
            kind: 'image',
            data: {
                url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Cumulus_Clouds_over_Yellow_Prairie2.jpg/1920px-Cumulus_Clouds_over_Yellow_Prairie2.jpg',
                alt: 'Sample placeholder image',
                caption: 'This is an image block with a caption',
                height: "500px"
            }
        },
        // Video
        {
            id: 11,
            page_id: 1,
            kind: 'video',
            data: {
                url: 'https://www.w3schools.com/html/mov_bbb.mp4',
                caption: 'Video blocks support standard video formats',
                height: "500px"
            }
        },
        // Audio
        {
            id: 12,
            page_id: 1,
            kind: 'audio',
            data: {
                url: 'https://www.w3schools.com/html/horse.mp3',
                caption: 'Audio blocks for podcasts and sound files'
            }
        },
        // Heading Level 2
        {
            id: 13,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Structured Content'
            }
        },
        // Ordered List
        {
            id: 14,
            page_id: 1,
            kind: 'list',
            data: {
                ordered: true,
                items: [
                    'First step: Plan your article structure',
                    'Second step: Add blocks for each content type',
                    'Third step: Edit inline or via settings modal',
                    'Fourth step: Drag to reorder blocks',
                    'Fifth step: Export or save your article'
                ]
            }
        },
        // Heading Level 2
        {
            id: 15,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Multi-Column Layout'
            }
        },
        // Layout block with 3 columns
        {
            id: 16,
            page_id: 1,
            kind: 'layout',
            data: {
                layout: "column",
                column: 3
            },
            children: [
                {
                    id: 17,
                    page_id: 1,
                    parent_id: 16,
                    kind: 'item',
                    data: {},
                    children: [
                        {
                            id: 19,
                            page_id: 1,
                            parent_id: 16,
                            kind: 'heading',
                            data: {
                                level: 3,
                                text: 'Column 1'
                            }
                        },
                        {
                            id: 20,
                            page_id: 1,
                            parent_id: 16,
                            kind: 'paragraph',
                            data: {
                                text: 'Each column can contain any block type. This is the second column.'
                            }
                        },
                    ]
                },
                {
                    id: 17,
                    page_id: 1,
                    parent_id: 16,
                    kind: 'item',
                    data: {},
                    children: [
                        {
                            id: 19,
                            page_id: 1,
                            parent_id: 16,
                            kind: 'heading',
                            data: {
                                level: 3,
                                text: 'Column 2'
                            }
                        },
                        {
                            id: 20,
                            page_id: 1,
                            parent_id: 16,
                            kind: 'paragraph',
                            data: {
                                text: 'Each column can contain any block type. This is the second column.'
                            }
                        },
                    ]
                },
            ]
        },
        // Heading Level 2
        {
            id: 23,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Mathematical and Diagram Content'
            }
        },
        // LaTeX
        {
            id: 24,
            page_id: 1,
            kind: 'latex',
            data: {
                formula: 'E = mc^2'
            }
        },
        {
            id: 25,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'LaTeX blocks are perfect for mathematical formulas and equations. Integration with KaTeX or MathJax would render these beautifully.'
            }
        },
        // Mermaid Diagram
        {
            id: 26,
            page_id: 1,
            kind: 'mermaid',
            data: {
                diagram: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[End]`
            }
        },
        {
            id: 27,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Mermaid blocks allow you to create flowcharts, sequence diagrams, and other visualizations using simple text syntax.'
            }
        },
        // Heading Level 2
        {
            id: 28,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'References and Citations'
            }
        },
        // Reference
        {
            id: 29,
            page_id: 1,
            kind: 'reference',
            data: {
                citation: 'Smith, J. (2024). Modern Web Development Practices. Tech Publishers.'
            }
        },
        {
            id: 30,
            page_id: 1,
            kind: 'reference',
            data: {
                citation: 'Johnson, M. & Lee, K. (2023). Component-Based Architecture. Journal of Software Engineering, 45(2), 123-145.'
            }
        },
        // Paragraph with footnote reference
        {
            id: 31,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'The article system supports academic citations and footnotes[1] for scholarly content.'
            }
        },
        // Footnote
        {
            id: 32,
            page_id: 1,
            kind: 'footnote',
            data: {
                number: '1',
                text: 'Footnotes can provide additional context or references without cluttering the main text.'
            }
        },
        // Heading Level 2
        {
            id: 33,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Nested Content Example'
            }
        },
        // Layout with nested content showing depth
        {
            id: 34,
            page_id: 1,
            kind: 'layout',
            data: {
                columns: 2
            },
            children: [
                {
                    id: 35,
                    page_id: 1,
                    parent_id: 34,
                    kind: 'heading',
                    data: {
                        level: 3,
                        text: 'Left Side'
                    }
                },
                {
                    id: 36,
                    page_id: 1,
                    parent_id: 34,
                    kind: 'paragraph',
                    data: {
                        text: 'Blocks can be nested multiple levels deep, creating complex document structures.'
                    }
                },
                {
                    id: 37,
                    page_id: 1,
                    parent_id: 34,
                    kind: 'list',
                    data: {
                        ordered: false,
                        items: [
                            'Nested layouts',
                            'Nested lists',
                            'Mixed content types',
                            'Responsive design'
                        ]
                    }
                },
                {
                    id: 38,
                    page_id: 1,
                    parent_id: 34,
                    kind: 'heading',
                    data: {
                        level: 3,
                        text: 'Right Side'
                    }
                },
                {
                    id: 39,
                    page_id: 1,
                    parent_id: 34,
                    kind: 'code',
                    data: {
                        language: 'javascript',
                        code: `// Nested block example
const article = {
  blocks: [
    {
      kind: 'layout',
      children: [
        { kind: 'heading' },
        { kind: 'paragraph' }
      ]
    }
  ]
};`
                    }
                }
            ]
        },
        // Spreadsheet Example
        {
            id: 44,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Data Visualization'
            }
        },
        {
            id: 45,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 3,
                text: 'Spreadsheet Block'
            }
        },
        {
            id: 46,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Interactive spreadsheet for tabular data:'
            }
        },
        {
            id: 47,
            page_id: 1,
            kind: 'spreadsheet',
            data: {
                headers: ['Framework', 'Language', 'Stars (k)', 'Released'],
                showHeaders: true,
                data: [
                    ['React', 'JavaScript', '220', '2013'],
                    ['Vue.js', 'JavaScript', '207', '2014'],
                    ['Angular', 'TypeScript', '93', '2016'],
                    ['Svelte', 'JavaScript', '75', '2016'],
                    ['Solid', 'TypeScript', '31', '2021']
                ]
            }
        },
        // Vega Plot Example
        {
            id: 48,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 3,
                text: 'Vega Plot Block'
            }
        },
        {
            id: 49,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Interactive data visualization using Vega-Lite:'
            }
        },
        {
            id: 50,
            page_id: 1,
            kind: 'plot',
            data: {
                spec: {
                    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                    "description": "Monthly Downloads Comparison",
                    "width": "container",
                    "height": 250,
                    "padding": { "left": 10, "top": 10, "right": 10, "bottom": 10 },
                    "config": {
                        "legend": {
                            "labelFontSize": 12,
                            "titleFontSize": 13,
                            "symbolSize": 100,
                            "padding": 10,
                            "labelPadding": 8,
                            "rowPadding": 5,
                            "columnPadding": 10
                        },
                        "axis": {
                            "labelFontSize": 11,
                            "titleFontSize": 12,
                            "labelPadding": 8,
                            "titlePadding": 10
                        }
                    },
                    "data": {
                        "values": [
                            { "month": "Jan", "framework": "React", "downloads": 45 },
                            { "month": "Jan", "framework": "Vue", "downloads": 30 },
                            { "month": "Jan", "framework": "Angular", "downloads": 20 },
                            { "month": "Feb", "framework": "React", "downloads": 48 },
                            { "month": "Feb", "framework": "Vue", "downloads": 32 },
                            { "month": "Feb", "framework": "Angular", "downloads": 22 },
                            { "month": "Mar", "framework": "React", "downloads": 52 },
                            { "month": "Mar", "framework": "Vue", "downloads": 35 },
                            { "month": "Mar", "framework": "Angular", "downloads": 21 },
                            { "month": "Apr", "framework": "React", "downloads": 55 },
                            { "month": "Apr", "framework": "Vue", "downloads": 38 },
                            { "month": "Apr", "framework": "Angular", "downloads": 23 }
                        ]
                    },
                    "mark": {
                        "type": "line",
                        "point": true,
                        "strokeWidth": 2
                    },
                    "encoding": {
                        "x": { "field": "month", "type": "ordinal", "title": "Month" },
                        "y": { "field": "downloads", "type": "quantitative", "title": "Downloads (M)" },
                        "color": {
                            "field": "framework",
                            "type": "nominal",
                            "title": "Framework",
                            "legend": {
                                "orient": "right",
                                "titlePadding": 10,
                                "labelPadding": 8,
                                "symbolStrokeWidth": 2
                            }
                        }
                    }
                }
            }
        },
        // Accordion Example
        {
            id: 51,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Interactive Components'
            }
        },
        {
            id: 52,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 3,
                text: 'Accordion Block'
            }
        },
        {
            id: 53,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Collapsible sections for organizing content:'
            }
        },
        {
            id: 54,
            page_id: 1,
            kind: 'accordion',
            data: {
                allowMultiple: true,
                defaultExpanded: [0],
                items: [
                    {
                        title: 'What is an accordion?',
                        content: 'An accordion is a vertically stacked list of items. Each item can be "expanded" or "collapsed" to reveal the content associated with that item. There can be zero expanded items, exactly one expanded item, or more than one item expanded at a time, depending on the configuration.'
                    },
                    {
                        title: 'When should I use it?',
                        content: 'Use accordions when:\n• You have long content that needs to be organized\n• Users only need to see a few sections at a time\n• You want to reduce page scrolling\n• Content can be logically grouped into sections'
                    },
                    {
                        title: 'Accessibility considerations',
                        content: 'Accordions should be keyboard navigable and screen reader friendly. Each accordion header should be a button that can be activated with Enter or Space keys.'
                    }
                ]
            }
        },
        // Alert Examples
        {
            id: 55,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 3,
                text: 'Alert Block'
            }
        },
        {
            id: 56,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Alerts provide contextual feedback messages:'
            }
        },
        {
            id: 57,
            page_id: 1,
            kind: 'alert',
            data: {
                type: 'info',
                title: 'Information',
                message: 'This is an informational alert. Use it to provide helpful context or additional details.'
            }
        },
        {
            id: 58,
            page_id: 1,
            kind: 'alert',
            data: {
                type: 'success',
                title: 'Success!',
                message: 'Your changes have been saved successfully. The article is now live.'
            }
        },
        {
            id: 59,
            page_id: 1,
            kind: 'alert',
            data: {
                type: 'warning',
                title: 'Warning',
                message: 'Please review your content before publishing. Some blocks may need additional configuration.'
            }
        },
        {
            id: 60,
            page_id: 1,
            kind: 'alert',
            data: {
                type: 'error',
                title: 'Error',
                message: 'Failed to save changes. Please check your internet connection and try again.'
            }
        },
        // Table Block Examples
        {
            id: 61,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Data Tables'
            }
        },
        {
            id: 62,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Import data from JSON, CSV, or TSV formats:'
            }
        },
        {
            id: 63,
            page_id: 1,
            kind: 'table',
            data: {
                format: 'json',
                showHeaders: true,
                caption: 'Population Data by City',
                data: JSON.stringify([
                    { "City": "New York", "Population": "8.3M", "Area (km²)": "783" },
                    { "City": "Los Angeles", "Population": "4.0M", "Area (km²)": "1,302" },
                    { "City": "Chicago", "Population": "2.7M", "Area (km²)": "606" },
                    { "City": "Houston", "Population": "2.3M", "Area (km²)": "1,651" }
                ])
            }
        },
        // Timeline Block
        {
            id: 64,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Project Timeline'
            }
        },
        {
            id: 65,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Gantt-style timeline showing project phases. You can either enter data manually or reference a spreadsheet block as the data source:'
            }
        },
        {
            id: 650,
            page_id: 1,
            kind: 'spreadsheet',
            data: {
                title: 'Project Tasks Data',
                showHeaders: true,
                headers: ['task', 'start', 'end', 'category', 'progress'],
                data: [
                    ['Initial Planning', '2025-01-01', '2025-01-15', 'Planning', '100'],
                    ['Core Block Implementation', '2025-01-10', '2025-02-15', 'Development', '100'],
                    ['Advanced Blocks', '2025-02-01', '2025-03-01', 'Development', '90'],
                    ['Testing & Polish', '2025-02-20', '2025-03-15', 'QA', '75'],
                    ['Documentation', '2025-03-01', '2025-03-20', 'Documentation', '50']
                ]
            }
        },
        {
            id: 651,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Timeline using spreadsheet data source (Block #650):'
            }
        },
        {
            id: 652,
            page_id: 1,
            kind: 'timeline',
            data: {
                title: 'Development Timeline (From Spreadsheet)',
                showProgress: true,
                dataSourceBlockId: 650  // Reference to the spreadsheet block above
            }
        },
        {
            id: 653,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Timeline with inline data (traditional approach):'
            }
        },
        {
            id: 66,
            page_id: 1,
            kind: 'timeline',
            data: {
                title: 'Article System Development Timeline (Inline Data)',
                showProgress: true,
                items: [
                    {
                        task: 'Initial Planning',
                        start: '2025-01-01',
                        end: '2025-01-15',
                        category: 'Planning',
                        progress: 100
                    },
                    {
                        task: 'Core Block Implementation',
                        start: '2025-01-10',
                        end: '2025-02-15',
                        category: 'Development',
                        progress: 100
                    },
                    {
                        task: 'Advanced Blocks',
                        start: '2025-02-01',
                        end: '2025-03-01',
                        category: 'Development',
                        progress: 90
                    },
                    {
                        task: 'Testing & Polish',
                        start: '2025-02-20',
                        end: '2025-03-15',
                        category: 'QA',
                        progress: 60
                    },
                    {
                        task: 'Documentation',
                        start: '2025-03-01',
                        end: '2025-03-20',
                        category: 'Documentation',
                        progress: 30
                    }
                ]
            }
        },
        // Definitions
        {
            id: 75,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Terminology'
            }
        },
        {
            id: 76,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Key terms and their definitions:'
            }
        },
        {
            id: 77,
            page_id: 1,
            kind: 'definition',
            data: {
                term: 'Algorithm',
                pronunciation: 'al-guh-ri-thuhm',
                partOfSpeech: 'noun',
                definition: 'A step-by-step procedure or formula for solving a problem or completing a task, especially by a computer.'
            }
        },
        {
            id: 78,
            page_id: 1,
            kind: 'definition',
            data: {
                term: 'Component',
                pronunciation: 'kuhm-poh-nuhnt',
                partOfSpeech: 'noun',
                definition: 'A reusable, self-contained piece of code that encapsulates functionality and can be composed with other components to build complex user interfaces.'
            }
        },
        {
            id: 79,
            page_id: 1,
            kind: 'definition',
            data: {
                term: 'TypeScript',
                partOfSpeech: 'proper noun',
                definition: 'A strongly typed programming language that builds on JavaScript, adding optional static type definitions to catch errors early and improve code quality.'
            }
        },
        {
            id: 80,
            page_id: 1,
            kind: 'glossary',
            data: {
                title: 'Glossary of Terms',
                sortAlphabetically: true
            }
        },
        // References and Footnotes
        {
            id: 67,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Academic Features'
            }
        },
        {
            id: 68,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'Support for academic writing with references and footnotes.'
            }
        },
        {
            id: 69,
            page_id: 1,
            kind: 'reference',
            data: {
                citation: 'Smith, J. (2023). Modern Web Development Practices. Tech Publishers.',
                authors: 'Smith, J.',
                title: 'Modern Web Development Practices',
                year: '2023',
                url: 'https://example.com/modern-web-dev'
            }
        },
        {
            id: 70,
            page_id: 1,
            kind: 'reference',
            data: {
                citation: 'Johnson, A. & Williams, B. (2024). TypeScript for Large Applications. Code Press.',
                authors: 'Johnson, A. & Williams, B.',
                title: 'TypeScript for Large Applications',
                year: '2024',
                doi: '10.1234/typescript.2024'
            }
        },
        {
            id: 71,
            page_id: 1,
            kind: 'footnote',
            data: {
                text: 'This article system was developed using React 18 and TypeScript 5.',
                reference: 'Development Notes'
            }
        },
        {
            id: 72,
            page_id: 1,
            kind: 'footnote',
            data: {
                text: 'Vega-Lite is used for data visualization throughout the system.',
                reference: 'Technical Implementation'
            }
        },
        {
            id: 73,
            page_id: 1,
            kind: 'bibliography',
            data: {
                title: 'References',
                style: 'apa'
            }
        },
        {
            id: 74,
            page_id: 1,
            kind: 'footnotes',
            data: {
                title: 'Notes',
                showDivider: true
            }
        },
        // Mathematical & Interactive Blocks
        {
            id: 81,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Mathematical & Interactive Content'
            }
        },
        {
            id: 82,
            page_id: 1,
            kind: 'theorem',
            data: {
                type: 'theorem',
                number: '1.1',
                title: 'Pythagorean Theorem',
                content: 'In a right triangle, the square of the length of the hypotenuse is equal to the sum of squares of the lengths of the other two sides. Mathematically: a² + b² = c²'
            }
        },
        {
            id: 83,
            page_id: 1,
            kind: 'theorem',
            data: {
                type: 'proof',
                content: 'Consider a right triangle with sides a, b, and hypotenuse c. By constructing a square with side length (a + b), we can arrange four copies of the triangle within it. The remaining area forms a square with side length c, thus proving a² + b² = c².'
            }
        },
        {
            id: 84,
            page_id: 1,
            kind: 'citation',
            data: {
                author: 'Donald Knuth',
                year: '1984',
                page: '42',
                text: 'Premature optimization is the root of all evil in programming.'
            }
        },
        {
            id: 85,
            page_id: 1,
            kind: 'quiz',
            data: {
                question: 'What is the time complexity of binary search on a sorted array?',
                options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
                correctAnswer: 1,
                explanation: 'Binary search divides the search space in half with each step, resulting in O(log n) time complexity.'
            }
        },
        {
            id: 86,
            page_id: 1,
            kind: 'toggle',
            data: {
                title: 'Reveal the solution to the exercise',
                content: 'The solution involves using dynamic programming to cache intermediate results. Start by identifying overlapping subproblems and then build up the solution bottom-up.',
                defaultOpen: false
            }
        },
        // Media & Visual Blocks
        {
            id: 87,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Rich Media Content'
            }
        },
        {
            id: 88,
            page_id: 1,
            kind: 'button',
            data: {
                text: 'View Documentation',
                url: 'https://react.dev',
                variant: 'solid',
                colorScheme: 'blue',
                size: 'md',
                openInNewTab: true
            }
        },
        {
            id: 89,
            page_id: 1,
            kind: 'embed',
            data: {
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                caption: 'Introduction to React Hooks',
                aspectRatio: '16/9'
            }
        },
        {
            id: 90,
            page_id: 1,
            kind: 'gallery',
            data: {
                caption: 'Project Screenshots',
                columns: 3,
                images: [
                    { url: 'https://via.placeholder.com/400x400/3182ce/ffffff?text=Dashboard', alt: 'Dashboard view' },
                    { url: 'https://via.placeholder.com/400x400/059669/ffffff?text=Editor', alt: 'Editor view' },
                    { url: 'https://via.placeholder.com/400x400/dc2626/ffffff?text=Settings', alt: 'Settings view' },
                    { url: 'https://via.placeholder.com/400x400/7c3aed/ffffff?text=Analytics', alt: 'Analytics' },
                    { url: 'https://via.placeholder.com/400x400/ea580c/ffffff?text=Reports', alt: 'Reports' },
                    { url: 'https://via.placeholder.com/400x400/0891b2/ffffff?text=Users', alt: 'User management' }
                ]
            }
        },
        // Code Comparison
        {
            id: 91,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Code Examples & Diffs'
            }
        },
        {
            id: 92,
            page_id: 1,
            kind: 'diff',
            data: {
                filename: 'component.tsx',
                language: 'typescript',
                before: `function MyComponent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}`,
                after: `function MyComponent() {
  const [count, setCount] = useState(0);
  const handleClick = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  return (
    <div>
      <button onClick={handleClick}>
        Clicked {count} times
      </button>
    </div>
  );
}`
            }
        },
        // Developer Tools & Advanced Blocks
        {
            id: 93,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Developer Tools & Technical Blocks'
            }
        },
        {
            id: 94,
            page_id: 1,
            kind: 'cli',
            data: {
                command: 'npm install litegraph.js vega-embed katex',
                output: `added 45 packages in 3.2s\n\n12 packages are looking for funding\n  run \`npm fund\` for details`,
                prompt: '$'
            }
        },
        {
            id: 95,
            page_id: 1,
            kind: 'filetree',
            data: {
                title: 'Project Structure',
                tree: [
                    {
                        name: 'src',
                        type: 'folder',
                        children: [
                            {
                                name: 'components',
                                type: 'folder',
                                children: [
                                    {
                                        name: 'blocks', type: 'folder', children: [
                                            { name: 'GraphBlock.tsx', type: 'file' },
                                            { name: 'LatexBlock.tsx', type: 'file' }
                                        ]
                                    },
                                    { name: 'ArticleViewEditor.tsx', type: 'file' }
                                ]
                            },
                            {
                                name: 'mock',
                                type: 'folder',
                                children: [
                                    { name: 'ArticleMockData.ts', type: 'file' }
                                ]
                            },
                            { name: 'index.tsx', type: 'file' }
                        ]
                    },
                    { name: 'package.json', type: 'file' },
                    { name: 'tsconfig.json', type: 'file' }
                ]
            }
        },
        {
            id: 96,
            page_id: 1,
            kind: 'datastructure',
            data: {
                caption: 'Binary Search Tree',
                type: 'tree',
                data: {
                    value: 50,
                    children: [
                        {
                            value: 30,
                            children: [
                                { value: 20 },
                                { value: 40 }
                            ]
                        },
                        {
                            value: 70,
                            children: [
                                { value: 60 },
                                { value: 80 }
                            ]
                        }
                    ]
                }
            }
        },
        {
            id: 97,
            page_id: 1,
            kind: 'trace',
            data: {
                caption: 'Fibonacci Execution Trace',
                steps: [
                    { timestamp: 0, function: 'fibonacci(5)', type: 'call', variables: { n: 5 } },
                    { timestamp: 1, function: 'fibonacci(4)', type: 'call', variables: { n: 4 } },
                    { timestamp: 2, function: 'fibonacci(3)', type: 'call', variables: { n: 3 } },
                    { timestamp: 3, function: 'fibonacci(2)', type: 'call', variables: { n: 2 } },
                    { timestamp: 4, function: 'fibonacci(2)', type: 'return', message: 'returns 1' },
                    { timestamp: 5, function: 'fibonacci(3)', type: 'return', message: 'returns 2' },
                    { timestamp: 6, function: 'fibonacci(4)', type: 'return', message: 'returns 3' },
                    { timestamp: 7, function: 'fibonacci(5)', type: 'return', message: 'returns 5' }
                ]
            }
        },
        {
            id: 98,
            page_id: 1,
            kind: 'ast',
            data: {
                caption: 'Abstract Syntax Tree Example',
                sourceCode: 'const sum = a + b;',
                ast: {
                    type: 'VariableDeclaration',
                    children: [
                        {
                            type: 'VariableDeclarator',
                            children: [
                                { type: 'Identifier', value: 'sum' },
                                {
                                    type: 'BinaryExpression',
                                    attributes: { operator: '+' },
                                    children: [
                                        { type: 'Identifier', value: 'a' },
                                        { type: 'Identifier', value: 'b' }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        },
        {
            id: 99,
            page_id: 1,
            kind: 'bnf',
            data: {
                caption: 'Simple Expression Grammar',
                notation: 'bnf',
                rules: [
                    { name: 'expression', definition: '<term> | <term> + <expression>' },
                    { name: 'term', definition: '<factor> | <factor> * <term>' },
                    { name: 'factor', definition: '<number> | ( <expression> )' },
                    { name: 'number', definition: '0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9' }
                ]
            }
        },
        // Interactive & Forms
        {
            id: 100,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Interactive Elements'
            }
        },
        {
            id: 101,
            page_id: 1,
            kind: 'form',
            data: {
                title: 'Contact Form',
                fields: [
                    { id: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Your name' },
                    { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'your@email.com' },
                    { id: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Your message...' },
                    { id: 'newsletter', label: 'Subscribe to newsletter', type: 'checkbox', required: false }
                ],
                submitText: 'Send Message',
                submitUrl: '/api/contact'
            }
        },
        {
            id: 102,
            page_id: 1,
            kind: 'sandbox',
            data: {
                caption: 'Live JavaScript Execution',
                language: 'javascript',
                code: `// Try editing and running this code
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log('Sum:', sum);

const doubled = numbers.map(n => n * 2);
console.log('Doubled:', doubled);

doubled`
            }
        },
        {
            id: 103,
            page_id: 1,
            kind: 'graph',
            data: {
                caption: 'Visual Programming Example',
                height: 400,
                theme: 'dark',
                graph: {
                    nodes: [
                        { id: 0, type: 'basic/const', pos: [100, 150], properties: { value: 5 }, title: 'Input A' },
                        { id: 1, type: 'basic/const', pos: [100, 250], properties: { value: 3 }, title: 'Input B' },
                        { id: 2, type: 'math/operation', pos: [350, 200], properties: { op: '+' }, title: 'Add' },
                        { id: 3, type: 'basic/watch', pos: [600, 200], title: 'Result' }
                    ],
                    links: [
                        { origin_id: 0, origin_slot: 0, target_id: 2, target_slot: 0 },
                        { origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 1 },
                        { origin_id: 2, origin_slot: 0, target_id: 3, target_slot: 0 }
                    ]
                }
            }
        },
        {
            id: 112,
            page_id: 1,
            kind: 'blockly',
            data: {
                caption: 'Blockly Visual Programming',
                height: 450,
                language: 'JavaScript',
                blocks: {
                    blocks: {
                        languageVersion: 0,
                        blocks: [
                            {
                                type: 'variables_set',
                                x: 50,
                                y: 50,
                                fields: {
                                    VAR: { id: 'var1' }
                                },
                                inputs: {
                                    VALUE: {
                                        block: {
                                            type: 'math_number',
                                            fields: {
                                                NUM: 10
                                            }
                                        }
                                    }
                                }
                            },
                            {
                                type: 'controls_repeat_ext',
                                x: 50,
                                y: 150,
                                inputs: {
                                    TIMES: {
                                        block: {
                                            type: 'variables_get',
                                            fields: {
                                                VAR: { id: 'var1' }
                                            }
                                        }
                                    },
                                    DO: {
                                        block: {
                                            type: 'text_print',
                                            inputs: {
                                                TEXT: {
                                                    block: {
                                                        type: 'text',
                                                        fields: {
                                                            TEXT: 'Hello Blockly!'
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    variables: [
                        {
                            name: 'count',
                            id: 'var1'
                        }
                    ]
                }
            }
        },
        {
            id: 104,
            page_id: 1,
            kind: 'electrical',
            data: {
                title: 'LED Circuit with Current Limiting Resistor',
                width: 600,
                height: 350,
                components: [
                    { id: 'V1', type: 'battery', value: '9V', x: 100, y: 200, rotation: 90 },
                    { id: 'R1', type: 'resistor', value: '470Ω', x: 250, y: 100, rotation: 0 },
                    { id: 'LED1', type: 'led', value: 'Red LED', x: 400, y: 100, rotation: 0 },
                    { id: 'GND', type: 'ground', value: '', x: 500, y: 200, rotation: 0 }
                ],
                wires: [
                    { points: [[100, 160], [100, 100], [210, 100]] },
                    { points: [[290, 100], [360, 100]] },
                    { points: [[440, 100], [500, 100], [500, 180]] },
                    { points: [[100, 240], [100, 280], [500, 280], [500, 220]] }
                ]
            }
        },
        {
            id: 105,
            page_id: 1,
            kind: 'drawing',
            data: {
                title: 'Quick Sketch: System Architecture',
                width: 600,
                height: 400,
                backgroundColor: '#f9fafb',
                defaultColor: '#000000',
                defaultLineWidth: 2,
                imageData: ''
            }
        },
        // Engineering & Process Blocks
        {
            id: 106,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Engineering & Process Visualization'
            }
        },
        {
            id: 107,
            page_id: 1,
            kind: 'workflow',
            data: {
                caption: 'User Authentication Flow',
                layout: 'vertical',
                nodes: [
                    { id: '1', type: 'start', label: 'Start' },
                    { id: '2', type: 'task', label: 'Receive Credentials' },
                    { id: '3', type: 'decision', label: 'Valid?' },
                    { id: '4', type: 'task', label: 'Grant Access' },
                    { id: '5', type: 'end', label: 'End' }
                ]
            }
        },
        {
            id: 108,
            page_id: 1,
            kind: 'constraint',
            data: {
                caption: 'System Design Constraints',
                context: { voltage: 12, current: 2.5, temp: 75, load: 85 },
                constraints: [
                    {
                        name: 'Voltage Range',
                        expression: '10 ≤ voltage ≤ 15',
                        satisfied: true,
                        description: 'Operating voltage must be between 10V and 15V'
                    },
                    {
                        name: 'Current Limit',
                        expression: 'current ≤ 3.0',
                        satisfied: true,
                        description: 'Maximum current draw is 3.0A'
                    },
                    {
                        name: 'Temperature Range',
                        expression: 'temp ≤ 85',
                        satisfied: true,
                        description: 'Operating temperature must not exceed 85°C'
                    },
                    {
                        name: 'Load Capacity',
                        expression: 'load ≤ 90',
                        satisfied: true,
                        description: 'System load should not exceed 90%'
                    }
                ]
            }
        },
        // Media Blocks
        {
            id: 110,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Rich Media & Presentations'
            }
        },
        {
            id: 111,
            page_id: 1,
            kind: 'slideshow',
            data: {
                autoPlay: false,
                interval: 3000,
                showDots: true,
                slides: [
                    { url: 'https://via.placeholder.com/800x450/667eea/ffffff?text=Slide+1:+Introduction', caption: 'Introduction to our platform' },
                    { url: 'https://via.placeholder.com/800x450/764ba2/ffffff?text=Slide+2:+Features', caption: 'Key features overview' },
                    { url: 'https://via.placeholder.com/800x450/f093fb/ffffff?text=Slide+3:+Architecture', caption: 'System architecture' },
                    { url: 'https://via.placeholder.com/800x450/4facfe/ffffff?text=Slide+4:+Performance', caption: 'Performance metrics' }
                ]
            }
        },
        {
            id: 1100,
            page_id: 1,
            kind: 'animation',
            data: {
                type: 'gif',
                url: 'https://via.placeholder.com/400x300/ff6b6b/ffffff?text=Animation',
                caption: 'Loading animation example',
                width: '400px',
                height: 'auto',
                loop: true,
                autoplay: true
            }
        },
        {
            id: 113,
            page_id: 1,
            kind: 'iframe',
            data: {
                url: 'https://www.example.com',
                caption: 'Embedded Website',
                height: 400,
                allowFullscreen: true
            }
        },
        {
            id: 114,
            page_id: 1,
            kind: 'model3d',
            data: {
                url: 'https://example.com/model.glb',
                caption: '3D Product Model',
                height: 400,
                autoRotate: true
            }
        },
        // Conclusion
        {
            id: 40,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 2,
                text: 'Summary'
            }
        },
        {
            id: 41,
            page_id: 1,
            kind: 'paragraph',
            data: {
                text: 'This comprehensive example demonstrates 53+ block types including Blockly visual programming, LiteGraph node graphs, electrical circuit diagrams, freehand drawing canvases, interactive forms, live code execution, data structures (trees, stacks, arrays), execution traces, AST visualization, BNF grammars, workflow diagrams, engineering constraints, CLI commands, file trees, iframes, slideshows, animations, 3D models, and much more. Plus all the essentials: data tables, timelines, spreadsheets, Vega plots, accordions, alerts, definitions with auto-generated glossary, academic references, footnotes, theorems & proofs, citations, quizzes, code diffs, embeds, galleries, and interactive elements. You can edit any block by clicking the gear icon, add nested content with the plus icon, and drag blocks to reorder them. Toggle readonly mode to switch between viewing and editing.'
            }
        },
        // Final list summarizing features
        {
            id: 42,
            page_id: 1,
            kind: 'heading',
            data: {
                level: 3,
                text: 'Key Features'
            }
        },
        {
            id: 43,
            page_id: 1,
            kind: 'list',
            data: {
                ordered: false,
                items: [
                    '51 different block types',
                    'Blockly visual programming (Google Blockly)',
                    'Visual node-based programming with LiteGraph.js',
                    'Interactive forms with validation',
                    'Live code execution sandbox',
                    'Data structure visualization (trees, stacks, arrays, linked lists)',
                    'Execution trace & debug timeline',
                    'AST (Abstract Syntax Tree) visualization',
                    'BNF/EBNF grammar definitions',
                    'BPMN-style workflow diagrams',
                    'Engineering constraint validation',
                    'CLI command blocks with copy-to-clipboard',
                    'Interactive file tree explorer',
                    'Iframe embeds & 3D model viewers',
                    'Slideshow presentations with auto-play',
                    'GIF/video animations',
                    'Mathematical content (theorems, proofs, LaTeX)',
                    'Interactive quizzes with instant feedback',
                    'Code diffs & Monaco Editor with IntelliSense',
                    'Media embeds (YouTube, Vimeo, CodePen)',
                    'Image galleries with lightbox',
                    'Interactive spreadsheet tables & Vega plots',
                    'Auto-generated TOC, glossary, bibliography, footnotes',
                    'Collapsible accordions & toggle sections',
                    'Contextual alerts & citations',
                    'Gantt-style timelines',
                    'Inline contenteditable for text blocks',
                    'Settings modal for advanced editing',
                    'Drag-and-drop reordering',
                    'Nested blocks and layouts',
                    'Type-safe TypeScript implementation',
                    'Modular and extensible architecture'
                ]
            }
        }
    ]
};

// Export as default
export const mockArticles = {
    comprehensive: comprehensiveArticle
};

export default mockArticles;
