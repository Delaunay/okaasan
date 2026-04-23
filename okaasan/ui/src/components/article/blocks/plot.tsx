import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Spinner } from '@chakra-ui/react';
import React, { useEffect, useRef, useState } from 'react';
import { useVega } from '../../../contexts/VegaContext';
import { useColorMode } from '../../ui/color-mode';

export interface PlotData {
    spec: any; // Vega-Lite spec
    data?: any; // Optional data override
    theme?: string; // Optional theme name (e.g., 'dark', 'excel', 'fivethirtyeight', 'ggplot2', 'latimes', 'quartz', 'vox', 'urbaninstitute')
}

export interface PlotBlockDef extends BlockDef {
    kind: "plot";
    data: PlotData;
}

// Inner component to use hooks
const PlotComponent: React.FC<{ data: PlotData }> = ({ data }) => {
    const { embed, isLoaded, error: loadError } = useVega();
    const { colorMode } = useColorMode();
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderError, setRenderError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoaded || !embed || !containerRef.current || !data.spec) return;

        let finalSpec = data.spec;

        // If data is provided separately, merge it into the spec (similar to old implementation)
        if (data.data && typeof finalSpec === 'object') {
            finalSpec = {
                ...finalSpec,
                data: data.data
            };
        }

        const render = async () => {
            let themeToUse = data.theme;

            // If no theme is specified, use default based on color mode
            if (!themeToUse) {
                themeToUse = colorMode === 'dark' ? 'dark' : undefined;
            }

            let themeConfig = {};
            if (themeToUse) {
                try {
                    // Lazy load themes
                    const themes = await import('vega-themes');
                    // @ts-ignore
                    themeConfig = themes[themeToUse] || {};
                } catch (e) {
                    console.warn('Failed to load vega-themes', e);
                }
            }

            try {
                setRenderError(null);
                await embed(containerRef.current as HTMLElement, finalSpec, {
                    actions: {
                        export: true,
                        source: false,
                        compiled: false,
                        editor: false
                    },
                    renderer: 'svg', // Use SVG for better scaling
                    config: themeConfig
                });
            } catch (err) {
                console.error('Vega rendering error:', err);
                setRenderError(err instanceof Error ? err.message : 'Failed to render plot');
            }
        };

        render();

    }, [isLoaded, embed, data.spec, data.data, data.theme, colorMode]);

    if (loadError) {
        return (
            <Box p={4} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md">
                <Text color="red.600">Failed to load plot library</Text>
            </Box>
        );
    }

    if (!isLoaded) {
        return (
            <Box p={4} bg="gray.50" borderRadius="md" minH="200px" display="flex" alignItems="center" justifyContent="center">
                <Spinner size="sm" mr={2} />
                <Text fontSize="sm" color="gray.600">Loading plot library...</Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {renderError && (
                <Box p={4} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md" mb={2}>
                    <Text color="red.600" fontSize="sm">Error rendering plot: {renderError}</Text>
                </Box>
            )}
            <Box
                ref={containerRef}
                width="100%"
                minHeight="200px"
                className="vega-embed-container"
                css={{
                    width: '100%',
                    '& summary': {
                        // Fix for details/summary toggle in some vega themes
                        listStyle: 'none'
                    },
                    '& .vega-actions': {
                        position: 'absolute',
                        right: 'auto !important',
                        left: '0 !important',
                        top: '0 !important',
                        zIndex: 10,
                        opacity: 0.2,
                        transition: 'opacity 0.2s',
                        '&:hover': {
                            opacity: 1
                        },
                        // Ensure background is semi-transparent or visible
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        padding: '4px',
                        borderRadius: '4px'
                    }
                }}
            />
        </Box>
    );
};

export class PlotBlock extends BlockBase {
    static kind = "plot";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <PlotComponent data={this.def.data as PlotData} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
