import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const CitationBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const author = block.data?.author || '';
    const year = block.data?.year || '';
    const text = block.data?.text || '';
    const page = block.data?.page || '';

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Quote Text
                </Text>
                <Textarea
                    size="sm"
                    value={text}
                    onChange={(e) => onChange('text', e.target.value)}
                    placeholder="Enter the quotation..."
                    rows={4}
                />
            </Box>

            <HStack gap={2}>
                <Box flex={2}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Author
                    </Text>
                    <Input
                        size="sm"
                        value={author}
                        onChange={(e) => onChange('author', e.target.value)}
                        placeholder="Author name"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Year
                    </Text>
                    <Input
                        size="sm"
                        value={year}
                        onChange={(e) => onChange('year', e.target.value)}
                        placeholder="Year"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Page (Optional)
                    </Text>
                    <Input
                        size="sm"
                        value={page}
                        onChange={(e) => onChange('page', e.target.value)}
                        placeholder="Page #"
                    />
                </Box>
            </HStack>

            <Text fontSize="xs" color="gray.500">
                Citations display as styled block quotes with attribution.
            </Text>
        </VStack>
    );
};


