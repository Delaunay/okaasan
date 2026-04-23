import React from 'react';
import { VStack, HStack, Box, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const AnimationBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const type = block.data?.type || 'gif';
    const url = block.data?.url || '';
    const caption = block.data?.caption || '';
    const width = block.data?.width || '100%';
    const height = block.data?.height || 'auto';
    const loop = block.data?.loop !== false;
    const autoplay = block.data?.autoplay !== false;

    const types = ['gif', 'video', 'lottie'];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Animation Type
                </Text>
                <HStack gap={2}>
                    {types.map((t) => (
                        <Box
                            key={t}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={type === t ? 'blue.500' : 'gray.200'}
                            bg={type === t ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('type', t)}
                            fontSize="xs"
                            textTransform="uppercase"
                        >
                            {t}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    URL
                </Text>
                <Input
                    size="sm"
                    value={url}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder={type === 'gif' ? 'https://example.com/animation.gif' : type === 'video' ? 'https://example.com/video.mp4' : 'https://example.com/animation.json'}
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
                    placeholder="Animation description"
                />
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Width
                    </Text>
                    <Input
                        size="sm"
                        value={width}
                        onChange={(e) => onChange('width', e.target.value)}
                        placeholder="100% or 400px"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Height
                    </Text>
                    <Input
                        size="sm"
                        value={height}
                        onChange={(e) => onChange('height', e.target.value)}
                        placeholder="auto or 300px"
                    />
                </Box>
            </HStack>

            <HStack gap={2}>
                <Button
                    size="xs"
                    onClick={() => onChange('loop', !loop)}
                    variant={loop ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    Loop
                </Button>
                <Button
                    size="xs"
                    onClick={() => onChange('autoplay', !autoplay)}
                    variant={autoplay ? 'solid' : 'outline'}
                    colorScheme="green"
                >
                    Autoplay
                </Button>
            </HStack>

            <Text fontSize="xs" color="gray.500">
                Display animated GIFs, videos, or Lottie animations.
            </Text>
        </VStack>
    );
};


