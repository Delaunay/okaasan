import React from 'react';
import { Box, Text, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ReferenceBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1}>Citation:</Text>
            <Textarea
                value={block.data?.citation || ''}
                onChange={(e) => onChange('citation', e.target.value)}
                placeholder="Author, Year. Title..."
                size="sm"
                minHeight="60px"
            />
        </Box>
    );
};


