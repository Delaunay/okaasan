import { ArticleBlock, ArticleBlockKind } from '../../ui/src/services/type';

/**
 * Check if a block type is text-based and can be edited as text
 */
export function isTextBasedBlock(kind: ArticleBlockKind | string | undefined): boolean {
    const textBasedKinds: ArticleBlockKind[] = [
        'paragraph',
        'heading',
        'text',
        'code',
        'latex',
        'mermaid',
        'list'
    ];
    return textBasedKinds.includes(kind as ArticleBlockKind);
}

/**
 * Convert a block to its text representation
 * Format: \p text, \h1 heading, \code language code, etc.
 */
export function blockToText(block: ArticleBlock): string {
    if (!block.kind) return '';

    switch (block.kind) {
        case 'paragraph':
            return `\\p ${block.data?.text || ''}`;

        case 'heading':
            const level = block.data?.level || 1;
            return `\\h${level} ${block.data?.text || ''}`;

        case 'text':
            return `\\t ${block.data?.content || ''}`;

        case 'code':
            const language = block.data?.language || 'javascript';
            const code = block.data?.code || '';
            return `\\code ${language}\n${code}`;

        case 'latex':
            return `\\latex ${block.data?.formula || ''}`;

        case 'mermaid':
            return `\\mermaid ${block.data?.diagram || ''}`;

        case 'list':
            const ordered = block.data?.ordered || false;
            const items = block.data?.items || [];
            const prefix = ordered ? '\\list ordered' : '\\list unordered';
            return `${prefix}\n${items.join('\n')}`;

        default:
            return '';
    }
}

/**
 * Parse text representation back to a block
 * Returns null if parsing fails
 */
export function textToBlock(text: string, existingBlock?: ArticleBlock): ArticleBlock | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Match block type pattern: \type ... or \type\n...
    const match = trimmed.match(/^\\([a-z0-9]+)(?:\s+(.+))?$/s);
    if (!match) return null;

    const [, type, content = ''] = match;
    const contentTrimmed = content.trim();

    // Create base block structure
    const baseBlock: ArticleBlock = {
        ...existingBlock,
        id: existingBlock?.id || Date.now() + Math.random(),
        kind: existingBlock?.kind,
        data: existingBlock?.data || {},
        children: existingBlock?.children || []
    };

    switch (type) {
        case 'p':
            return {
                ...baseBlock,
                kind: 'paragraph',
                data: {
                    ...baseBlock.data,
                    text: contentTrimmed
                }
            };

        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
            const level = parseInt(type.substring(1), 10);
            return {
                ...baseBlock,
                kind: 'heading',
                data: {
                    ...baseBlock.data,
                    level,
                    text: contentTrimmed
                }
            };

        case 't':
            return {
                ...baseBlock,
                kind: 'text',
                data: {
                    ...baseBlock.data,
                    content: contentTrimmed
                }
            };

        case 'code': {
            // Code format: \code language\ncode content
            const lines = contentTrimmed.split('\n');
            const language = lines[0] || 'javascript';
            const code = lines.slice(1).join('\n');
            return {
                ...baseBlock,
                kind: 'code',
                data: {
                    ...baseBlock.data,
                    language,
                    code
                }
            };
        }

        case 'latex':
            return {
                ...baseBlock,
                kind: 'latex',
                data: {
                    ...baseBlock.data,
                    formula: contentTrimmed
                }
            };

        case 'mermaid':
            return {
                ...baseBlock,
                kind: 'mermaid',
                data: {
                    ...baseBlock.data,
                    diagram: contentTrimmed
                }
            };

        case 'list': {
            // List format: \list ordered\nitem1\nitem2 or \list unordered\nitem1\nitem2
            const lines = contentTrimmed.split('\n');
            const firstLine = lines[0] || '';
            const ordered = firstLine === 'ordered';
            const items = firstLine === 'ordered' || firstLine === 'unordered'
                ? lines.slice(1).filter(item => item.trim())
                : lines.filter(item => item.trim());

            return {
                ...baseBlock,
                kind: 'list',
                data: {
                    ...baseBlock.data,
                    ordered,
                    items: items.length > 0 ? items : ['']
                }
            };
        }

        default:
            return null;
    }
}

/**
 * Modification action types
 */
export type ModificationAction =
    | { action: 'delete'; id: number }
    | { action: 'update'; id: number; data: Partial<ArticleBlock> };








