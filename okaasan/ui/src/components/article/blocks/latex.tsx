import React, { useState, useEffect, useRef } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Box, Textarea, Text } from '@chakra-ui/react';
import 'katex/dist/katex.min.css';

export interface LatexData {
    formula: string;
}

export interface LatexBlockDef extends BlockDef {
    kind: "latex";
    data: LatexData;
}

export class LatexBlock extends BlockBase {
    static kind = "latex";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <LatexViewer formula={this.def.data.formula} />;
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `$$${this.def.data.formula}$$`;
    }
}


function LatexViewer({ formula }: { formula: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const renderFormula = async () => {
            if (!containerRef.current) return;
            if (!formula) {
                containerRef.current.innerHTML = '';
                return;
            }

            // Clear previous content
            containerRef.current.innerHTML = '';
            setError(null);

            try {
                // Dynamically import KaTeX JS
                const katex = await import('katex');

                if (mounted && containerRef.current) {
                    katex.default.render(formula, containerRef.current, {
                        displayMode: true,
                        throwOnError: false,
                        errorColor: 'var(--chakra-colors-red-600)',
                        strict: false
                    });
                }
            } catch (err: any) {
                if (mounted) {
                    setError(err.message || "Failed to render formula");
                }
            }
        };

        renderFormula();

        return () => {
            mounted = false;
        };
    }, [formula]);

    return (
        <Box p={4} borderRadius="md" textAlign="center" overflowX="auto">
            {!formula && <EmptyBlockPlaceholder icon="∑" label="LaTeX Formula" hint="Click to edit — type a formula like $$E=mc^2$$" />}
            <div ref={containerRef} />
            {error && (
                <Text fontSize="sm" color="red.500" mt={2}>
                    {error}
                </Text>
            )}
        </Box>
    );
}
