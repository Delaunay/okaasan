import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface TimelineItem {
    task: string;
    start: string; // ISO date string
    end: string; // ISO date string
    category?: string;
    progress?: number; // 0-100
}

export const TimelineBlock: React.FC<BlockComponentProps> = ({ block, allBlocks }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const dataSourceBlockId = block.data?.dataSourceBlockId;
    const title = block.data?.title;
    const showProgress = block.data?.showProgress !== false;

    // Get items either from inline data or from referenced spreadsheet block
    const items: TimelineItem[] = React.useMemo(() => {
        // If a data source is specified, try to get data from that block
        if (dataSourceBlockId && allBlocks) {
            const sourceBlock = allBlocks.find(b => b.id === dataSourceBlockId);
            if (sourceBlock && sourceBlock.kind === 'spreadsheet') {
                return parseSpreadsheetData(sourceBlock);
            }
        }
        // Fall back to inline items
        return block.data?.items || [];
    }, [dataSourceBlockId, allBlocks, block.data?.items]);

    // Helper function to parse spreadsheet data into timeline items
    function parseSpreadsheetData(spreadsheetBlock: any): TimelineItem[] {
        const data = spreadsheetBlock.data?.data || [];
        const headers = spreadsheetBlock.data?.headers || [];

        // Find column indices
        const taskIdx = headers.findIndex((h: string) => h.toLowerCase() === 'task');
        const startIdx = headers.findIndex((h: string) => h.toLowerCase() === 'start');
        const endIdx = headers.findIndex((h: string) => h.toLowerCase() === 'end');
        const categoryIdx = headers.findIndex((h: string) => h.toLowerCase() === 'category');
        const progressIdx = headers.findIndex((h: string) => h.toLowerCase() === 'progress');

        if (taskIdx === -1 || startIdx === -1 || endIdx === -1) {
            console.warn('Timeline: Spreadsheet must have "task", "start", and "end" columns');
            return [];
        }

        return data.map((row: string[]) => ({
            task: row[taskIdx] || '',
            start: row[startIdx] || '',
            end: row[endIdx] || '',
            category: categoryIdx >= 0 ? row[categoryIdx] : undefined,
            progress: progressIdx >= 0 ? parseFloat(row[progressIdx]) || 0 : undefined
        })).filter((item: TimelineItem) => item.task && item.start && item.end);
    }

    useEffect(() => {
        let isMounted = true;

        const renderTimeline = async () => {
            try {
                if (isMounted) {
                    setIsLoading(true);
                    setError(null);
                }

                if (items.length === 0) {
                    if (isMounted) {
                        setError('No timeline items to display');
                        setIsLoading(false);
                    }
                    return;
                }

                // Dynamic import of vega-embed
                const vegaEmbed = await import('vega-embed').then((mod) => mod.default);

                if (!containerRef.current || !isMounted) {
                    return;
                }

                // Build Vega-Lite spec for Gantt chart
                const spec = {
                    "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                    "width": "container",
                    "height": Math.max(200, items.length * 40),
                    "padding": 15,
                    "data": {
                        "values": items.map(item => ({
                            task: item.task,
                            start: item.start,
                            end: item.end,
                            category: item.category || 'Default',
                            progress: item.progress !== undefined ? item.progress : 100
                        }))
                    },
                    "layer": [
                        // Full task bar (background)
                        {
                            "mark": {
                                "type": "bar",
                                "cornerRadius": 3,
                                "opacity": 0.3
                            },
                            "encoding": {
                                "y": {
                                    "field": "task",
                                    "type": "nominal",
                                    "title": null,
                                    "axis": {
                                        "labelFontSize": 12,
                                        "labelPadding": 10
                                    }
                                },
                                "x": {
                                    "field": "start",
                                    "type": "temporal",
                                    "title": "Timeline",
                                    "axis": {
                                        "format": "%b %d, %Y",
                                        "labelAngle": -45,
                                        "labelFontSize": 10
                                    }
                                },
                                "x2": {
                                    "field": "end",
                                    "type": "temporal"
                                },
                                "color": {
                                    "field": "category",
                                    "type": "nominal",
                                    "title": "",
                                    "legend": {
                                        "orient": "bottom",
                                        "labelFontSize": 11,
                                        "titleFontSize": 12,
                                        "labelPadding": 8,
                                        "padding": 10,
                                        "rowPadding": 5,
                                        "columnPadding": 45,
                                        "symbolSize": 100,
                                        "titlePadding": 10
                                    }
                                },
                                "tooltip": [
                                    { "field": "task", "type": "nominal", "title": "Task" },
                                    { "field": "start", "type": "temporal", "title": "Start", "format": "%b %d, %Y" },
                                    { "field": "end", "type": "temporal", "title": "End", "format": "%b %d, %Y" },
                                    { "field": "category", "type": "nominal", "title": "Category" }
                                ]
                            }
                        },
                        // Progress bar (if progress is shown)
                        ...(showProgress ? [{
                            "transform": [
                                {
                                    "calculate": "toDate(datum.start) + (toDate(datum.end) - toDate(datum.start)) * (datum.progress / 100)",
                                    "as": "progressEnd"
                                }
                            ],
                            "mark": {
                                "type": "bar",
                                "cornerRadius": 3
                            },
                            "encoding": {
                                "y": {
                                    "field": "task",
                                    "type": "nominal"
                                },
                                "x": {
                                    "field": "start",
                                    "type": "temporal"
                                },
                                "x2": {
                                    "field": "progressEnd",
                                    "type": "temporal"
                                },
                                "color": {
                                    "field": "category",
                                    "type": "nominal"
                                },
                                "tooltip": [
                                    { "field": "task", "type": "nominal", "title": "Task" },
                                    { "field": "progress", "type": "quantitative", "title": "Progress (%)" }
                                ]
                            }
                        }] : [])
                    ],
                    "config": {
                        "view": {
                            "stroke": "transparent"
                        },
                        "axis": {
                            "grid": true,
                            "gridOpacity": 0.2
                        }
                    }
                };

                // Clear previous render
                containerRef.current.innerHTML = '';

                // Render the visualization
                await vegaEmbed(containerRef.current, spec, {
                    actions: {
                        export: true,
                        source: false,
                        compiled: false,
                        editor: false
                    },
                    renderer: 'svg'
                });

                if (isMounted) {
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Timeline rendering error:', err);
                if (isMounted) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to render timeline. Make sure vega-embed is installed.'
                    );
                    setIsLoading(false);
                }
            }
        };

        renderTimeline();

        return () => {
            isMounted = false;
        };
    }, [items, showProgress]);

    return (
        <Box mb={4} position="relative">
            {title && (
                <Text fontSize="md" fontWeight="600" color="gray.800" mb={3}>
                    {title}
                </Text>
            )}

            {error && (
                <Box p={4} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md">
                    <Text color="red.600" fontWeight="bold">
                        Timeline Error
                    </Text>
                    <Text fontSize="sm" color="red.500">
                        {error}
                    </Text>
                </Box>
            )}
            {isLoading && !error && (
                <Box
                    position="absolute"
                    top={title ? '40px' : 0}
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
                    <Text color="gray.600">Loading timeline...</Text>
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


