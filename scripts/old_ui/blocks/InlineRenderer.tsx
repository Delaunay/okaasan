import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { InlineBlock } from './InlineParser';

interface InlineRendererProps {
    block: InlineBlock;
}

/**
 * Render a single inline block
 */
export const InlineRenderer: React.FC<InlineRendererProps> = ({ block }) => {
    switch (block.kind) {
        case 'text':
            return <>{block.text}</>;

        case 'latex':
            return <InlineLatex formula={block.formula || ''} />;

        case 'link':
            return (
                <a
                    href={block.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: 'var(--chakra-colors-blue-500)',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                    }}
                >
                    {block.text}
                </a>
            );

        case 'emphasis':
            return <InlineEmphasis style={block.style} text={block.text || ''} />;

        case 'code':
            return (
                <code
                    style={{
                        backgroundColor: 'var(--chakra-colors-gray-50)',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontFamily: 'monospace',
                        fontSize: '0.9em',
                        border: '1px solid var(--chakra-colors-border)'
                    }}
                >
                    {block.text}
                </code>
            );

        default:
            return <>{block.text}</>;
    }
};

/**
 * Render inline LaTeX formula
 */
const InlineLatex: React.FC<{ formula: string }> = ({ formula }) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const renderLatex = async () => {
            try {
                const katex = await import('katex');
                if (containerRef.current) {
                    katex.default.render(formula, containerRef.current, {
                        throwOnError: false,
                        displayMode: false // inline mode
                    });
                }
            } catch (err) {
                console.error('KaTeX error:', err);
                setError(true);
            }
        };

        renderLatex();
    }, [formula]);

    if (error) {
        return <Text as="span" color="red.500" fontSize="sm">[LaTeX Error]</Text>;
    }

    return (
        <span
            ref={containerRef}
            style={{
                display: 'inline',
                verticalAlign: 'middle'
            }}
        />
    );
};

/**
 * Render emphasis (bold, italic, underline, strikethrough)
 */
const InlineEmphasis: React.FC<{ style?: 'bold' | 'italic' | 'underline' | 'strikethrough'; text: string }> = ({ style, text }) => {
    const styles: React.CSSProperties = {};

    switch (style) {
        case 'bold':
            styles.fontWeight = 'bold';
            break;
        case 'italic':
            styles.fontStyle = 'italic';
            break;
        case 'underline':
            styles.textDecoration = 'underline';
            break;
        case 'strikethrough':
            styles.textDecoration = 'line-through';
            break;
    }

    return <span style={styles}>{text}</span>;
};

/**
 * Render an array of inline blocks
 */
export const InlineBlocksRenderer: React.FC<{ blocks: InlineBlock[] }> = ({ blocks }) => {
    return (
        <>
            {blocks.map((block, index) => (
                <InlineRenderer key={index} block={block} />
            ))}
        </>
    );
};


