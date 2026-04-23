import React, { useState, useRef, KeyboardEvent } from 'react';
import { Box, Textarea, Text, VStack } from '@chakra-ui/react';
import { ArticleBlock, ArticleBlockKind } from '../services/type';

interface QuickInputAreaProps {
    onAddBlock: (block: ArticleBlock) => void;
}

/**
 * QuickInputArea - A text area at the end of an article that allows users
 * to quickly create blocks using markdown-like commands.
 *
 * Commands:
 * - # Text -> Heading (level 1)
 * - ## Text -> Heading (level 2)
 * - ### Text -> Heading (level 3)
 * - * Text -> List item (unordered)
 * - - Text -> List item (unordered)
 * - 1. Text -> List item (ordered)
 * - ``` -> Code block
 * - > Text -> Quote/Alert
 * - --- -> Divider
 * - [] Text -> Todo item (list)
 * - [x] Text -> Completed todo item (list)
 * - Plain text -> Paragraph
 */
const QuickInputArea: React.FC<QuickInputAreaProps> = ({ onAddBlock }) => {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const parseCommand = (line: string): { block: ArticleBlock | null; remainingText: string } => {
        const trimmedLine = line.trimStart();
        const leadingSpaces = line.length - trimmedLine.length;

        // Heading patterns
        const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'heading' as ArticleBlockKind,
                    data: { level, text },
                    children: []
                },
                remainingText: ''
            };
        }

        // Unordered list patterns (* or -)
        const unorderedListMatch = trimmedLine.match(/^[*-]\s+(.+)$/);
        if (unorderedListMatch) {
            const text = unorderedListMatch[1].trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'list' as ArticleBlockKind,
                    data: { items: [text], ordered: false },
                    children: []
                },
                remainingText: ''
            };
        }

        // Ordered list pattern (1. 2. etc)
        const orderedListMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
        if (orderedListMatch) {
            const text = orderedListMatch[2].trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'list' as ArticleBlockKind,
                    data: { items: [text], ordered: true },
                    children: []
                },
                remainingText: ''
            };
        }

        // Todo list patterns
        const todoMatch = trimmedLine.match(/^\[([ x])\]\s+(.+)$/i);
        if (todoMatch) {
            const completed = todoMatch[1].toLowerCase() === 'x';
            const text = todoMatch[2].trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'list' as ArticleBlockKind,
                    data: {
                        items: [text],
                        ordered: false,
                        checkboxes: true,
                        checkedItems: completed ? [0] : []
                    },
                    children: []
                },
                remainingText: ''
            };
        }

        // Code block pattern (```)
        if (trimmedLine === '```' || trimmedLine.startsWith('```')) {
            const languageMatch = trimmedLine.match(/^```(\w+)?$/);
            const language = languageMatch ? (languageMatch[1] || 'javascript') : 'javascript';
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'code' as ArticleBlockKind,
                    data: { language, code: '' },
                    children: []
                },
                remainingText: ''
            };
        }

        // Quote/Alert pattern (>)
        const quoteMatch = trimmedLine.match(/^>\s+(.+)$/);
        if (quoteMatch) {
            const text = quoteMatch[1].trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'alert' as ArticleBlockKind,
                    data: { type: 'info', title: '', content: text },
                    children: []
                },
                remainingText: ''
            };
        }

        // Horizontal rule pattern (---)
        if (trimmedLine === '---' || trimmedLine === '___' || trimmedLine === '***') {
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'paragraph' as ArticleBlockKind,
                    data: { text: '---' }, // We'll render this as a divider
                    children: []
                },
                remainingText: ''
            };
        }

        // LaTeX pattern ($$ or \[)
        if (trimmedLine.startsWith('$$') || trimmedLine.startsWith('\\[')) {
            const formula = trimmedLine.replace(/^\$\$|\\\[/, '').replace(/\$\$|\\\]$/, '').trim();
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'latex' as ArticleBlockKind,
                    data: { formula: formula || 'E = mc^2' },
                    children: []
                },
                remainingText: ''
            };
        }

        // Default: Plain text becomes a paragraph
        if (trimmedLine) {
            return {
                block: {
                    id: Date.now() + Math.random(),
                    kind: 'paragraph' as ArticleBlockKind,
                    data: { text: trimmedLine },
                    children: []
                },
                remainingText: ''
            };
        }

        return { block: null, remainingText: '' };
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();

            const textarea = textareaRef.current;
            if (!textarea) return;

            // Get the current line (up to cursor position)
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = value.substring(0, cursorPos);
            const textAfterCursor = value.substring(cursorPos);

            // Find the current line
            const lines = textBeforeCursor.split('\n');
            const currentLine = lines[lines.length - 1];

            // Parse the command
            const { block, remainingText } = parseCommand(currentLine);

            if (block) {
                // Add the block
                onAddBlock(block);

                // Remove the processed line from the textarea
                const linesBeforeCurrent = lines.slice(0, -1);
                const newValue = [...linesBeforeCurrent, remainingText, ...textAfterCursor.split('\n')].join('\n');
                setValue(newValue.trim());

                // Focus back to the textarea
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(0, 0);
                }, 0);
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
    };

    return (
        <VStack align="stretch" gap={2} width="100%">
            <Box
                borderWidth="2px"
                borderColor="green.300"
                borderRadius="md"
                borderStyle="dashed"
                p={4}
                bg="green.50"
                _hover={{ borderColor: 'green.400', bg: 'green.100' }}
                transition="all 0.2s"
            >
                <VStack align="stretch" gap={2}>
                    <Text fontSize="sm" fontWeight="bold" color="green.700">
                        ⚡ Quick Add (Press Enter to create block)
                    </Text>
                    <Textarea
                        ref={textareaRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type here to quickly add blocks...
# Heading
* List item
- Another list item
1. Numbered item
[] Todo item
[x] Done item
``` Code block
> Quote or alert
--- Horizontal rule
$$ LaTeX formula
Plain text for paragraph"
                        minHeight="100px"
                        bg="bg"
                        borderColor="green.200"
                        _focus={{ borderColor: 'green.400', boxShadow: '0 0 0 1px var(--chakra-colors-green-400)' }}
                        fontFamily="monospace"
                        fontSize="sm"
                    />
                    <Text fontSize="xs" color="gray.600">
                        💡 Use markdown-like commands and press <strong>Enter</strong> to create blocks.
                        Press <strong>Shift+Enter</strong> for a new line without creating a block.
                    </Text>
                </VStack>
            </Box>
        </VStack>
    );
};

export default QuickInputArea;


