import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const VideoBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url;
    const caption = block.data?.caption;

    return (
        <Box mb={6}>
            {url ? (
                <>
                    <video
                        src={url}
                        controls
                        style={{
                            width: '100%',
                            maxWidth: '800px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                        }}
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
                    <Text>No video URL provided</Text>
                </Box>
            )}
        </Box>
    );
};


