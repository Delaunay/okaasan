import React from 'react';
import { VStack, Box, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const IframeBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const url = block.data?.url || '';
    const height = block.data?.height || 400;
    const caption = block.data?.caption || '';
    const allowFullscreen = block.data?.allowFullscreen !== false;

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    URL
                </Text>
                <Input
                    size="sm"
                    value={url}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder="https://example.com"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Embedded content"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Height (px)
                </Text>
                <Input
                    size="sm"
                    type="number"
                    value={height}
                    onChange={(e) => onChange('height', parseInt(e.target.value) || 400)}
                    placeholder="400"
                />
            </Box>

            <Box>
                <Button
                    size="xs"
                    onClick={() => onChange('allowFullscreen', !allowFullscreen)}
                    variant={allowFullscreen ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    {allowFullscreen ? 'Allow' : 'Block'} Fullscreen
                </Button>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Embed external web content in a sandboxed iframe.
            </Text>
        </VStack>
    );
};


