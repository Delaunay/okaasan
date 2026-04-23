import React from 'react';
import { VStack, Text, Input, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const GlossaryBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || 'Glossary';
    const sortAlphabetically = block.data?.sortAlphabetically !== false;

    return (
        <VStack gap={3} align="stretch">
            <div>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Glossary"
                />
            </div>

            <div>
                <Button
                    size="xs"
                    onClick={() => onChange('sortAlphabetically', !sortAlphabetically)}
                    variant={sortAlphabetically ? 'solid' : 'outline'}
                    colorScheme="blue"
                >
                    {sortAlphabetically ? 'Sorted' : 'Unsorted'} Alphabetically
                </Button>
            </div>

            <Text fontSize="xs" color="gray.500">
                This block automatically collects all definition blocks from the article and displays them alphabetically grouped by first letter.
            </Text>
        </VStack>
    );
};


