import React, { useEffect, useRef } from 'react';
import { Box, Text, Spinner } from '@chakra-ui/react';
import { useVega } from '../../contexts/VegaContext';
import { useColorMode } from '../ui/color-mode';

export interface VegaPlotProps {
    spec: Record<string, any>;
    height?: string;
    configOverrides?: Record<string, any>;
}

/**
 * Build a Vega-Embed config object that keeps every chart visually
 * consistent: transparent background, bottom legend, inherited page font,
 * comfortable axis/legend padding, etc.
 *
 * Individual charts can pass `configOverrides` for per-chart tweaks
 * (e.g. different legend orientation) — the overrides are shallow-merged
 * per top-level key so you can surgically replace just `axis` without
 * losing the rest.
 */
async function buildConfig(
    container: HTMLElement,
    colorMode: string,
    overrides: Record<string, any> = {},
) {
    let bt: Record<string, any> = {};
    if (colorMode === 'dark') {
        try {
            const themes = await import('vega-themes');
            bt = (themes as any).dark || {};
        } catch { /* ignore */ }
    }

    const font = getComputedStyle(container).fontFamily || 'sans-serif';

    const base: Record<string, any> = {
        ...bt,
        background: 'transparent',
        font,
        padding: { left: 5, top: 5, right: 5, bottom: 5 },
        title: { ...bt.title, font },
        axis: {
            ...bt.axis,
            labelFont: font,
            titleFont: font,
            labelPadding: 6,
            titlePadding: 12,
            labelOverlap: true,
            labelSeparation: 8,
        },
        legend: {
            ...bt.legend,
            orient: 'bottom',
            direction: 'horizontal',
            labelFont: font,
            titleFont: font,
            padding: 10,
            labelOffset: 4,
            symbolSize: 100,
            rowPadding: 4,
            columnPadding: 40,
        },
        header: { ...bt.header, labelFont: font, titleFont: font, labelPadding: 10 },
    };

    for (const [key, val] of Object.entries(overrides)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            base[key] = { ...base[key], ...val };
        } else {
            base[key] = val;
        }
    }

    return base;
}

const VegaPlot: React.FC<VegaPlotProps> = ({ spec, height = '300px', configOverrides }) => {
    const { embed, isLoaded, error: loadError } = useVega();
    const { colorMode } = useColorMode();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isLoaded || !embed || !containerRef.current) return;

        const render = async () => {
            const el = containerRef.current as HTMLElement;
            const config = await buildConfig(el, colorMode, configOverrides);

            try {
                await embed(el, spec, {
                    actions: false,
                    renderer: 'svg',
                    config,
                });
            } catch (err: any) {
                console.error('Vega render error:', err);
            }
        };

        render();
    }, [isLoaded, embed, spec, colorMode, configOverrides]);

    if (loadError) {
        return (
            <Box p={4} bg="red.50" borderRadius="md">
                <Text color="red.600" fontSize="sm">Failed to load chart library</Text>
            </Box>
        );
    }

    if (!isLoaded) {
        return (
            <Box p={4} minH={height} display="flex" alignItems="center" justifyContent="center">
                <Spinner size="sm" />
                <Text fontSize="sm" color="gray.500" ml={2}>Loading chart…</Text>
            </Box>
        );
    }

    return (
        <Box
            ref={containerRef}
            width="100%"
            minHeight={height}
            overflow="hidden"
        />
    );
};

export default VegaPlot;
