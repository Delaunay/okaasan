import React from 'react';
import { Box, VStack, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const HeadingBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Level:</Text>
                <select
                    value={block.data?.level || 1}
                    onChange={(e) => onChange('level', parseInt(e.target.value))}
                    style={{
                        width: '100%',
                        padding: '0.25rem',
                        borderRadius: '0.25rem',
                        border: '1px solid var(--chakra-colors-border)'
                    }}
                >
                    {[1, 2, 3, 4, 5, 6].map(level => (
                        <option key={level} value={level}>Heading {level}</option>
                    ))}
                </select>
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Text:</Text>
                <Input
                    value={block.data?.text || ''}
                    onChange={(e) => onChange('text', e.target.value)}
                    placeholder="Heading text..."
                    size="sm"
                />
            </Box>
        </VStack>
    );
};


