import React from 'react';
import { Box, VStack, Text, Input } from '@chakra-ui/react';
import Editor from '@monaco-editor/react';
import { BlockEditorProps } from './BlockTypes';

export const CodeBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const code = block.data?.code || '';
    const language = block.data?.language || 'javascript';

    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Language:</Text>
                <Input
                    value={language}
                    onChange={(e) => onChange('language', e.target.value)}
                    placeholder="e.g., javascript, python, typescript..."
                    size="sm"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Supported: javascript, typescript, python, java, cpp, csharp, php, ruby, go, rust, sql, html, css, json, xml, yaml, markdown, and more
                </Text>
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Code:</Text>
                <Box
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    overflow="hidden"
                >
                    <Editor
                        height="300px"
                        defaultLanguage={language}
                        language={language}
                        value={code}
                        theme="vs-light"
                        options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                            lineNumbers: 'on',
                            lineNumbersMinChars: 4,
                            lineDecorationsWidth: 10,
                            folding: true,
                            automaticLayout: true,
                            wordWrap: 'on',
                            padding: { top: 10, bottom: 10 },
                            suggestOnTriggerCharacters: true,
                            quickSuggestions: true,
                            parameterHints: { enabled: true }
                        }}
                        onChange={(value) => {
                            onChange('code', value || '');
                        }}
                        loading={
                            <Box p={4} bg="gray.50" fontFamily="monospace" fontSize="sm">
                                Loading Monaco Editor...
                            </Box>
                        }
                    />
                </Box>
            </Box>
        </VStack>
    );
};

