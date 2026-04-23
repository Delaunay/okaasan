import React from 'react';
import { Box, Text, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const MermaidBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1}>Mermaid Diagram:</Text>
            <Textarea
                value={block.data?.diagram || ''}
                onChange={(e) => onChange('diagram', e.target.value)}
                placeholder="graph TD&#10;  A --> B"
                fontFamily="monospace"
                size="sm"
                minHeight="100px"
            />
        </Box>
    );
};


