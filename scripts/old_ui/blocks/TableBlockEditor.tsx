import React, { useState } from 'react';
import { Box, VStack, HStack, Text, Input, Textarea, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const TableBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const format = block.data?.format || 'json';
    const data = block.data?.data || '';
    const showHeaders = block.data?.showHeaders !== false;
    const caption = block.data?.caption || '';

    const [error, setError] = useState<string | null>(null);

    const formats = [
        { value: 'json', label: 'JSON' },
        { value: 'csv', label: 'CSV' },
        { value: 'tsv', label: 'TSV' }
    ];

    const handleDataChange = (value: string) => {
        onChange('data', value);

        // Validate JSON if format is JSON
        if (format === 'json' && value.trim()) {
            try {
                JSON.parse(value);
                setError(null);
            } catch (err) {
                setError('Invalid JSON format');
            }
        } else {
            setError(null);
        }
    };

    const loadSampleData = () => {
        let sample = '';

        switch (format) {
            case 'json':
                sample = JSON.stringify([
                    { "Name": "Alice", "Age": 30, "City": "New York" },
                    { "Name": "Bob", "Age": 25, "City": "San Francisco" },
                    { "Name": "Charlie", "Age": 35, "City": "Chicago" }
                ], null, 2);
                break;
            case 'csv':
                sample = `Name,Age,City
Alice,30,New York
Bob,25,San Francisco
Charlie,35,Chicago`;
                break;
            case 'tsv':
                sample = `Name\tAge\tCity
Alice\t30\tNew York
Bob\t25\tSan Francisco
Charlie\t35\tChicago`;
                break;
        }

        onChange('data', sample);
        setError(null);
    };

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2} justifyContent="space-between">
                <HStack gap={2}>
                    {formats.map((formatOption) => (
                        <Box
                            key={formatOption.value}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            border="2px solid"
                            borderColor={format === formatOption.value ? 'blue.500' : 'gray.200'}
                            bg={format === formatOption.value ? 'blue.50' : 'white'}
                            cursor="pointer"
                            onClick={() => {
                                onChange('format', formatOption.value);
                                setError(null);
                            }}
                            transition="all 0.15s"
                            _hover={{
                                borderColor: 'blue.500',
                                bg: 'blue.50'
                            }}
                        >
                            <Text
                                fontSize="xs"
                                fontWeight={format === formatOption.value ? '600' : 'normal'}
                                color={format === formatOption.value ? 'blue.700' : 'gray.600'}
                            >
                                {formatOption.label}
                            </Text>
                        </Box>
                    ))}
                </HStack>
                <HStack gap={2}>
                    <Button size="xs" onClick={loadSampleData} variant="outline" colorScheme="green">
                        Load Sample
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => onChange('showHeaders', !showHeaders)}
                        variant={showHeaders ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        {showHeaders ? 'Hide' : 'Show'} Headers
                    </Button>
                </HStack>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Table caption"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Data {error && <Text as="span" color="red.500" fontWeight="normal">({error})</Text>}
                </Text>
                <Box
                    border="1px solid"
                    borderColor={error ? 'red.300' : 'gray.300'}
                    borderRadius="md"
                    overflow="hidden"
                >
                    <Textarea
                        value={data}
                        onChange={(e) => handleDataChange(e.target.value)}
                        placeholder={`Enter ${format.toUpperCase()} data...`}
                        rows={12}
                        fontFamily="monospace"
                        fontSize="xs"
                        resize="vertical"
                        css={{
                            borderRadius: 0,
                            border: 'none'
                        }}
                    />
                </Box>
            </Box>

            <Text fontSize="xs" color="gray.500">
                {format === 'json' && 'Enter an array of objects or array of arrays. Objects will automatically generate headers.'}
                {format === 'csv' && 'Enter comma-separated values. First row will be used as headers if "Show Headers" is enabled.'}
                {format === 'tsv' && 'Enter tab-separated values. First row will be used as headers if "Show Headers" is enabled.'}
            </Text>
        </VStack>
    );
};


