import React from 'react';
import { Box, VStack, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ImageBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Image URL:</Text>
                <Input
                    value={block.data?.url || ''}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder="https://..."
                    size="sm"
                />
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Alt Text:</Text>
                <Input
                    value={block.data?.alt || ''}
                    onChange={(e) => onChange('alt', e.target.value)}
                    placeholder="Image description..."
                    size="sm"
                />
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Caption (optional):</Text>
                <Input
                    value={block.data?.caption || ''}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Image caption..."
                    size="sm"
                />
            </Box>
        </VStack>
    );
};


