import React, { useMemo } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

/**
 * Parse CSV/TSV data
 */
function parseDelimited(data: string, delimiter: string): string[][] {
    const lines = data.trim().split('\n');
    return lines.map(line => {
        // Simple parsing (doesn't handle quoted delimiters)
        return line.split(delimiter).map(cell => cell.trim());
    });
}

/**
 * Parse JSON data (array of objects or array of arrays)
 */
function parseJSON(data: string): string[][] {
    try {
        const parsed = JSON.parse(data);

        if (Array.isArray(parsed)) {
            if (parsed.length === 0) return [];

            // Check if it's array of arrays
            if (Array.isArray(parsed[0])) {
                return parsed.map(row => row.map(cell => String(cell)));
            }

            // Array of objects - extract headers and values
            const headers = Object.keys(parsed[0]);
            const rows = parsed.map(obj => headers.map(key => String(obj[key] ?? '')));
            return [headers, ...rows];
        }

        return [];
    } catch (err) {
        console.error('Failed to parse JSON:', err);
        return [];
    }
}

export const TableBlock: React.FC<BlockComponentProps> = ({ block }) => {
    const format = block.data?.format || 'json'; // json, csv, tsv
    const rawData = block.data?.data || '';
    const showHeaders = block.data?.showHeaders !== false;
    const caption = block.data?.caption;

    const tableData = useMemo(() => {
        if (!rawData) return [];

        switch (format) {
            case 'csv':
                return parseDelimited(rawData, ',');
            case 'tsv':
                return parseDelimited(rawData, '\t');
            case 'json':
                return parseJSON(rawData);
            default:
                return [];
        }
    }, [rawData, format]);

    if (tableData.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No data to display
                </Text>
            </Box>
        );
    }

    const headers = showHeaders && tableData.length > 0 ? tableData[0] : null;
    const rows = showHeaders && tableData.length > 1 ? tableData.slice(1) : tableData;

    return (
        <Box mb={4}>
            {caption && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {caption}
                </Text>
            )}
            <Box overflowX="auto">
                <Box
                    as="table"
                    width="100%"
                    borderCollapse="collapse"
                    border="1px solid"
                    borderColor="gray.300"
                    bg="bg"
                    css={{
                        '& td, & th': {
                            border: '1px solid var(--chakra-colors-border)',
                            padding: '0.5rem 0.75rem',
                            textAlign: 'left',
                            fontSize: '0.875rem'
                        },
                        '& th': {
                            backgroundColor: 'var(--chakra-colors-gray-50)',
                            fontWeight: '600',
                            color: 'var(--chakra-colors-fg)'
                        },
                        '& tbody tr:nth-of-type(even)': {
                            backgroundColor: 'var(--chakra-colors-gray-50)'
                        },
                        '& tbody tr:hover': {
                            backgroundColor: 'var(--chakra-colors-gray-100)'
                        }
                    }}
                >
                    {headers && (
                        <thead>
                            <tr>
                                {headers.map((header, index) => (
                                    <th key={index}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </Box>
            </Box>
        </Box>
    );
};


