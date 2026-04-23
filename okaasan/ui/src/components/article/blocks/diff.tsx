import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Input, Spinner, HStack, VStack, Textarea } from '@chakra-ui/react';
import { DiffEditor } from '@monaco-editor/react';
import { useColorMode } from '../../ui/color-mode';

export interface DiffData {
    filename?: string;
    language?: string;
    before: string;
    after: string;
}

export interface DiffBlockDef extends BlockDef {
    kind: "diff";
    data: DiffData;
}

export class DiffBlock extends BlockBase {
    static kind = "diff";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <DiffBlockEditor block={this} />;
        }
        return <DiffViewer data={this.def.data} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

function DiffViewer({ data }: { data: DiffData }) {
    const { colorMode } = useColorMode();
    const language = data.language || 'javascript';
    const filename = data.filename;
    const before = data.before || '';
    const after = data.after || '';
    const themeToUse = colorMode === 'dark' ? 'vs-dark' : 'light';

    // Estimate height
    const lineCount = Math.max(
        before.split('\n').length,
        after.split('\n').length
    );
    // Rough estimate: 19px per line + padding, clamped
    const height = Math.min(Math.max(lineCount * 19 + 40, 200), 600);

    return (
        <Box mb={4}>
            {filename && (
                <Box
                    bg="gray.700"
                    px={3}
                    py={2}
                    borderTopRadius="md"
                    color="gray.300"
                    fontSize="xs"
                    fontFamily="monospace"
                >
                    {filename}
                </Box>
            )}
            <Box
                borderRadius={filename ? '0 0 md md' : 'md'}
                overflow="hidden"
                border="1px solid"
                borderColor="gray.200"
                _dark={{ borderColor: "gray.700" }}
                borderTop={filename ? 'none' : undefined}
            >
                <DiffEditor
                    original={before}
                    modified={after}
                    language={language}
                    height={`${height}px`}
                    theme={themeToUse}
                    options={{
                        readOnly: true,
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
                            vertical: 'hidden',
                            horizontal: 'auto',
                        },
                        diffWordWrap: 'on',
                        renderIndicators: true,
                        enableSplitViewResizing: true
                    }}
                    loading={
                        <Box p={4}>
                            <Spinner size="sm" />
                        </Box>
                    }
                />
            </Box>
        </Box>
    );
}

function DiffBlockEditor({ block }: { block: DiffBlock }) {
    const [before, setBefore] = useState(block.def.data.before || "");
    const [after, setAfter] = useState(block.def.data.after || "");
    const [language, setLanguage] = useState(block.def.data.language || "");
    const [filename, setFilename] = useState(block.def.data.filename || "");

    const handleChange = (key: keyof DiffData, value: string) => {
        if (key === 'before') setBefore(value);
        if (key === 'after') setAfter(value);
        if (key === 'language') setLanguage(value);
        if (key === 'filename') setFilename(value);

        block.def.data[key] = value;
        block.version += 1;
    };

    return (
        <VStack gap={4} align="stretch">
            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Filename</Text>
                    <Input
                        size="sm"
                        value={filename}
                        onChange={(e) => handleChange('filename', e.target.value)}
                        placeholder="e.g. component.tsx"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Language</Text>
                    <Input
                        size="sm"
                        value={language}
                        onChange={(e) => handleChange('language', e.target.value)}
                        placeholder="javascript"
                    />
                </Box>
            </HStack>

            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Original Code (Before)</Text>
                <Textarea
                    size="sm"
                    value={before}
                    onChange={(e) => handleChange('before', e.target.value)}
                    placeholder="Original code..."
                    rows={6}
                    fontFamily="mono"
                />
            </Box>

            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Modified Code (After)</Text>
                <Textarea
                    size="sm"
                    value={after}
                    onChange={(e) => handleChange('after', e.target.value)}
                    placeholder="Modified code..."
                    rows={6}
                    fontFamily="mono"
                />
            </Box>
        </VStack>
    );
}
