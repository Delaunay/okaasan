import React from 'react';
import { Box, Text, Image as ChakraImage } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const AnimationBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const type = block.data?.type || 'gif'; // gif, lottie, video
    const url = block.data?.url || '';
    const caption = block.data?.caption;
    const width = block.data?.width || '100%';
    const height = block.data?.height || 'auto';
    const loop = block.data?.loop !== false;
    const autoplay = block.data?.autoplay !== false;

    if (!url) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No animation URL specified
                </Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}

            <Box
                display="flex"
                justifyContent="center"
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                overflow="hidden"
                bg="gray.50"
                p={2}
            >
                {type === 'gif' && (
                    <ChakraImage
                        src={url}
                        alt={caption || 'Animation'}
                        maxWidth={width}
                        height={height}
                        objectFit="contain"
                    />
                )}

                {type === 'video' && (
                    <video
                        src={url}
                        style={{
                            maxWidth: typeof width === 'number' ? `${width}px` : width,
                            height: typeof height === 'number' ? `${height}px` : height
                        }}
                        loop={loop}
                        autoPlay={autoplay}
                        muted
                        playsInline
                    />
                )}

                {type === 'lottie' && (
                    <Box
                        width={width}
                        height={height}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                    >
                        <Text fontSize="sm" color="gray.500">
                            Lottie animation (requires lottie-web library)
                        </Text>
                    </Box>
                )}
            </Box>
        </Box>
    );
};


