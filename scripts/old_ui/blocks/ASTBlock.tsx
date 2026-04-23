import React, { useState } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface ASTNode {
    type: string;
    value?: string;
    children?: ASTNode[];
    attributes?: Record<string, any>;
}

const ASTNodeRenderer: React.FC<{ node: ASTNode; level: number; readonly: boolean }> = ({ node, level, readonly }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    const getNodeColor = (type: string) => {
        if (type.includes('Expression') || type.includes('Literal')) return 'green';
        if (type.includes('Statement') || type.includes('Declaration')) return 'blue';
        if (type.includes('Function') || type.includes('Method')) return 'purple';
        if (type.includes('Identifier') || type.includes('Name')) return 'orange';
        return 'gray';
    };

    const color = getNodeColor(node.type);

    return (
        <Box>
            <HStack
                gap={2}
                py={1}
                px={2}
                pl={level * 12 + 8}
                cursor={hasChildren && readonly ? 'pointer' : 'default'}
                _hover={hasChildren && readonly ? { bg: 'gray.50' } : {}}
                onClick={() => hasChildren && readonly && setIsExpanded(!isExpanded)}
            >
                {hasChildren && (
                    <Text fontSize="xs" color="gray.400" minWidth="12px">
                        {isExpanded ? '▼' : '▶'}
                    </Text>
                )}
                {!hasChildren && <Box minWidth="12px" />}

                <Box
                    px={2}
                    py={0.5}
                    bg={`${color}.100`}
                    border="1px solid"
                    borderColor={`${color}.300`}
                    borderRadius="sm"
                >
                    <Text fontSize="xs" fontWeight="600" color={`${color}.800`} fontFamily="monospace">
                        {node.type}
                    </Text>
                </Box>

                {node.value && (
                    <Text fontSize="xs" color="gray.600" fontFamily="monospace">
                        = "{node.value}"
                    </Text>
                )}

                {node.attributes && Object.keys(node.attributes).length > 0 && (
                    <HStack gap={2} ml={2}>
                        {Object.entries(node.attributes).slice(0, 2).map(([key, value]) => (
                            <Text key={key} fontSize="xs" color="gray.500">
                                {key}: {String(value)}
                            </Text>
                        ))}
                    </HStack>
                )}
            </HStack>

            {hasChildren && isExpanded && (
                <Box>
                    {node.children!.map((child, idx) => (
                        <ASTNodeRenderer key={idx} node={child} level={level + 1} readonly={readonly} />
                    ))}
                </Box>
            )}
        </Box>
    );
};

export const ASTBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const ast: ASTNode = block.data?.ast;
    const caption = block.data?.caption;
    const sourceCode = block.data?.sourceCode;

    if (!ast) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No AST defined
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

            {sourceCode && (
                <Box
                    mb={2}
                    p={3}
                    bg="gray.900"
                    borderRadius="md"
                    fontFamily="monospace"
                    fontSize="xs"
                    color="white"
                    whiteSpace="pre-wrap"
                >
                    {sourceCode}
                </Box>
            )}

            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="bg"
                py={2}
                maxHeight="500px"
                overflowY="auto"
            >
                <ASTNodeRenderer node={ast} level={0} readonly={readonly} />
            </Box>

            <Box mt={2} p={2} bg="gray.50" borderRadius="md">
                <HStack gap={3} fontSize="xs" color="gray.600" flexWrap="wrap">
                    <HStack gap={1}>
                        <Box width="12px" height="12px" bg="blue.100" border="1px solid" borderColor="blue.300" />
                        <Text>Statement</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" bg="green.100" border="1px solid" borderColor="green.300" />
                        <Text>Expression</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" bg="purple.100" border="1px solid" borderColor="purple.300" />
                        <Text>Function</Text>
                    </HStack>
                    <HStack gap={1}>
                        <Box width="12px" height="12px" bg="orange.100" border="1px solid" borderColor="orange.300" />
                        <Text>Identifier</Text>
                    </HStack>
                </HStack>
            </Box>
        </Box>
    );
};


