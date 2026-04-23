import React from 'react';
import { Box, Text, VStack } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface BNFRule {
    name: string;
    definition: string;
}

export const BNFBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const rules: BNFRule[] = block.data?.rules || [];
    const caption = block.data?.caption;
    const notation = block.data?.notation || 'bnf'; // bnf or ebnf

    if (rules.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No grammar rules defined
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
                borderColor="gray.300"
                borderRadius="md"
                overflow="hidden"
            >
                <Box bg="gray.700" px={3} py={2}>
                    <Text fontSize="xs" color="gray.300" fontFamily="monospace" textTransform="uppercase">
                        {notation === 'ebnf' ? 'Extended Backus-Naur Form (EBNF)' : 'Backus-Naur Form (BNF)'}
                    </Text>
                </Box>

                <VStack align="stretch" gap={0} bg="bg">
                    {rules.map((rule, index) => (
                        <Box
                            key={index}
                            px={4}
                            py={3}
                            borderBottom={index < rules.length - 1 ? '1px solid' : 'none'}
                            borderBottomColor="gray.100"
                            fontFamily="monospace"
                            fontSize="sm"
                            _hover={{ bg: 'gray.50' }}
                        >
                            <Text>
                                <Text as="span" color="blue.600" fontWeight="600">
                                    &lt;{rule.name}&gt;
                                </Text>
                                <Text as="span" color="gray.500" mx={2}>
                                    ::=
                                </Text>
                                <Text as="span" color="gray.800">
                                    {rule.definition}
                                </Text>
                            </Text>
                        </Box>
                    ))}
                </VStack>
            </Box>

            <Box mt={2} p={2} bg="blue.50" borderRadius="md">
                <Text fontSize="xs" color="blue.700">
                    <Text as="span" fontWeight="600">Notation:</Text>
                    {' '}&lt;&gt; = non-terminal,
                    {' '}| = alternative,
                    {' '}[ ] = optional,
                    {' '}{'{ }'} = repetition
                </Text>
            </Box>
        </Box>
    );
};

