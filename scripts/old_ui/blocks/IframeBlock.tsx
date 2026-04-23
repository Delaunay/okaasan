import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const IframeBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url || '';
    const height = block.data?.height || 400;
    const caption = block.data?.caption;
    const allowFullscreen = block.data?.allowFullscreen !== false;

    if (!url) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No iframe URL specified
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
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                overflow="hidden"
            >
                <iframe
                    src={url}
                    width="100%"
                    height={height}
                    style={{ border: 0, display: 'block' }}
                    allowFullScreen={allowFullscreen}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                />
            </Box>
        </Box>
    );
};


