import React from 'react';
import { VStack, HStack, Box, Text, Input, Button, IconButton, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const BNFBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const rules = block.data?.rules || [];
    const caption = block.data?.caption || '';
    const notation = block.data?.notation || 'bnf';

    const addRule = () => {
        onChange('rules', [...rules, { name: '', definition: '' }]);
    };

    const updateRule = (index: number, field: 'name' | 'definition', value: string) => {
        const newRules = rules.map((rule: any, i: number) =>
            i === index ? { ...rule, [field]: value } : rule
        );
        onChange('rules', newRules);
    };

    const deleteRule = (index: number) => {
        onChange('rules', rules.filter((_: any, i: number) => i !== index));
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
                    placeholder="Expression Grammar"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Notation
                </Text>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        onClick={() => onChange('notation', 'bnf')}
                        variant={notation === 'bnf' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        BNF
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => onChange('notation', 'ebnf')}
                        variant={notation === 'ebnf' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        EBNF
                    </Button>
                </HStack>
            </Box>

            <Box>
                <HStack justifyContent="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600">
                        Grammar Rules
                    </Text>
                    <Button size="xs" onClick={addRule} variant="outline" colorScheme="blue">
                        Add Rule
                    </Button>
                </HStack>

                {rules.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No rules yet. Click "Add Rule" to create one.
                    </Text>
                ) : (
                    <VStack gap={2} align="stretch">
                        {rules.map((rule: any, index: number) => (
                            <Box
                                key={index}
                                p={2}
                                border="1px solid"
                                borderColor="gray.200"
                                borderRadius="md"
                                bg="gray.50"
                            >
                                <HStack gap={2} mb={2} justifyContent="space-between">
                                    <Text fontSize="xs" fontWeight="bold" color="gray.600">
                                        Rule {index + 1}
                                    </Text>
                                    <IconButton
                                        aria-label="Delete"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteRule(index)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </HStack>
                                <VStack gap={2} align="stretch">
                                    <Input
                                        size="sm"
                                        value={rule.name}
                                        onChange={(e) => updateRule(index, 'name', e.target.value)}
                                        placeholder="Non-terminal name (e.g., expression)"
                                        fontFamily="monospace"
                                    />
                                    <Textarea
                                        size="sm"
                                        value={rule.definition}
                                        onChange={(e) => updateRule(index, 'definition', e.target.value)}
                                        placeholder="Definition (e.g., <term> | <term> + <expression>)"
                                        rows={2}
                                        fontFamily="monospace"
                                        fontSize="xs"
                                    />
                                </VStack>
                            </Box>
                        ))}
                    </VStack>
                )}
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Example:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
{`<expression> ::= <term> | <term> + <expression>
<term> ::= <factor> | <factor> * <term>
<factor> ::= <number> | ( <expression> )`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Formal grammar notation for language syntax definition.
            </Text>
        </VStack>
    );
};

