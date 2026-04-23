import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const Model3DBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const url = block.data?.url || '';
    const caption = block.data?.caption;
    const height = block.data?.height || 400;
    const autoRotate = block.data?.autoRotate !== false;

    if (!url) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No 3D model URL specified
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
                bg="gray.900"
                display="flex"
                alignItems="center"
                justifyContent="center"
                height={`${height}px`}
            >
                {/* Placeholder - Would use three.js or model-viewer in production */}
                <Box textAlign="center" p={4}>
                    <Text fontSize="md" color="gray.300" mb={2}>
                        🎨 3D Model Viewer
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                        {url.endsWith('.glb') || url.endsWith('.gltf') ? 'GLTF Model' :
                            url.endsWith('.obj') ? 'OBJ Model' :
                                url.endsWith('.fbx') ? 'FBX Model' : 'Model'}
                    </Text>
                    <Text fontSize="xs" color="gray.600" mt={2} maxWidth="300px">
                        Requires three.js or model-viewer for rendering.
                        {autoRotate && ' Auto-rotation enabled.'}
                    </Text>
                    <Text fontSize="xs" color="blue.400" mt={2} wordBreak="break-all">
                        {url}
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};


