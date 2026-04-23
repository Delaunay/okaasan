import React, { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const LatexBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const formula = block.data?.formula || 'E = mc^2';
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const renderFormula = async () => {
            if (!containerRef.current) return;

            try {
                // Dynamically import KaTeX
                const katex = await import('katex');
                await import('katex/dist/katex.min.css');

                // Clear previous content
                containerRef.current.innerHTML = '';

                // Render the formula
                katex.default.render(formula, containerRef.current, {
                    displayMode: true,
                    throwOnError: false,
                    errorColor: '#cc0000',
                    strict: false
                });
            } catch (error) {
                // If KaTeX is not installed, show a fallback
                if (containerRef.current) {
                    containerRef.current.innerHTML = `
                        <div style="padding: 1rem; background: #fff; border-radius: 0.25rem; font-family: monospace;">
                            ${formula}
                        </div>
                        <div style="font-size: 0.75rem; color: #718096; margin-top: 0.5rem;">
                            Install KaTeX: npm install katex
                        </div>
                    `;
                }
            }
        };

        renderFormula();
    }, [formula]);

    return (
        <Box mb={4} p={4} bg="purple.50" borderRadius="md" borderLeft="4px solid" borderColor="purple.400">
            <Text fontSize="xs" fontWeight="bold" color="purple.700" mb={2}>
                LaTeX Formula
            </Text>
            <div ref={containerRef} />
        </Box>
    );
};

