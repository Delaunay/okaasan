import React from 'react';
import { VStack, Box, Text, Input, Textarea, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ToggleBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || 'Click to reveal';
    const content = block.data?.content || '';
    const defaultOpen = block.data?.defaultOpen || false;

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Title/Summary"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Hidden Content
                </Text>
                <Textarea
                    size="sm"
                    value={content}
                    onChange={(e) => onChange('content', e.target.value)}
                    placeholder="Content revealed when expanded..."
                    rows={6}
                />
            </Box>

            <Box>
                <Button
                    size="xs"
                    onClick={() => onChange('defaultOpen', !defaultOpen)}
                    variant={defaultOpen ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    {defaultOpen ? 'Open' : 'Closed'} by Default
                </Button>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Collapsible content that users can expand/collapse by clicking.
            </Text>
        </VStack>
    );
};


