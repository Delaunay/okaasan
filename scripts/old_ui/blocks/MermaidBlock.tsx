import React, { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const MermaidBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const diagram = block.data?.diagram || 'graph TD\n  A --> B';
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const renderDiagram = async () => {
            if (!containerRef.current) return;

            try {
                // Dynamically import Mermaid
                const mermaid = await import('mermaid');

                // Initialize mermaid with configuration
                mermaid.default.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose',
                    fontFamily: 'inherit'
                });

                // Generate unique ID for this diagram
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Clear previous content
                containerRef.current.innerHTML = '';

                // Render the diagram
                const { svg } = await mermaid.default.render(id, diagram);
                if (containerRef.current) {
                    containerRef.current.innerHTML = svg;
                }
            } catch (err) {
                // If Mermaid is not installed or diagram is invalid, show a fallback
                if (containerRef.current) {
                    containerRef.current.innerHTML = `
                        <div style="padding: 1rem; background: #fff; border-radius: 0.25rem; font-family: monospace; white-space: pre;">
                            ${diagram}
                        </div>
                        <div style="font-size: 0.75rem; color: #e53e3e; margin-top: 0.5rem;">
                            ${err instanceof Error ? err.message : 'Install Mermaid: npm install mermaid'}
                        </div>
                    `;
                }
            }
        };

        renderDiagram();
    }, [diagram]);

    return (
        <Box mb={4} p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontSize="xs" fontWeight="bold" color="blue.700" mb={2}>
                Mermaid Diagram
            </Text>
            <Box
                bg="bg"
                p={4}
                borderRadius="md"
                ref={containerRef}
                css={{
                    '& svg': {
                        maxWidth: '100%',
                        height: 'auto'
                    }
                }}
            />
        </Box>
    );
};

