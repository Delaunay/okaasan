import React from 'react';
import { Box, VStack, HStack, Text, Input } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const BibliographyBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || 'Bibliography';
    const style = block.data?.style || 'apa';

    const styles = [
        { value: 'apa', label: 'APA' },
        { value: 'mla', label: 'MLA' },
        { value: 'chicago', label: 'Chicago' },
        { value: 'numbered', label: 'Numbered' }
    ];

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Bibliography"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Citation Style
                </Text>
                <HStack gap={2}>
                    {styles.map((styleOption) => (
                        <Box
                            key={styleOption.value}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={style === styleOption.value ? 'blue.500' : 'gray.200'}
                            bg={style === styleOption.value ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('style', styleOption.value)}
                            transition="all 0.15s"
                            _hover={{
                                borderColor: 'blue.500',
                                bg: 'blue.50'
                            }}
                        >
                            <Text
                                fontSize="xs"
                                fontWeight={style === styleOption.value ? '600' : 'normal'}
                                color={style === styleOption.value ? 'blue.700' : 'gray.600'}
                            >
                                {styleOption.label}
                            </Text>
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Text fontSize="xs" color="gray.500">
                This block automatically collects all reference blocks from the article and displays them as a bibliography.
            </Text>
        </VStack>
    );
};


