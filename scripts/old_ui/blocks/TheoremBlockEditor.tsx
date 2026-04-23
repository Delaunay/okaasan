import React from 'react';
import { Box, VStack, HStack, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const TheoremBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const type = block.data?.type || 'theorem';
    const title = block.data?.title || '';
    const content = block.data?.content || '';
    const number = block.data?.number || '';

    const types = [
        { value: 'theorem', label: 'Theorem', color: 'blue.500' },
        { value: 'proof', label: 'Proof', color: 'green.500' },
        { value: 'lemma', label: 'Lemma', color: 'purple.500' },
        { value: 'corollary', label: 'Corollary', color: 'orange.500' },
        { value: 'proposition', label: 'Proposition', color: 'teal.500' }
    ];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Type
                </Text>
                <HStack gap={2} flexWrap="wrap">
                    {types.map((typeOption) => (
                        <Box
                            key={typeOption.value}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={type === typeOption.value ? typeOption.color : 'gray.200'}
                            bg={type === typeOption.value ? `${typeOption.color}15` : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('type', typeOption.value)}
                            transition="all 0.15s"
                            _hover={{
                                borderColor: typeOption.color,
                                bg: `${typeOption.color}15`
                            }}
                        >
                            <Text
                                fontSize="xs"
                                fontWeight={type === typeOption.value ? '600' : 'normal'}
                                color={type === typeOption.value ? typeOption.color : 'gray.600'}
                            >
                                {typeOption.label}
                            </Text>
                        </Box>
                    ))}
                </HStack>
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Number (Optional)
                    </Text>
                    <Input
                        size="sm"
                        value={number}
                        onChange={(e) => onChange('number', e.target.value)}
                        placeholder="e.g., 1.2"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Title (Optional)
                    </Text>
                    <Input
                        size="sm"
                        value={title}
                        onChange={(e) => onChange('title', e.target.value)}
                        placeholder="Optional title"
                    />
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Content
                </Text>
                <Textarea
                    size="sm"
                    value={content}
                    onChange={(e) => onChange('content', e.target.value)}
                    placeholder={type === 'proof' ? 'Proof steps...' : 'Statement...'}
                    rows={6}
                />
            </Box>

            <Text fontSize="xs" color="gray.500">
                {type === 'proof' && 'Proofs automatically end with the QED symbol (∎).'}
                {type !== 'proof' && 'Use for mathematical statements and formal logic.'}
            </Text>
        </VStack>
    );
};


