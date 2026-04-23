import React, { useState } from 'react';
import { Box, Button, Textarea, VStack, HStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock, ArticleBlockKind } from '../../ui/src/services/type';

/**
 * Parse markdown text and convert it to article blocks
 */
const parseMarkdownToBlocks = (markdown: string): ArticleBlock[] => {
    const blocks: ArticleBlock[] = [];
    const lines = markdown.split('\n');
    let currentParagraph: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeLanguage = '';

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            const text = currentParagraph.join('\n').trim();
            if (text) {
                blocks.push({
                    id: Date.now() + Math.random(),
                    kind: 'paragraph',
                    data: { text },
                    children: []
                });
            }
            currentParagraph = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Code block detection
        if (trimmedLine.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                flushParagraph();
                blocks.push({
                    id: Date.now() + Math.random(),
                    kind: 'code',
                    data: {
                        code: codeBlockContent.join('\n'),
                        language: codeLanguage || 'plaintext'
                    },
                    children: []
                });
                codeBlockContent = [];
                codeLanguage = '';
                inCodeBlock = false;
            } else {
                // Start code block
                flushParagraph();
                codeLanguage = trimmedLine.substring(3).trim();
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Heading detection (# ## ### etc)
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            const level = headingMatch[1].length;
            const text = headingMatch[2];
            blocks.push({
                id: Date.now() + Math.random(),
                kind: 'heading',
                data: { text, level },
                children: []
            });
            continue;
        }

        // List item detection (- or * or numbered)
        const unorderedListMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
        const orderedListMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);

        if (unorderedListMatch || orderedListMatch) {
            flushParagraph();
            const text = (unorderedListMatch || orderedListMatch)![1];
            const isOrdered = !!orderedListMatch;

            // Check if we should add to existing list or create new one
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock && lastBlock.kind === 'list' && lastBlock.data?.ordered === isOrdered) {
                // Add to existing list
                lastBlock.data.items.push(text);
            } else {
                // Create new list
                blocks.push({
                    id: Date.now() + Math.random(),
                    kind: 'list',
                    data: {
                        items: [text],
                        ordered: isOrdered
                    },
                    children: []
                });
            }
            continue;
        }

        // Quote detection (>)
        if (line.startsWith('>')) {
            flushParagraph();
            const text = line.substring(1).trim();
            blocks.push({
                id: Date.now() + Math.random(),
                kind: 'quote',
                data: { text },
                children: []
            });
            continue;
        }

        // Horizontal rule (---, ***, ___)
        if (/^[-*_]{3,}$/.test(trimmedLine)) {
            flushParagraph();
            blocks.push({
                id: Date.now() + Math.random(),
                kind: 'divider',
                data: {},
                children: []
            });
            continue;
        }

        // Empty line - flush paragraph
        if (!trimmedLine) {
            flushParagraph();
            continue;
        }

        // Regular text - add to paragraph
        currentParagraph.push(line);
    }

    // Flush any remaining paragraph
    flushParagraph();

    // Close any unclosed code block
    if (inCodeBlock) {
        blocks.push({
            id: Date.now() + Math.random(),
            kind: 'code',
            data: {
                code: codeBlockContent.join('\n'),
                language: codeLanguage || 'plaintext'
            },
            children: []
        });
    }

    return blocks;
};

export const MarkdownEditorBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const content = block.data?.markdown || '';

    return (
        <Box
            p={4}
            bg="yellow.50"
            borderRadius="md"
            borderWidth="2px"
            borderColor="yellow.300"
            borderStyle="dashed"
        >
            <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight="600" color="yellow.800">
                        📝 Markdown Content (Read-Only View)
                    </Text>
                </HStack>
                <Box
                    p={3}
                    bg="bg"
                    borderRadius="md"
                    fontFamily="monospace"
                    fontSize="sm"
                    whiteSpace="pre-wrap"
                    maxH="400px"
                    overflowY="auto"
                >
                    {content || '(Empty)'}
                </Box>
            </VStack>
        </Box>
    );
};

export { parseMarkdownToBlocks };




