import React from 'react';
import { Box, Image, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const ImageBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url;
    const alt = block.data?.alt || 'Image';
    const caption = block.data?.caption;

    return (
        <Box mb={6}>
            {url ? (
                <>
                    <Image
                        src={url}
                        alt={alt}
                        maxW="100%"
                        borderRadius="md"
                        boxShadow="md"
                    />
                    {caption && (
                        <Text fontSize="sm" color="gray.600" mt={2} fontStyle="italic">
                            {caption}
                        </Text>
                    )}
                </>
            ) : (
                <Box
                    p={8}
                    bg="gray.100"
                    borderRadius="md"
                    textAlign="center"
                    color="gray.500"
                >
                    <Text>No image URL provided</Text>
                </Box>
            )}
        </Box>
    );
};


