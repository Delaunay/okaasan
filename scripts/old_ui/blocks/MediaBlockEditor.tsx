import React from 'react';
import { Box, VStack, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

/**
 * Shared editor for Video and Audio blocks
 */
export const MediaBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Media URL:</Text>
                <Input
                    value={block.data?.url || ''}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder="https://..."
                    size="sm"
                />
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Caption (optional):</Text>
                <Input
                    value={block.data?.caption || ''}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Caption..."
                    size="sm"
                />
            </Box>
        </VStack>
    );
};


