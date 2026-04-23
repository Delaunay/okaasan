import React from 'react';
import { Box, Text, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const TextBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1}>Content:</Text>
            <Textarea
                value={block.data?.content || block.data?.text || ''}
                onChange={(e) => onChange('content', e.target.value)}
                placeholder="Enter text..."
                size="sm"
                minHeight="100px"
            />
        </Box>
    );
};


