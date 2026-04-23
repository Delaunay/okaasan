import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const CLIBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const command = block.data?.command || '';
    const output = block.data?.output || '';
    const prompt = block.data?.prompt || '$';

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Prompt Symbol
                    </Text>
                    <Input
                        size="sm"
                        value={prompt}
                        onChange={(e) => onChange('prompt', e.target.value)}
                        placeholder="$ or >"
                        maxLength={5}
                    />
                </Box>
                <Box flex={3}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Command
                    </Text>
                    <Input
                        size="sm"
                        value={command}
                        onChange={(e) => onChange('command', e.target.value)}
                        placeholder="npm install react"
                        fontFamily="monospace"
                    />
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Output (Optional)
                </Text>
                <Textarea
                    size="sm"
                    value={output}
                    onChange={(e) => onChange('output', e.target.value)}
                    placeholder="Command output..."
                    rows={6}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Text fontSize="xs" color="gray.500">
                Terminal command display with copy-to-clipboard functionality.
            </Text>
        </VStack>
    );
};


