import React, { useState, useEffect } from 'react';
import { Box, Button, Textarea, VStack, HStack, Text, Badge } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';
import { parseMarkdownToBlocks } from './MarkdownEditorBlock';

export const MarkdownEditorBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const [markdown, setMarkdown] = useState(block.data?.markdown || '');
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        setMarkdown(block.data?.markdown || '');
    }, [block.data?.markdown]);

    const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setMarkdown(e.target.value);
        // Update the block data, but don't convert yet
        if (onChange) {
            onChange({
                ...block,
                data: { ...block.data, markdown: e.target.value }
            });
        }
    };

    const handleConvertToBlocks = () => {
        if (!markdown.trim()) {
            return;
        }

        const parsedBlocks = parseMarkdownToBlocks(markdown);

        // Signal to parent that we want to replace this block with parsed blocks
        // We'll use a special flag in the extension field
        if (onChange) {
            onChange({
                ...block,
                extension: {
                    ...block.extension,
                    _replaceWithBlocks: parsedBlocks
                }
            });
        }
    };

    const getLineCount = () => {
        return markdown.split('\n').length;
    };

    const getWordCount = () => {
        return markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    };

    return (
        <Box
            p={4}
            bg="yellow.50"
            borderRadius="md"
            borderWidth="2px"
            borderColor="yellow.400"
            borderStyle="dashed"
        >
            <VStack align="stretch" gap={3}>
                <HStack justify="space-between" flexWrap="wrap">
                    <HStack gap={2}>
                        <Text fontSize="sm" fontWeight="600" color="yellow.800">
                            📝 Markdown Editor
                        </Text>
                        <Badge colorScheme="yellow" fontSize="xs">
                            {getWordCount()} words · {getLineCount()} lines
                        </Badge>
                    </HStack>
                    <HStack gap={2}>
                        <Button
                            size="xs"
                            variant="outline"
                            colorScheme="yellow"
                            onClick={() => setShowPreview(!showPreview)}
                        >
                            {showPreview ? 'Hide' : 'Show'} Preview
                        </Button>
                        <Button
                            size="sm"
                            colorScheme="green"
                            onClick={handleConvertToBlocks}
                            isDisabled={!markdown.trim()}
                        >
                            ✨ Convert to Blocks
                        </Button>
                    </HStack>
                </HStack>

                <Textarea
                    value={markdown}
                    onChange={handleMarkdownChange}
                    placeholder={`Write in markdown format...

# Heading 1
## Heading 2

Regular paragraph text.

- List item 1
- List item 2

1. Numbered item
2. Another item

> Quote text

\`\`\`javascript
code here
\`\`\`

---

**Bold** and *italic* formatting coming soon!`}
                    rows={15}
                    fontFamily="monospace"
                    fontSize="sm"
                    bg="bg"
                    borderColor="yellow.300"
                    _focus={{
                        borderColor: 'yellow.500',
                        boxShadow: '0 0 0 1px var(--chakra-colors-yellow-500)'
                    }}
                />

                {showPreview && markdown && (
                    <Box
                        p={4}
                        bg="bg"
                        borderRadius="md"
                        borderWidth="1px"
                        borderColor="gray.200"
                    >
                        <Text fontSize="xs" fontWeight="600" color="gray.600" mb={2}>
                            PREVIEW (How it will be parsed):
                        </Text>
                        <VStack align="stretch" gap={2} fontSize="sm">
                            {parseMarkdownToBlocks(markdown).map((b, idx) => (
                                <Box key={idx} p={2} bg="gray.50" borderRadius="sm">
                                    <Badge colorScheme="blue" fontSize="xs" mb={1}>
                                        {b.kind}
                                    </Badge>
                                    <Text fontSize="xs" color="gray.700" fontFamily="monospace">
                                        {JSON.stringify(b.data, null, 2)}
                                    </Text>
                                </Box>
                            ))}
                        </VStack>
                    </Box>
                )}

                <Box p={3} bg="blue.50" borderRadius="md">
                    <Text fontSize="xs" color="blue.800">
                        <strong>💡 Tips:</strong> Write freely in markdown! Click "Convert to Blocks" when ready.
                        Supported: Headings (#), Lists (-, *, 1.), Quotes (&gt;), Code (```), Dividers (---).
                    </Text>
                </Box>
            </VStack>
        </Box>
    );
};




