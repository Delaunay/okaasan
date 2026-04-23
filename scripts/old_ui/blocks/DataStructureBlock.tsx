import React from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

// Simple tree node renderer
const TreeNode: React.FC<{ node: any; level: number }> = ({ node, level }) => {
    return (
        <Box>
            <HStack gap={2} mb={2}>
                <Box width={level * 30 + 'px'} />
                <Box
                    px={3}
                    py={2}
                    bg="blue.50"
                    border="2px solid"
                    borderColor="blue.500"
                    borderRadius="md"
                    minWidth="60px"
                    textAlign="center"
                >
                    <Text fontSize="sm" fontWeight="600" color="blue.900">
                        {node.value}
                    </Text>
                </Box>
            </HStack>
            {node.children && node.children.map((child: any, idx: number) => (
                <TreeNode key={idx} node={child} level={level + 1} />
            ))}
        </Box>
    );
};

// Simple linked list renderer
const LinkedListNode: React.FC<{ nodes: any[] }> = ({ nodes }) => {
    return (
        <HStack gap={2} flexWrap="wrap">
            {nodes.map((node, idx) => (
                <React.Fragment key={idx}>
                    <Box
                        px={4}
                        py={2}
                        bg="green.50"
                        border="2px solid"
                        borderColor="green.500"
                        borderRadius="md"
                        minWidth="60px"
                        textAlign="center"
                    >
                        <Text fontSize="sm" fontWeight="600" color="green.900">
                            {node.value}
                        </Text>
                    </Box>
                    {idx < nodes.length - 1 && (
                        <Text fontSize="xl" color="gray.400">→</Text>
                    )}
                </React.Fragment>
            ))}
            <Text fontSize="xl" color="gray.400">∅</Text>
        </HStack>
    );
};

// Simple array renderer
const ArrayStructure: React.FC<{ items: any[] }> = ({ items }) => {
    return (
        <HStack gap={0}>
            {items.map((item, idx) => (
                <Box
                    key={idx}
                    px={4}
                    py={3}
                    bg="purple.50"
                    border="1px solid"
                    borderColor="purple.500"
                    borderLeft={idx === 0 ? '2px solid' : '1px solid'}
                    borderRight={idx === items.length - 1 ? '2px solid' : '0'}
                    textAlign="center"
                    minWidth="60px"
                >
                    <Text fontSize="xs" color="purple.400" mb={1}>
                        [{idx}]
                    </Text>
                    <Text fontSize="sm" fontWeight="600" color="purple.900">
                        {item}
                    </Text>
                </Box>
            ))}
        </HStack>
    );
};

// Simple stack renderer
const StackStructure: React.FC<{ items: any[] }> = ({ items }) => {
    return (
        <VStack gap={0} alignItems="stretch" maxWidth="200px">
            {[...items].reverse().map((item, idx) => (
                <Box
                    key={idx}
                    px={4}
                    py={2}
                    bg="orange.50"
                    border="2px solid"
                    borderColor="orange.500"
                    borderTop={idx === 0 ? '2px solid' : '0'}
                    textAlign="center"
                >
                    <Text fontSize="sm" fontWeight="600" color="orange.900">
                        {item}
                    </Text>
                </Box>
            ))}
            <Box
                py={1}
                bg="gray.100"
                borderBottom="3px solid"
                borderColor="gray.600"
                textAlign="center"
            >
                <Text fontSize="xs" color="gray.600">Bottom</Text>
            </Box>
        </VStack>
    );
};

export const DataStructureBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const type = block.data?.type || 'array'; // array, tree, linkedlist, stack, queue, graph
    const data = block.data?.data;
    const caption = block.data?.caption;

    if (!data) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No data structure defined
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
                p={4}
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="bg"
                overflowX="auto"
            >
                {type === 'array' && <ArrayStructure items={data} />}
                {type === 'linkedlist' && <LinkedListNode nodes={data} />}
                {type === 'tree' && <TreeNode node={data} level={0} />}
                {type === 'stack' && <StackStructure items={data} />}
                {type === 'queue' && (
                    <VStack alignItems="flex-start">
                        <Text fontSize="xs" color="gray.500" mb={1}>Front →</Text>
                        <LinkedListNode nodes={data} />
                        <Text fontSize="xs" color="gray.500">← Back</Text>
                    </VStack>
                )}
                {type === 'graph' && (
                    <Text fontSize="sm" color="gray.500">
                        Graph visualization (use Vega or custom renderer)
                    </Text>
                )}
            </Box>
        </Box>
    );
};


