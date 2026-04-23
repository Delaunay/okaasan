import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const DiffBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const before = block.data?.before || '';
    const after = block.data?.after || '';
    const language = block.data?.language || 'javascript';
    const filename = block.data?.filename || '';
    const renderMode = block.data?.renderMode || 'inline';

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Filename (Optional)
                    </Text>
                    <Input
                        size="sm"
                        value={filename}
                        onChange={(e) => onChange('filename', e.target.value)}
                        placeholder="component.tsx"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Language
                    </Text>
                    <Input
                        size="sm"
                        value={language}
                        onChange={(e) => onChange('language', e.target.value)}
                        placeholder="javascript, typescript, python, etc."
                    />
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Render Mode
                </Text>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        onClick={() => onChange('renderMode', 'inline')}
                        variant={renderMode === 'inline' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        Inline
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => onChange('renderMode', 'split')}
                        variant={renderMode === 'split' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        Split (Side-by-Side)
                    </Button>
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Before (Original)
                </Text>
                <Textarea
                    size="sm"
                    value={before}
                    onChange={(e) => onChange('before', e.target.value)}
                    placeholder="Original code..."
                    rows={8}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    After (Modified)
                </Text>
                <Textarea
                    size="sm"
                    value={after}
                    onChange={(e) => onChange('after', e.target.value)}
                    placeholder="Modified code..."
                    rows={8}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Text fontSize="xs" color="gray.500">
                Professional diff viewer powered by Monaco Editor with syntax highlighting and inline/split view modes.
            </Text>
        </VStack>
    );
};


