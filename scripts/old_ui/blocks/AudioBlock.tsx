import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const AudioBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url;
    const caption = block.data?.caption;

    return (
        <Box mb={6}>
            {url ? (
                <>
                    <audio
                        src={url}
                        controls
                        style={{
                            width: '100%',
                            maxWidth: '600px',
                            borderRadius: '8px'
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
                    <Text>No audio URL provided</Text>
                </Box>
            )}
        </Box>
    );
};


