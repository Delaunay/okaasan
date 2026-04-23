import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const DataStructureBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const type = block.data?.type || 'array';
    const data = block.data?.data;
    const caption = block.data?.caption || '';

    const types = [
        { value: 'array', label: 'Array' },
        { value: 'linkedlist', label: 'Linked List' },
        { value: 'tree', label: 'Tree' },
        { value: 'stack', label: 'Stack' },
        { value: 'queue', label: 'Queue' },
        { value: 'graph', label: 'Graph' }
    ];

    const handleDataChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('data', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    const getPlaceholder = () => {
        switch (type) {
            case 'array':
                return '[1, 2, 3, 4, 5]';
            case 'linkedlist':
                return '[{"value": 1}, {"value": 2}, {"value": 3}]';
            case 'tree':
                return '{"value": 1, "children": [{"value": 2}, {"value": 3, "children": [{"value": 4}]}]}';
            case 'stack':
            case 'queue':
                return '[1, 2, 3, 4]';
            case 'graph':
                return '{"nodes": [...], "edges": [...]}';
            default:
                return '{}';
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
                    placeholder="Binary Search Tree"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Data Structure Type
                </Text>
                <HStack gap={2} flexWrap="wrap">
                    {types.map((t) => (
                        <Box
                            key={t.value}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={type === t.value ? 'blue.500' : 'gray.200'}
                            bg={type === t.value ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('type', t.value)}
                            fontSize="xs"
                        >
                            {t.label}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Data (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={data ? JSON.stringify(data, null, 2) : ''}
                    onChange={(e) => handleDataChange(e.target.value)}
                    placeholder={getPlaceholder()}
                    rows={10}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Examples:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
                    Array: [1, 2, 3, 4]
                    Tree: {`{"value": 1, "children": [...]}`}
                    List: {`[{"value": 1}, {"value": 2}]`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Visual representation of common data structures.
            </Text>
        </VStack>
    );
};


