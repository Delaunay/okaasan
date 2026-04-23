import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const VegaPlotBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const renderVega = async () => {
            try {
                if (isMounted) {
                    setIsLoading(true);
                    setError(null);
                }

                console.log('VegaPlotBlock: Starting render', block.data);

                // Dynamic import of vega-embed
                const vegaEmbed = await import('vega-embed').then((mod) => mod.default);
                console.log('VegaPlotBlock: vega-embed loaded', vegaEmbed);

                if (!containerRef.current) {
                    console.warn('VegaPlotBlock: containerRef.current is null');
                    if (isMounted) {
                        setIsLoading(false);
                    }
                    return;
                }

                // Get spec and data from block
                const spec = block.data?.spec;
                const data = block.data?.data;

                console.log('VegaPlotBlock: spec', spec);
                console.log('VegaPlotBlock: data', data);

                if (!spec) {
                    if (isMounted) {
                        setError('No spec provided for Vega plot');
                        setIsLoading(false);
                    }
                    return;
                }

                // If data is provided separately, merge it into the spec
                let finalSpec = spec;
                if (data && typeof spec === 'object') {
                    finalSpec = {
                        ...spec,
                        data: data
                    };
                }

                // Clear previous render
                containerRef.current.innerHTML = '';

                console.log('VegaPlotBlock: Rendering with finalSpec', finalSpec);

                // Render the visualization
                const result = await vegaEmbed(containerRef.current, finalSpec, {
                    actions: {
                        export: true,
                        source: false,
                        compiled: false,
                        editor: false
                    },
                    renderer: 'svg'
                });

                console.log('VegaPlotBlock: Render complete');

                if (isMounted) {
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Vega rendering error:', err);
                if (isMounted) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to render Vega visualization. Make sure vega-embed is installed: npm install vega-embed'
                    );
                    setIsLoading(false);
                }
            }
        };

        renderVega();

        return () => {
            isMounted = false;
        };
    }, [block.data]);

    return (
        <Box mb={4} position="relative">
            {error && (
                <Box p={4} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md">
                    <Text color="red.600" fontWeight="bold">
                        Vega Error
                    </Text>
                    <Text fontSize="sm" color="red.500">
                        {error}
                    </Text>
                </Box>
            )}
            {isLoading && !error && (
                <Box
                    position="absolute"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    bg="bg"
                    zIndex={1}
                    minHeight="200px"
                >
                    <Text color="gray.600">Loading visualization...</Text>
                </Box>
            )}
            <Box
                ref={containerRef}
                width="100%"
                minHeight="200px"
                css={{
                    overflow: 'auto',
                    '& .vega-embed': {
                        width: '100%'
                    },
                    '& .vega-embed summary': {
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        padding: '6px',
                        zIndex: 10
                    }
                }}
            />
        </Box>
    );
};

