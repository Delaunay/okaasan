import React from 'react';
import { VStack, Box, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const Model3DBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const url = block.data?.url || '';
    const caption = block.data?.caption || '';
    const height = block.data?.height || 400;
    const autoRotate = block.data?.autoRotate !== false;

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Model URL
                </Text>
                <Input
                    size="sm"
                    value={url}
                    onChange={(e) => onChange('url', e.target.value)}
                    placeholder="https://example.com/model.glb"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Supports .glb, .gltf, .obj, .fbx formats
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
                    placeholder="3D model description"
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
                    onClick={() => onChange('autoRotate', !autoRotate)}
                    variant={autoRotate ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    Auto-Rotate: {autoRotate ? 'On' : 'Off'}
                </Button>
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" color="blue.800">
                    💡 Tip: Requires three.js or &lt;model-viewer&gt; integration for full functionality.
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Interactive 3D model viewer with rotation and zoom controls.
            </Text>
        </VStack>
    );
};


