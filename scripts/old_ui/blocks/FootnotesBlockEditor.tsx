import React from 'react';
import { Box, VStack, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const FootnotesBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || 'Footnotes';
    const showDivider = block.data?.showDivider !== false;

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
                    placeholder="Footnotes"
                />
            </Box>

            <Box>
                <Button
                    size="xs"
                    onClick={() => onChange('showDivider', !showDivider)}
                    variant={showDivider ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    {showDivider ? 'Hide' : 'Show'} Divider Line
                </Button>
            </Box>

            <Text fontSize="xs" color="gray.500">
                This block automatically collects all footnote blocks from the article and displays them in order with numbering.
            </Text>
        </VStack>
    );
};


