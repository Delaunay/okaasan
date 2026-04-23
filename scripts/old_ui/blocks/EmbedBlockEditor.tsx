import React from 'react';
import { VStack, HStack, Box, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const EmbedBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const url = block.data?.url || '';
    const caption = block.data?.caption || '';
    const aspectRatio = block.data?.aspectRatio || '16/9';

    const aspectRatios = ['16/9', '4/3', '1/1'];

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
                    placeholder="https://youtube.com/watch?v=..."
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Supports YouTube, Vimeo, CodePen, Twitter
                </Text>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Video caption"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Aspect Ratio
                </Text>
                <HStack gap={2}>
                    {aspectRatios.map((ratio) => (
                        <Box
                            key={ratio}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={aspectRatio === ratio ? 'blue.500' : 'gray.200'}
                            bg={aspectRatio === ratio ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('aspectRatio', ratio)}
                            fontSize="xs"
                        >
                            {ratio}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Automatically detects and embeds content from popular platforms.
            </Text>
        </VStack>
    );
};


