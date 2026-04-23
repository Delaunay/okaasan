import React from 'react';
import { Box, VStack, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const FootnoteBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Number:</Text>
                <Input
                    value={block.data?.number || ''}
                    onChange={(e) => onChange('number', e.target.value)}
                    placeholder="1"
                    size="sm"
                />
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Text:</Text>
                <Textarea
                    value={block.data?.text || ''}
                    onChange={(e) => onChange('text', e.target.value)}
                    placeholder="Footnote text..."
                    size="sm"
                    minHeight="60px"
                />
            </Box>
        </VStack>
    );
};


