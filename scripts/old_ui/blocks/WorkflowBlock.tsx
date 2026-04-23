import React from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface WorkflowNode {
    id: string;
    type: 'start' | 'end' | 'task' | 'decision' | 'subprocess';
    label: string;
    next?: string[];
}

const NodeRenderer: React.FC<{ node: WorkflowNode }> = ({ node }) => {
    const getNodeStyle = () => {
        switch (node.type) {
            case 'start':
                return {
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    bg: 'green.500',
                    color: 'white',
                    border: '3px solid',
                    borderColor: 'green.700'
                };
            case 'end':
                return {
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    bg: 'red.500',
                    color: 'white',
                    border: '3px solid',
                    borderColor: 'red.700'
                };
            case 'decision':
                return {
                    width: '80px',
                    height: '80px',
                    transform: 'rotate(45deg)',
                    bg: 'yellow.400',
                    color: 'gray.800',
                    border: '2px solid',
                    borderColor: 'yellow.600'
                };
            case 'subprocess':
                return {
                    minWidth: '120px',
                    minHeight: '60px',
                    borderRadius: 'md',
                    bg: 'purple.100',
                    color: 'purple.900',
                    border: '3px solid',
                    borderColor: 'purple.500'
                };
            default: // task
                return {
                    minWidth: '120px',
                    minHeight: '60px',
                    borderRadius: 'md',
                    bg: 'blue.100',
                    color: 'blue.900',
                    border: '2px solid',
                    borderColor: 'blue.500'
                };
        }
    };

    const style = getNodeStyle();

    return (
        <VStack gap={1}>
            <Box
                {...style}
                display="flex"
                alignItems="center"
                justifyContent="center"
                px={3}
                py={2}
                textAlign="center"
            >
                <Text
                    fontSize="xs"
                    fontWeight="600"
                    transform={node.type === 'decision' ? 'rotate(-45deg)' : 'none'}
                >
                    {node.label}
                </Text>
            </Box>
            {node.next && node.next.length > 0 && (
                <Box width="2px" height="20px" bg="gray.400" />
            )}
        </VStack>
    );
};

export const WorkflowBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const nodes: WorkflowNode[] = block.data?.nodes || [];
    const caption = block.data?.caption;
    const layout = block.data?.layout || 'vertical'; // vertical or horizontal

    if (nodes.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No workflow nodes defined
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
                p={6}
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="gray.50"
                overflowX="auto"
            >
                {layout === 'vertical' ? (
                    <VStack gap={0} align="center">
                        {nodes.map((node) => (
                            <NodeRenderer key={node.id} node={node} />
                        ))}
                    </VStack>
                ) : (
                    <HStack gap={4} align="center" justifyContent="center">
                        {nodes.map((node, idx) => (
                            <React.Fragment key={node.id}>
                                <NodeRenderer node={node} />
                                {idx < nodes.length - 1 && (
                                    <Text fontSize="2xl" color="gray.400">→</Text>
                                )}
                            </React.Fragment>
                        ))}
                    </HStack>
                )}
            </Box>

            <Box mt={2} p={2} bg="blue.50" borderRadius="md">
                <HStack gap={4} fontSize="xs" color="blue.700" justifyContent="center" flexWrap="wrap">
                    <HStack gap={1}>
                        <Box width="12px" height="12px" borderRadius="50%" bg="green.500" />
                        <Text>Start</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" borderRadius="sm" bg="blue.100" border="1px solid" borderColor="blue.500" />
                        <Text>Task</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" transform="rotate(45deg)" bg="yellow.400" border="1px solid" borderColor="yellow.600" />
                        <Text>Decision</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" borderRadius="50%" bg="red.500" />
                        <Text>End</Text>
                    </HStack>
                </HStack>
            </Box>
        </Box>
    );
};


