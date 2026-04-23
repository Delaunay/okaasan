import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const SandboxBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const code = block.data?.code || '';
    const language = block.data?.language || 'javascript';
    const caption = block.data?.caption || '';

    const languages = ['javascript', 'python', 'typescript', 'html', 'css'];

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
                    placeholder="Interactive code example"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Language
                </Text>
                <HStack gap={2} flexWrap="wrap">
                    {languages.map((lang) => (
                        <Box
                            key={lang}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={language === lang ? 'blue.500' : 'gray.200'}
                            bg={language === lang ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => onChange('language', lang)}
                            fontSize="xs"
                        >
                            {lang}
                        </Box>
                    ))}
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Code
                </Text>
                <Textarea
                    size="sm"
                    value={code}
                    onChange={(e) => onChange('code', e.target.value)}
                    placeholder="console.log('Hello, World!');"
                    rows={15}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="yellow.50" borderRadius="md" border="1px solid" borderColor="yellow.200">
                <Text fontSize="xs" color="yellow.800">
                    ⚠️ Security Note: Code execution is sandboxed but should only be used in trusted environments.
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Live executable code with output display. Currently supports JavaScript execution.
            </Text>
        </VStack>
    );
};


