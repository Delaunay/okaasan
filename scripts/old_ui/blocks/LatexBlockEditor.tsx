import React from 'react';
import { Box, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const LatexBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1}>LaTeX Formula:</Text>
            <Input
                value={block.data?.formula || ''}
                onChange={(e) => onChange('formula', e.target.value)}
                placeholder="E = mc^2"
                fontFamily="monospace"
                size="sm"
            />
        </Box>
    );
};


