/**
 * Inline block parser and serializer
 * Converts between markdown-style syntax and structured inline blocks
 */

export interface InlineBlock {
    kind: 'text' | 'latex' | 'link' | 'emphasis' | 'code';
    text?: string;
    formula?: string;
    url?: string;
    style?: 'bold' | 'italic' | 'underline' | 'strikethrough';
}

/**
 * Parse markdown-style text into inline blocks
 * Supports:
 * - $formula$ - inline LaTeX
 * - [text](url) - links
 * - **text** - bold
 * - *text* - italic
 * - __text__ - underline
 * - ~~text~~ - strikethrough
 * - `code` - inline code
 */
export function parseInlineBlocks(text: string): InlineBlock[] {
    const blocks: InlineBlock[] = [];
    let currentPos = 0;

    // Pattern matching for different inline types
    // Order matters - more specific patterns first
    const patterns = [
        // LaTeX: $formula$
        { regex: /\$([^$]+)\$/g, handler: (match: RegExpMatchArray) => ({ kind: 'latex' as const, formula: match[1] }) },
        // Links: [text](url)
        { regex: /\[([^\]]+)\]\(([^)]+)\)/g, handler: (match: RegExpMatchArray) => ({ kind: 'link' as const, text: match[1], url: match[2] }) },
        // Bold: **text**
        { regex: /\*\*([^*]+)\*\*/g, handler: (match: RegExpMatchArray) => ({ kind: 'emphasis' as const, style: 'bold' as const, text: match[1] }) },
        // Italic: *text*
        { regex: /\*([^*]+)\*/g, handler: (match: RegExpMatchArray) => ({ kind: 'emphasis' as const, style: 'italic' as const, text: match[1] }) },
        // Underline: __text__
        { regex: /__([^_]+)__/g, handler: (match: RegExpMatchArray) => ({ kind: 'emphasis' as const, style: 'underline' as const, text: match[1] }) },
        // Strikethrough: ~~text~~
        { regex: /~~([^~]+)~~/g, handler: (match: RegExpMatchArray) => ({ kind: 'emphasis' as const, style: 'strikethrough' as const, text: match[1] }) },
        // Inline code: `code`
        { regex: /`([^`]+)`/g, handler: (match: RegExpMatchArray) => ({ kind: 'code' as const, text: match[1] }) }
    ];

    // Find all matches with their positions
    const matches: { start: number; end: number; block: InlineBlock }[] = [];

    for (const pattern of patterns) {
        const regex = new RegExp(pattern.regex.source, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                block: pattern.handler(match)
            });
        }
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Build inline blocks, removing overlaps (first match wins)
    let lastEnd = 0;
    for (const match of matches) {
        // Skip overlapping matches
        if (match.start < lastEnd) continue;

        // Add text before this match
        if (match.start > lastEnd) {
            const plainText = text.substring(lastEnd, match.start);
            if (plainText) {
                blocks.push({ kind: 'text', text: plainText });
            }
        }

        // Add the matched block
        blocks.push(match.block);
        lastEnd = match.end;
    }

    // Add remaining text
    if (lastEnd < text.length) {
        const plainText = text.substring(lastEnd);
        if (plainText) {
            blocks.push({ kind: 'text', text: plainText });
        }
    }

    // If no patterns matched, return the whole text as a single text block
    if (blocks.length === 0 && text) {
        blocks.push({ kind: 'text', text });
    }

    return blocks;
}

/**
 * Serialize inline blocks back to markdown-style text
 */
export function serializeInlineBlocks(blocks: InlineBlock[]): string {
    return blocks.map(block => {
        switch (block.kind) {
            case 'text':
                return block.text || '';
            case 'latex':
                return `$${block.formula || ''}$`;
            case 'link':
                return `[${block.text || ''}](${block.url || ''})`;
            case 'emphasis':
                switch (block.style) {
                    case 'bold':
                        return `**${block.text || ''}**`;
                    case 'italic':
                        return `*${block.text || ''}*`;
                    case 'underline':
                        return `__${block.text || ''}__`;
                    case 'strikethrough':
                        return `~~${block.text || ''}~~`;
                    default:
                        return block.text || '';
                }
            case 'code':
                return `\`${block.text || ''}\``;
            default:
                return '';
        }
    }).join('');
}

/**
 * Check if text contains any inline markup
 */
export function hasInlineMarkup(text: string): boolean {
    const patterns = [
        /\$[^$]+\$/,           // LaTeX
        /\[[^\]]+\]\([^)]+\)/, // Links
        /\*\*[^*]+\*\*/,       // Bold
        /\*[^*]+\*/,           // Italic
        /__[^_]+__/,           // Underline
        /~~[^~]+~~/,           // Strikethrough
        /`[^`]+`/              // Code
    ];
    return patterns.some(pattern => pattern.test(text));
}


