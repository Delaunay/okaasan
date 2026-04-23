import React, { useState } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface TraceStep {
    timestamp: number;
    function: string;
    line?: number;
    variables?: Record<string, any>;
    type: 'call' | 'return' | 'log' | 'error';
    message?: string;
}

export const TraceBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const steps: TraceStep[] = block.data?.steps || [];
    const caption = block.data?.caption;

    const [selectedStep, setSelectedStep] = useState<number | null>(null);

    const getStepColor = (type: string) => {
        switch (type) {
            case 'call': return { bg: 'blue.50', border: 'blue.500' };
            case 'return': return { bg: 'green.50', border: 'green.500' };
            case 'log': return { bg: 'gray.50', border: 'gray.400' };
            case 'error': return { bg: 'red.50', border: 'red.500' };
            default: return { bg: 'gray.50', border: 'gray.300' };
        }
    };

    // Calculate depth for each step based on call/return pattern
    const stepsWithDepth = steps.map((step, index) => {
        let depth = 0;
        for (let i = 0; i < index; i++) {
            if (steps[i].type === 'call') depth++;
            if (steps[i].type === 'return') depth--;
        }
        // Adjust depth based on current step type
        if (step.type === 'return') depth--;
        return { ...step, depth: Math.max(0, depth) };
    });

    if (steps.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No trace steps defined
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
                <VStack align="stretch" gap={0}>
                    {stepsWithDepth.map((step, index) => {
                        const colors = getStepColor(step.type);
                        const isSelected = selectedStep === index;

                        // Generate depth indicator with ASCII art
                        let depthIndicator = '';
                        if (step.depth > 0) {
                            const prefix = '│   '.repeat(step.depth - 1);
                            const connector = step.type === 'call' ? '├── ' :
                                step.type === 'return' ? '└── ' :
                                    step.type === 'error' ? '├─✗ ' :
                                        '├─• ';
                            depthIndicator = prefix + connector;
                        } else {
                            // Root level indicators
                            depthIndicator = step.type === 'call' ? '┌── ' :
                                step.type === 'return' ? '└── ' :
                                    step.type === 'error' ? '✗ ' :
                                        '• ';
                        }

                        return (
                            <Box key={index}>
                                <HStack
                                    p={3}
                                    pl={3}
                                    bg={isSelected ? colors.bg : 'white'}
                                    borderLeft="4px solid"
                                    borderLeftColor={colors.border}
                                    borderBottom="1px solid"
                                    borderBottomColor="gray.100"
                                    cursor={readonly ? 'pointer' : 'default'}
                                    _hover={readonly ? { bg: colors.bg } : {}}
                                    onClick={() => readonly && setSelectedStep(isSelected ? null : index)}
                                    gap={3}
                                >
                                    <Text fontSize="xs" color="gray.400" minWidth="60px" fontFamily="monospace">
                                        {step.timestamp}ms
                                    </Text>
                                    <Box flex={1}>
                                        <HStack gap={0} align="flex-start">
                                            <Text
                                                fontSize="sm"
                                                color="gray.400"
                                                fontFamily="monospace"
                                                whiteSpace="pre"
                                                lineHeight="1.4"
                                            >
                                                {depthIndicator}
                                            </Text>
                                            <Box>
                                                <HStack gap={2}>
                                                    <Text fontSize="sm" fontWeight="600" color="gray.800" fontFamily="monospace">
                                                        {step.function}
                                                    </Text>
                                                    {step.line && (
                                                        <Text fontSize="xs" color="gray.500">
                                                            :line {step.line}
                                                        </Text>
                                                    )}
                                                </HStack>
                                                {step.message && (
                                                    <Text fontSize="xs" color="gray.600" mt={1}>
                                                        {step.message}
                                                    </Text>
                                                )}
                                            </Box>
                                        </HStack>
                                    </Box>
                                </HStack>

                                {isSelected && step.variables && (
                                    <Box p={3} bg="gray.50" borderBottom="1px solid" borderBottomColor="gray.200">
                                        <Text fontSize="xs" fontWeight="600" color="gray.700" mb={2}>
                                            Variables:
                                        </Text>
                                        <Box
                                            fontFamily="monospace"
                                            fontSize="xs"
                                            color="gray.700"
                                            bg="gray.100"
                                            p={2}
                                            borderRadius="md"
                                        >
                                            {Object.entries(step.variables).map(([key, value]) => (
                                                <Box key={key} mb={1}>
                                                    <Text as="span" color="purple.600">{key}</Text>
                                                    <Text as="span" color="gray.500"> = </Text>
                                                    <Text as="span" color="blue.600">
                                                        {JSON.stringify(value)}
                                                    </Text>
                                                </Box>
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </VStack>
            </Box>
        </Box>
    );
};


