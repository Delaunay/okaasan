import React, { useState, useEffect, useRef } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Textarea, Text, Input } from '@chakra-ui/react';
import { useColorMode } from '../../ui/color-mode';

export interface MermaidData {
    diagram: string;
    theme?: string;
}

export interface MermaidBlockDef extends BlockDef {
    kind: "mermaid";
    data: MermaidData;
}

export class MermaidBlock extends BlockBase {
    static kind = "mermaid";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <MermaidEditor block={this} />;
        }
        return <MermaidViewer diagram={this.def.data.diagram} theme={this.def.data.theme} />;
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `\`\`\`mermaid\n${this.def.data.diagram}\n\`\`\``;
    }
}

function MermaidEditor({ block }: { block: MermaidBlock }) {
    const [diagram, setDiagram] = useState(block.def.data.diagram || "");
    const [theme, setTheme] = useState(block.def.data.theme || "");

    const handleDiagramChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDiagram(e.target.value);
        block.def.data.diagram = e.target.value;
        block.version += 1;
    };

    const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTheme(e.target.value);
        block.def.data.theme = e.target.value;
        block.version += 1;
    };

    return (
        <Box>
            <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Mermaid Diagram Source</Text>
            <Textarea
                value={diagram}
                onChange={handleDiagramChange}
                placeholder="graph TD\n  A --> B"
                fontFamily="mono"
                rows={Math.max(5, diagram.split("\n").length)}
                size="sm"
                mb={3}
            />
            <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.500">Theme (optional)</Text>
            <Input
                value={theme}
                onChange={handleThemeChange}
                placeholder="default, dark, forest, neutral"
                size="sm"
            />
        </Box>
    );
}

function MermaidViewer({ diagram, theme }: { diagram: string, theme?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const { colorMode } = useColorMode();

    useEffect(() => {
        let mounted = true;
        const renderDiagram = async () => {
            if (!containerRef.current || !diagram) return;

            // Clear previous content to avoid duplicates/flicker if re-rendering fast
            containerRef.current.innerHTML = '';
            setError(null);

            try {
                const mermaid = await import('mermaid');

                // Determine theme: explicit > color mode
                const themeToUse = theme || (colorMode === 'dark' ? 'dark' : 'default');

                // Initialize only once ideally, but safe to call multiple times with same config
                mermaid.default.initialize({
                    startOnLoad: false,
                    theme: themeToUse as any,
                    securityLevel: 'loose',
                });

                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                // render returns { svg }
                const { svg } = await mermaid.default.render(id, diagram);

                if (mounted && containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            } catch (err: any) {
                if (mounted) {
                    console.error("Mermaid rendering error:", err);
                    setError(err.message || "Failed to render diagram");
                }
            }
        };

        renderDiagram();

        return () => {
            mounted = false;
        };
    }, [diagram, theme, colorMode]);

    return (
        <Box p={4} borderRadius="md" border="1px solid" borderColor="gray.100" overflowX="auto">
            <div ref={containerRef} />
            {error && (
                <Box mt={4} p={3} bg="red.50" borderLeft="4px solid" borderColor="red.400">
                    <Text fontSize="sm" color="red.800" fontFamily="mono" whiteSpace="pre-wrap">
                        {error}
                    </Text>
                    <Box mt={2} p={2} borderRadius="sm" border="1px solid" borderColor="red.100">
                        <Text fontSize="xs" fontFamily="mono" color="gray.600" whiteSpace="pre-wrap">
                            {diagram}
                        </Text>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
