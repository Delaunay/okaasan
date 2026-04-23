import React from 'react';
import { VStack, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const DefinitionBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const term = block.data?.term || '';
    const definition = block.data?.definition || '';
    const pronunciation = block.data?.pronunciation || '';
    const partOfSpeech = block.data?.partOfSpeech || '';

    return (
        <VStack gap={3} align="stretch">
            <div>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Term
                </Text>
                <Input
                    size="sm"
                    value={term}
                    onChange={(e) => onChange('term', e.target.value)}
                    placeholder="Word or phrase"
                />
            </div>

            <div>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Definition
                </Text>
                <Textarea
                    size="sm"
                    value={definition}
                    onChange={(e) => onChange('definition', e.target.value)}
                    placeholder="Definition or explanation"
                    rows={3}
                />
            </div>

            <div>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Pronunciation (Optional)
                </Text>
                <Input
                    size="sm"
                    value={pronunciation}
                    onChange={(e) => onChange('pronunciation', e.target.value)}
                    placeholder="e.g., al-guh-ri-thuhm"
                />
            </div>

            <div>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Part of Speech (Optional)
                </Text>
                <Input
                    size="sm"
                    value={partOfSpeech}
                    onChange={(e) => onChange('partOfSpeech', e.target.value)}
                    placeholder="e.g., noun, verb, adjective"
                />
            </div>

            <Text fontSize="xs" color="gray.500">
                Definition blocks highlight important terms and their meanings.
            </Text>
        </VStack>
    );
};


