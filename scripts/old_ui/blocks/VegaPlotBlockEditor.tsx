import React, { useState } from 'react';
import { Box, VStack, Text, Button, HStack } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';
import Editor from '@monaco-editor/react';

export const VegaPlotBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const [specText, setSpecText] = useState(
        JSON.stringify(block.data?.spec || {}, null, 2)
    );
    const [dataText, setDataText] = useState(
        JSON.stringify(block.data?.data || null, null, 2)
    );
    const [specError, setSpecError] = useState<string | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);

    const handleSpecChange = (value: string | undefined) => {
        if (value === undefined) return;
        setSpecText(value);
        try {
            const parsed = JSON.parse(value);
            onChange('spec', parsed);
            setSpecError(null);
        } catch (err) {
            setSpecError('Invalid JSON');
        }
    };

    const handleDataChange = (value: string | undefined) => {
        if (value === undefined) return;
        setDataText(value);
        try {
            const parsed = value.trim() === '' || value.trim() === 'null' ? null : JSON.parse(value);
            onChange('data', parsed);
            setDataError(null);
        } catch (err) {
            setDataError('Invalid JSON');
        }
    };

    const loadSampleSpec = () => {
        const sample = {
            "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
            "description": "A simple bar chart",
            "data": {
                "values": [
                    { "category": "A", "value": 28 },
                    { "category": "B", "value": 55 },
                    { "category": "C", "value": 43 },
                    { "category": "D", "value": 91 },
                    { "category": "E", "value": 81 }
                ]
            },
            "mark": "bar",
            "encoding": {
                "x": { "field": "category", "type": "nominal" },
                "y": { "field": "value", "type": "quantitative" }
            }
        };
        const text = JSON.stringify(sample, null, 2);
        setSpecText(text);
        handleSpecChange(text);
    };

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2}>
                <Button size="xs" onClick={loadSampleSpec} variant="outline" colorScheme="blue">
                    Load Sample
                </Button>
                <Text fontSize="xs" color="gray.500">
                    <a
                        href="https://vega.github.io/vega-lite/examples/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3182ce', textDecoration: 'underline' }}
                    >
                        Vega-Lite Examples
                    </a>
                </Text>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="bold" mb={1}>
                    Vega/Vega-Lite Specification {specError && <Text as="span" color="red.500" fontWeight="normal">({specError})</Text>}
                </Text>
                <Box
                    border="1px solid"
                    borderColor={specError ? 'red.300' : 'gray.300'}
                    borderRadius="md"
                    overflow="hidden"
                >
                    <Editor
                        height="300px"
                        defaultLanguage="json"
                        value={specText}
                        onChange={handleSpecChange}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            formatOnPaste: true,
                            formatOnType: true,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 4
                        }}
                    />
                </Box>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="bold" mb={1}>
                    Optional: External Data {dataError && <Text as="span" color="red.500" fontWeight="normal">({dataError})</Text>}
                </Text>
                <Text fontSize="xs" color="gray.500" mb={2}>
                    Leave empty if data is already in the spec. Use this to separate data from spec.
                </Text>
                <Box
                    border="1px solid"
                    borderColor={dataError ? 'red.300' : 'gray.300'}
                    borderRadius="md"
                    overflow="hidden"
                >
                    <Editor
                        height="200px"
                        defaultLanguage="json"
                        value={dataText}
                        onChange={handleDataChange}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            formatOnPaste: true,
                            formatOnType: true,
                            lineDecorationsWidth: 10,
                            lineNumbersMinChars: 4
                        }}
                    />
                </Box>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Vega-Lite is a high-level grammar for interactive graphics. Create bar charts, line charts, scatter plots, and more.
            </Text>
        </VStack>
    );
};


