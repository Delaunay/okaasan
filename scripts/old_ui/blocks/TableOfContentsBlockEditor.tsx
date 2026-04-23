import React from 'react';
import { Box, VStack, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const TableOfContentsBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Title:</Text>
                <Input
                    value={block.data?.title || 'Table of Contents'}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Table of Contents"
                    size="sm"
                />
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Max Heading Level:</Text>
                <Input
                    type="number"
                    value={block.data?.maxLevel || 3}
                    onChange={(e) => onChange('maxLevel', parseInt(e.target.value))}
                    min={1}
                    max={6}
                    size="sm"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Show headings from level 1 up to this level (1-6)
                </Text>
            </Box>
            <Box p={3} bg="blue.50" borderRadius="md">
                <Text fontSize="xs" color="blue.800">
                    <strong>Note:</strong> This block automatically generates a table of contents from all headings in your article. It will update automatically when you add, remove, or modify headings.
                </Text>
            </Box>
        </VStack>
    );
};

