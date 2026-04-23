import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const DefinitionBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const termRef = useRef<HTMLParagraphElement>(null);
    const definitionRef = useRef<HTMLParagraphElement>(null);

    const term = block.data?.term || '';
    const definition = block.data?.definition || '';
    const pronunciation = block.data?.pronunciation;
    const partOfSpeech = block.data?.partOfSpeech;

    const handleTermBlur = () => {
        if (termRef.current && onUpdate) {
            const newTerm = termRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, term: newTerm }
            });
        }
    };

    const handleDefinitionBlur = () => {
        if (definitionRef.current && onUpdate) {
            const newDefinition = definitionRef.current.innerText;
            onUpdate({
                ...block,
                data: { ...block.data, definition: newDefinition }
            });
        }
    };

    return (
        <Box
            mb={4}
            p={4}
            bg="blue.50"
            borderLeft="4px solid"
            borderLeftColor="blue.500"
            borderRadius="md"
        >
            <Box display="flex" alignItems="baseline" gap={2} mb={2}>
                <Text
                    ref={termRef}
                    fontSize="lg"
                    fontWeight="700"
                    color="blue.900"
                    contentEditable={!readonly}
                    suppressContentEditableWarning
                    onBlur={handleTermBlur}
                    css={
                        !readonly
                            ? {
                                '&:focus': {
                                    outline: '2px solid var(--chakra-colors-blue-400)',
                                    outlineOffset: '2px',
                                    borderRadius: '4px'
                                }
                            }
                            : undefined
                    }
                >
                    {term}
                </Text>
                {pronunciation && (
                    <Text fontSize="sm" color="gray.600" fontStyle="italic">
                        /{pronunciation}/
                    </Text>
                )}
                {partOfSpeech && (
                    <Text fontSize="xs" color="blue.700" fontWeight="600" px={2} py={0.5} bg="blue.100" borderRadius="sm">
                        {partOfSpeech}
                    </Text>
                )}
            </Box>
            <Text
                ref={definitionRef}
                fontSize="sm"
                color="gray.800"
                lineHeight="1.6"
                contentEditable={!readonly}
                suppressContentEditableWarning
                onBlur={handleDefinitionBlur}
                css={
                    !readonly
                        ? {
                            '&:focus': {
                                outline: '2px solid var(--chakra-colors-blue-400)',
                                outlineOffset: '2px',
                                borderRadius: '4px'
                            }
                        }
                        : undefined
                }
            >
                {definition}
            </Text>
        </Box>
    );
};


