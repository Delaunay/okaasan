import React from 'react';
import { Box, Text, VStack, HStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface Constraint {
    name: string;
    expression: string;
    satisfied?: boolean;
    description?: string;
}

export const ConstraintBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const constraints: Constraint[] = block.data?.constraints || [];
    const caption = block.data?.caption;
    const context = block.data?.context || {};

    if (constraints.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No constraints defined
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

            <Box border="1px solid" borderColor="gray.200" borderRadius="md" overflow="hidden">
                {/* Context/Variables */}
                {Object.keys(context).length > 0 && (
                    <Box p={3} bg="blue.50" borderBottom="1px solid" borderColor="gray.200">
                        <Text fontSize="xs" fontWeight="600" color="blue.800" mb={2}>
                            Context:
                        </Text>
                        <HStack gap={3} flexWrap="wrap">
                            {Object.entries(context).map(([key, value]) => (
                                <HStack key={key} gap={1} fontSize="xs">
                                    <Text fontFamily="monospace" color="purple.700" fontWeight="600">
                                        {key}
                                    </Text>
                                    <Text color="gray.500">=</Text>
                                    <Text fontFamily="monospace" color="blue.700">
                                        {JSON.stringify(value)}
                                    </Text>
                                </HStack>
                            ))}
                        </HStack>
                    </Box>
                )}

                {/* Constraints */}
                <VStack align="stretch" gap={0}>
                    {constraints.map((constraint, index) => {
                        const satisfied = constraint.satisfied !== false;

                        return (
                            <Box
                                key={index}
                                p={3}
                                borderLeft="4px solid"
                                borderLeftColor={satisfied ? 'green.500' : 'red.500'}
                                borderBottom={index < constraints.length - 1 ? '1px solid' : 'none'}
                                borderBottomColor="gray.100"
                                bg={satisfied ? 'white' : 'red.50'}
                            >
                                <HStack gap={2} mb={1}>
                                    <Text fontSize="lg">
                                        {satisfied ? '✓' : '✗'}
                                    </Text>
                                    <Text fontSize="sm" fontWeight="600" color="gray.800">
                                        {constraint.name}
                                    </Text>
                                </HStack>

                                <Box
                                    fontFamily="monospace"
                                    fontSize="sm"
                                    color="gray.700"
                                    bg="gray.50"
                                    p={2}
                                    borderRadius="md"
                                    mb={constraint.description ? 2 : 0}
                                >
                                    {constraint.expression}
                                </Box>

                                {constraint.description && (
                                    <Text fontSize="xs" color="gray.600">
                                        {constraint.description}
                                    </Text>
                                )}
                            </Box>
                        );
                    })}
                </VStack>
            </Box>
        </Box>
    );
};


