import React, { useState } from 'react';
import { Box, Text, HStack, Button } from '@chakra-ui/react';
import { DiffEditor } from '@monaco-editor/react';
import { BlockComponentProps } from './BlockTypes';

export const DiffBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const before = block.data?.before || '';
    const after = block.data?.after || '';
    const language = block.data?.language || 'javascript';
    const filename = block.data?.filename;
    const [renderMode, setRenderMode] = useState<'inline' | 'split'>(block.data?.renderMode || 'inline');

    // Calculate height based on content
    const lineCount = Math.max(
        before.split('\n').length,
        after.split('\n').length
    );
    const calculatedHeight = Math.min(Math.max(lineCount * 19 + 40, 200), 600);

    return (
        <Box mb={4}>
            {/* Header with filename and controls */}
            <HStack
                bg="gray.700"
                px={3}
                py={2}
                borderTopRadius="md"
                justifyContent="space-between"
            >
                <Text fontSize="xs" color="gray.300" fontFamily="monospace">
                    {filename || 'diff'}
                </Text>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        variant={renderMode === 'inline' ? 'solid' : 'ghost'}
                        colorScheme="blue"
                        onClick={() => setRenderMode('inline')}
                    >
                        Inline
                    </Button>
                    <Button
                        size="xs"
                        variant={renderMode === 'split' ? 'solid' : 'ghost'}
                        colorScheme="blue"
                        onClick={() => setRenderMode('split')}
                    >
                        Split
                    </Button>
                </HStack>
            </HStack>

            {/* Monaco Diff Editor */}
            <Box
                borderRadius={filename ? '0 0 md md' : 'md'}
                overflow="hidden"
                border="1px solid"
                borderColor="gray.700"
                borderTop="none"
            >
                <DiffEditor
                    original={before}
                    modified={after}
                    language={language}
                    height={calculatedHeight}
                    theme="vs-dark"
                    options={{
                        readOnly: true,
                        renderSideBySide: renderMode === 'split',
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 5,
                        lineNumbersMinChars: 3,
                        renderOverviewRuler: false,
                        scrollbar: {
                            vertical: 'auto',
                            horizontal: 'auto',
                            verticalScrollbarSize: 10,
                            horizontalScrollbarSize: 10
                        },
                        diffWordWrap: 'on',
                        ignoreTrimWhitespace: false,
                        renderIndicators: true,
                        enableSplitViewResizing: true
                    }}
                />
            </Box>
        </Box>
    );
};


