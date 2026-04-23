import React, { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const GraphBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const graphData = block.data?.graph;
    const caption = block.data?.caption;
    const height = block.data?.height || 400;
    const theme = block.data?.theme || 'dark';

    useEffect(() => {
        if (!canvasRef.current || !graphData) return;

        let LiteGraph: any;
        let LGraph: any;
        let LGraphCanvas: any;
        let graph: any;

        const initGraph = async () => {
            try {
                // Dynamic import of litegraph.js
                const LG = await import('litegraph.js');
                LiteGraph = LG.LiteGraph;
                LGraph = LG.LGraph;
                LGraphCanvas = LG.LGraphCanvas;

                // Create graph
                graph = new LGraph();

                // Parse and add nodes from saved data
                if (graphData.nodes) {
                    graphData.nodes.forEach((nodeData: any) => {
                        try {
                            const node = LiteGraph.createNode(nodeData.type);
                            if (node) {
                                node.pos = nodeData.pos || [0, 0];
                                node.size = nodeData.size || node.size;
                                if (nodeData.properties) {
                                    node.properties = { ...node.properties, ...nodeData.properties };
                                }
                                if (nodeData.title) {
                                    node.title = nodeData.title;
                                }
                                graph.add(node);
                            }
                        } catch (err) {
                            console.error('Error creating node:', nodeData.type, err);
                        }
                    });

                    // Connect nodes
                    if (graphData.links) {
                        graphData.links.forEach((link: any) => {
                            try {
                                const originNode = graph._nodes[link.origin_id];
                                const targetNode = graph._nodes[link.target_id];
                                if (originNode && targetNode) {
                                    originNode.connect(link.origin_slot, targetNode, link.target_slot);
                                }
                            } catch (err) {
                                console.error('Error connecting nodes:', err);
                            }
                        });
                    }
                }

                // Create canvas
                const canvas = new LGraphCanvas(canvasRef.current, graph);

                // Configure canvas
                canvas.background_image = null;
                canvas.render_canvas_border = false;
                canvas.render_shadows = theme === 'dark';
                canvas.render_connections_shadows = theme === 'dark';

                // Set read-only mode
                if (readonly) {
                    canvas.allow_dragcanvas = true;
                    canvas.allow_dragnodes = false;
                    canvas.allow_interaction = false;
                    canvas.allow_searchbox = false;
                } else {
                    canvas.allow_dragcanvas = false;
                    canvas.allow_dragnodes = false;
                    canvas.allow_interaction = false;
                }

                // Start execution
                if (readonly) {
                    graph.start(10); // Run at 10 FPS
                }
            } catch (err) {
                console.error('Error initializing LiteGraph:', err);
            }
        };

        initGraph();

        // Cleanup function
        return () => {
            if (graph && graph.running) {
                graph.stop();
            }
        };
    }, [graphData, readonly, theme]);

    if (!graphData) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No graph data defined
                </Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}

            <Box
                border="1px solid"
                borderColor="gray.300"
                borderRadius="md"
                overflow="hidden"
                bg={theme === 'dark' ? 'gray.900' : 'white'}
                width="100%"
            >
                <canvas
                    ref={canvasRef}
                    width="1200px"
                    height={height}
                    style={{
                        display: 'block',
                        width: '100%',
                        height: `${height}px`
                    }}
                />
            </Box>

            <Box mt={2} p={2} bg="blue.50" borderRadius="md">
                <Text fontSize="xs" color="blue.700">
                    <Text as="span" fontWeight="600">Visual Programming Graph</Text>
                    {' '}• Node-based execution flow
                    {readonly && ' • Click and drag to pan, scroll to zoom'}
                </Text>
            </Box>
        </Box>
    );
};

