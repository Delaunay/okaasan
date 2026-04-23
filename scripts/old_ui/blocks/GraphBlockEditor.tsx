import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const GraphBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const graph = block.data?.graph || {};
    const caption = block.data?.caption || '';
    const height = block.data?.height || 400;
    const theme = block.data?.theme || 'dark';

    const handleGraphChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('graph', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Node Graph"
                />
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
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
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={2}>
                        Theme
                    </Text>
                    <HStack gap={2}>
                        <Button
                            size="xs"
                            onClick={() => onChange('theme', 'dark')}
                            variant={theme === 'dark' ? 'solid' : 'outline'}
                            colorScheme="blue"
                        >
                            Dark
                        </Button>
                        <Button
                            size="xs"
                            onClick={() => onChange('theme', 'light')}
                            variant={theme === 'light' ? 'solid' : 'outline'}
                            colorScheme="blue"
                        >
                            Light
                        </Button>
                    </HStack>
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Graph Data (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(graph, null, 2)}
                    onChange={(e) => handleGraphChange(e.target.value)}
                    placeholder={`{\n  "nodes": [\n    {\n      "id": 0,\n      "type": "basic/const",\n      "pos": [100, 100],\n      "properties": {"value": 5}\n    }\n  ],\n  "links": []\n}`}
                    rows={15}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Common Node Types:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
                    {`basic/const - Constant value
basic/watch - Display value
basic/time - Current time
math/operation - Math operations
math/rand - Random number
logic/compare - Comparisons
string/concatenate - Join strings`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Interactive node-based visual programming using LiteGraph.js. Requires litegraph.js npm package.
            </Text>
        </VStack>
    );
};

