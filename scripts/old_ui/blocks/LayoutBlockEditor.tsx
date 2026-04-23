import React from 'react';
import { Box, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const LayoutBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1}>Number of Columns:</Text>
            <Input
                type="number"
                value={block.data?.columns || 2}
                onChange={(e) => onChange('columns', parseInt(e.target.value))}
                size="sm"
                min={1}
                max={4}
            />
            <Text fontSize="xs" color="gray.500" mt={1}>
                Layout blocks contain child blocks as columns
            </Text>
        </Box>
    );
};


