import React from 'react';
import { Box } from '@chakra-ui/react';
import Editor from '@monaco-editor/react';
import { BlockComponentProps } from './BlockTypes';

export const CodeBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const code = block.data?.code || '// Code here';
    const language = block.data?.language || 'javascript';

    return (
        <Box mb={4}>
            {language && (
                <Box
                    fontSize="xs"
                    color="gray.600"
                    mb={1}
                    px={2}
                    py={1}
                    bg="gray.100"
                    borderTopRadius="md"
                    fontWeight="medium"
                >
                    {language}
                </Box>
            )}
            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                overflow="hidden"
            >
                <Editor
                    height="auto"
                    defaultLanguage={language}
                    language={language}
                    value={code}
                    theme="vs-light"
                    options={{
                        readOnly: readonly,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 10,
                        lineNumbersMinChars: 4,
                        renderLineHighlight: 'none',
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'auto'
                        },
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        automaticLayout: true,
                        wordWrap: 'on',
                        padding: { top: 10, bottom: 10 }
                    }}
                    loading={
                        <Box p={4} bg="gray.50" fontFamily="monospace" fontSize="sm">
                            Loading editor...
                        </Box>
                    }
                    onMount={(editor) => {
                        // Auto-adjust height based on content
                        const updateHeight = () => {
                            const contentHeight = editor.getContentHeight();
                            const container = editor.getDomNode();
                            if (container) {
                                container.style.height = `${contentHeight}px`;
                            }
                            editor.layout();
                        };

                        updateHeight();
                        editor.onDidContentSizeChange(updateHeight);
                    }}
                />
            </Box>
        </Box>
    );
};

