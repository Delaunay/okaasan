import React, { useState, useEffect } from 'react';
import { Box, Button, Container, Heading, VStack, HStack, Textarea, Text } from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import { GraphBlock } from '../../../old_ui/blocks/GraphBlock';
import { BlocklyBlock } from '../../../old_ui/blocks/BlocklyBlock';
import { CodeBlock } from '../../../old_ui/blocks/CodeBlock';

const CodeVisualization: React.FC = () => {
    // State for each format
    const [textCode, setTextCode] = useState(`# Sample Python Code
def hello_world():
    print("Hello, World!")
    return 42

result = hello_world()
print(f"Result: {result}")`);

    const [graphData, setGraphData] = useState<any>(null);
    const [blocklyData, setBlocklyData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Don't set mock data initially - let user click the convert button
    // This avoids loading Blockly multiple times
    useEffect(() => {
        // Initialize with mock data for LiteGraph format only
        // Using proper types that LiteGraph expects
        setGraphData({
            nodes: [
                {
                    id: 0,
                    type: 'basic/number',
                    pos: [100, 100],
                    size: [180, 30],
                    properties: { value: 10 },
                    title: 'Number Input'
                },
                {
                    id: 1,
                    type: 'basic/number',
                    pos: [100, 200],
                    size: [180, 30],
                    properties: { value: 20 },
                    title: 'Another Number'
                },
                {
                    id: 2,
                    type: 'basic/number',
                    pos: [300, 150],
                    size: [180, 30],
                    properties: { value: 0 },
                    title: 'Result'
                }
            ],
            links: [
                {
                    origin_id: 0,
                    origin_slot: 0,
                    target_id: 2,
                    target_slot: 0
                },
                {
                    origin_id: 1,
                    origin_slot: 0,
                    target_id: 2,
                    target_slot: 1
                }
            ]
        });

        // Don't set blocklyData here - wait for user to click convert
        // setBlocklyData(null);
    }, []);

    const handleTextToGraph = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await recipeAPI.textToGraph(textCode);
            setGraphData(result);
        } catch (err: any) {
            setError(err.message || 'Failed to convert text to graph');
            console.error('Text to graph conversion error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTextToBlockly = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await recipeAPI.textToBlock(textCode);
            console.log('Blockly conversion result:', result);
            setBlocklyData(result);
        } catch (err: any) {
            setError(err.message || 'Failed to convert text to Blockly');
            console.error('Text to Blockly conversion error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGraphToText = async () => {
        if (!graphData) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await recipeAPI.graphToText(graphData);
            setTextCode(result.code);
        } catch (err: any) {
            setError(err.message || 'Failed to convert graph to text');
            console.error('Graph to text conversion error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBlocklyToText = async () => {
        if (!blocklyData) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await recipeAPI.blockToText(blocklyData);
            setTextCode(result.code);
        } catch (err: any) {
            setError(err.message || 'Failed to convert Blockly to text');
            console.error('Blockly to text conversion error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConvertAll = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [graphResult, blocklyResult] = await Promise.all([
                recipeAPI.textToGraph(textCode),
                recipeAPI.textToBlock(textCode)
            ]);
            console.log('Graph conversion result:', graphResult);
            console.log('Blockly conversion result:', blocklyResult);
            console.log('Blockly blocks array:', blocklyResult?.blocks?.blocks);
            setGraphData(graphResult);
            setBlocklyData(blocklyResult);
        } catch (err: any) {
            setError(err.message || 'Failed to convert code');
            console.error('Conversion error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Container maxW="container.xl" py={8}>
            <VStack gap={8} align="stretch">
                <Box>
                    <Heading size="2xl" mb={2}>Code Visualization Studio</Heading>
                    <Text color="gray.600">
                        View and edit code in three different formats: Visual Graph Nodes, Blockly Visual Programming, and Traditional Text Code
                    </Text>
                </Box>

                {error && (
                    <Box bg="red.50" color="red.800" p={4} borderRadius="md" borderLeft="4px solid" borderColor="red.500">
                        <Text fontWeight="bold">Error:</Text>
                        <Text>{error}</Text>
                    </Box>
                )}

                {/* Convert All Button */}
                <Box textAlign="center">
                    <Button
                        colorScheme="blue"
                        size="lg"
                        onClick={handleConvertAll}
                        loading={isLoading}
                    >
                        🔄 Convert Text to All Formats
                    </Button>
                </Box>

                {/* Text Code Block */}
                <Box borderWidth={2} borderColor="blue.500" borderRadius="lg" p={6} bg="bg">
                    <VStack gap={4} align="stretch">
                        <HStack justify="space-between">
                            <Heading size="lg">1. Text-Based Code Editor</Heading>
                            <HStack>
                                <Button
                                    colorScheme="green"
                                    size="sm"
                                    onClick={handleTextToGraph}
                                    loading={isLoading}
                                >
                                    → Graph
                                </Button>
                                <Button
                                    colorScheme="purple"
                                    size="sm"
                                    onClick={handleTextToBlockly}
                                    loading={isLoading}
                                >
                                    → Blockly
                                </Button>
                            </HStack>
                        </HStack>

                        <Textarea
                            value={textCode}
                            onChange={(e) => setTextCode(e.target.value)}
                            fontFamily="monospace"
                            fontSize="sm"
                            minHeight="300px"
                            bg="gray.50"
                            p={4}
                        />

                        <CodeBlock
                            block={{
                                id: 1,
                                kind: 'code',
                                data: {
                                    language: 'python',
                                    code: textCode
                                }
                            }}
                            readonly={true}
                        />
                    </VStack>
                </Box>

                {/* Visual Graph Nodes Block */}
                <Box borderWidth={2} borderColor="green.500" borderRadius="lg" p={6} bg="bg">
                    <VStack gap={4} align="stretch">
                        <HStack justify="space-between">
                            <Heading size="lg">2. Visual Programming with Graph Nodes</Heading>
                            <HStack>
                                <Button
                                    colorScheme="blue"
                                    size="sm"
                                    onClick={handleGraphToText}
                                    loading={isLoading}
                                    disabled={!graphData}
                                >
                                    → Text
                                </Button>
                            </HStack>
                        </HStack>

                        <Box minHeight="500px" bg="gray.50" borderRadius="md" p={4}>
                            {graphData ? (
                                <GraphBlock
                                    block={{
                                        id: 2,
                                        kind: 'graph',
                                        data: {
                                            graph: graphData,
                                            height: 500
                                        }
                                    }}
                                    readonly={false}
                                />
                            ) : (
                                <Text color="gray.500" textAlign="center" py={10}>
                                    No graph data available. Click "Convert Text to All Formats" or "→ Graph" above.
                                </Text>
                            )}
                        </Box>
                    </VStack>
                </Box>

                {/* Blockly Visual Programming Block */}
                <Box borderWidth={2} borderColor="purple.500" borderRadius="lg" p={6} bg="bg">
                    <VStack gap={4} align="stretch">
                        <HStack justify="space-between">
                            <Heading size="lg">3. Blockly Visual Programming</Heading>
                            <HStack>
                                <Button
                                    colorScheme="blue"
                                    size="sm"
                                    onClick={handleBlocklyToText}
                                    loading={isLoading}
                                    disabled={!blocklyData}
                                >
                                    → Text
                                </Button>
                            </HStack>
                        </HStack>

                        <Box minHeight="500px" bg="gray.50" borderRadius="md" p={4}>
                            <>
                                <BlocklyBlock
                                    block={{
                                        id: 3,
                                        kind: 'blockly',
                                        data: {
                                            blocks: null,
                                            height: 500,
                                            language: 'Python'
                                        }
                                    }}
                                    readonly={true}
                                />
                            </>
                        </Box>
                    </VStack>
                </Box>

                {/* Information Section */}
                <Box bg="blue.50" p={6} borderRadius="lg">
                    <Heading size="md" mb={4}>About Code Visualization</Heading>
                    <VStack align="stretch" gap={3}>
                        <Text>
                            <strong>Graph Nodes:</strong> Visualize code as a flow graph where nodes represent functions, statements, and operations connected by execution flow.
                        </Text>
                        <Text>
                            <strong>Blockly:</strong> Visual block-based programming interface similar to Scratch, making code more accessible and visual.
                        </Text>
                        <Text>
                            <strong>Text Code:</strong> Traditional text-based code editor with syntax highlighting and editing capabilities.
                        </Text>
                        <Text color="blue.700" fontSize="sm" mt={2}>
                            Note: Conversion functions are currently being implemented. Mock data is shown for demonstration purposes.
                        </Text>
                    </VStack>
                </Box>
            </VStack>
        </Container>
    );
};

export default CodeVisualization;

