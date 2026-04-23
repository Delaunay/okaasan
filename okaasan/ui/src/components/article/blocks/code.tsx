import React, { useState, useEffect } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, BlockSetting } from "../base";
import { Box, Text, Input, Spinner } from '@chakra-ui/react';
import Editor from '@monaco-editor/react';
import { useColorMode } from '../../ui/color-mode';

export interface CodeData {
    language?: string;
    theme?: string;
    code: string;
}

export interface CodeBlockDef extends BlockDef {
    kind: "code";
    data: CodeData;
}

export class CodeBlock extends BlockBase {
    static kind = "code";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <CodeEditor block={this} />;
        }
        return <CodeViewer data={this.def.data} />;
    }

    has_settings(): boolean {
        return true;
    }

    settings(): BlockSetting {
        return {
            language: { "type": "string", "required": false },
            theme: { "type": "string", "required": false },
        }
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const lang = this.def.data.language || "";
        return `\`\`\`${lang}\n${this.def.data.code}\n\`\`\``;
    }
}

function CodeViewer({ data }: { data: CodeData }) {
    const { colorMode } = useColorMode();
    const language = data.language || 'javascript';
    const code = data.code || '';
    const themeToUse = colorMode === 'dark' ? 'vs-dark' : 'light';

    return (
        <Box
            borderRadius="md"
            overflow="hidden"
            border="1px solid"
            borderColor="gray.200"
            _dark={{ borderColor: "gray.700" }}
        >
            {language && (
                <Box
                    fontSize="xs"
                    color="gray.600"
                    _dark={{ color: "gray.400", bg: "gray.800" }}
                    px={3}
                    py={1}
                    bg="gray.50"
                    borderBottom="1px solid"
                    borderColor="inherit"
                    fontWeight="medium"
                >
                    {language}
                </Box>
            )}
            <Editor
                height="auto"
                defaultLanguage={language}
                language={language}
                value={code}
                theme={themeToUse}
                options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: 'on',
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 10,
                    lineNumbersMinChars: 3,
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
                    padding: { top: 10, bottom: 10 },
                    contextmenu: false,
                }}
                loading={
                    <Box p={4}>
                        <Spinner size="sm" />
                    </Box>
                }
                onMount={(editor) => {
                    // Auto-height adjustment
                    const updateHeight = () => {
                        const contentHeight = Math.min(Math.max(editor.getContentHeight(), 50), 600);
                        const container = editor.getDomNode();
                        if (container) {
                            container.style.height = `${contentHeight}px`;
                        }
                        editor.layout();
                    };
                    editor.onDidContentSizeChange(updateHeight);
                    updateHeight();
                }}
            />
        </Box>
    );
}

function CodeEditor({ block }: { block: CodeBlock }) {
    const [code, setCode] = useState(block.def.data.code || "");
    const [language, setLanguage] = useState(block.def.data.language || "");
    const { colorMode } = useColorMode();
    const themeToUse = colorMode === 'dark' ? 'vs-dark' : 'light';

    const handleCodeChange = (value: string | undefined) => {
        const newCode = value || "";
        setCode(newCode);
        block.def.data.code = newCode;
        block.version += 1;
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLanguage(e.target.value);
        block.def.data.language = e.target.value;
        block.version += 1;
    };

    return (
        <Box>
            <Box mb={2}>
                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Language</Text>
                <Input
                    value={language}
                    onChange={handleLanguageChange}
                    placeholder="javascript, python, typescript..."
                    size="sm"
                />
            </Box>
            <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Code</Text>
            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                overflow="hidden"
                height="300px"
            >
                <Editor
                    height="100%"
                    defaultLanguage={language}
                    language={language}
                    value={code}
                    theme={themeToUse}
                    onChange={handleCodeChange}
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        lineNumbers: 'on',
                        automaticLayout: true,
                        wordWrap: 'on',
                        padding: { top: 10, bottom: 10 }
                    }}
                />
            </Box>
        </Box>
    );
}
