import React from 'react';
import { Box, VStack, HStack, Text, Button, Input, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const SpreadsheetBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const data = block.data?.data || [['', '']];
    const headers = block.data?.headers || [];
    const showHeaders = block.data?.showHeaders !== false;

    const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
        const newData = data.map((row: string[], rIdx: number) =>
            rIdx === rowIndex
                ? row.map((cell: string, cIdx: number) => (cIdx === cellIndex ? value : cell))
                : row
        );
        onChange('data', newData);
    };

    const updateHeader = (index: number, value: string) => {
        const newHeaders = [...headers];
        newHeaders[index] = value;
        onChange('headers', newHeaders);
    };

    const addRow = () => {
        const numCols = data[0]?.length || 2;
        const newRow = Array(numCols).fill('');
        onChange('data', [...data, newRow]);
    };

    const addColumn = () => {
        const newData = data.map((row: string[]) => [...row, '']);
        onChange('data', newData);
        if (showHeaders) {
            onChange('headers', [...headers, `Column ${headers.length + 1}`]);
        }
    };

    const deleteRow = (rowIndex: number) => {
        if (data.length > 1) {
            onChange('data', data.filter((_: string[], idx: number) => idx !== rowIndex));
        }
    };

    const deleteColumn = (colIndex: number) => {
        if (data[0]?.length > 1) {
            const newData = data.map((row: string[]) =>
                row.filter((_: string, idx: number) => idx !== colIndex)
            );
            onChange('data', newData);
            if (showHeaders) {
                onChange('headers', headers.filter((_: string, idx: number) => idx !== colIndex));
            }
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2}>
                <Button size="xs" onClick={addRow} variant="outline" colorScheme="blue">
                    Add Row
                </Button>
                <Button size="xs" onClick={addColumn} variant="outline" colorScheme="blue">
                    Add Column
                </Button>
                <Button
                    size="xs"
                    onClick={() => onChange('showHeaders', !showHeaders)}
                    variant={showHeaders ? 'solid' : 'outline'}
                    colorScheme="green"
                >
                    {showHeaders ? 'Hide' : 'Show'} Headers
                </Button>
            </HStack>

            <Box overflowX="auto" maxHeight="400px" overflowY="auto">
                <Box
                    as="table"
                    width="100%"
                    borderCollapse="collapse"
                    border="1px solid"
                    borderColor="gray.300"
                    fontSize="sm"
                    css={{
                        '& td, & th': {
                            border: '1px solid var(--chakra-colors-border)',
                            padding: '0.25rem',
                            minWidth: '80px'
                        },
                        '& th': {
                            backgroundColor: 'var(--chakra-colors-gray-50)',
                            fontWeight: '600'
                        }
                    }}
                >
                    {showHeaders && (
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>#</th>
                                {headers.map((header: string, index: number) => (
                                    <th key={index}>
                                        <Input
                                            value={header}
                                            onChange={(e) => updateHeader(index, e.target.value)}
                                            size="xs"
                                            variant="unstyled"
                                            fontWeight="600"
                                        />
                                    </th>
                                ))}
                                <th style={{ width: '30px' }}></th>
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {data.map((row: string[], rowIndex: number) => (
                            <tr key={rowIndex}>
                                <td style={{ textAlign: 'center', color: '#718096' }}>
                                    {rowIndex + 1}
                                </td>
                                {row.map((cell: string, cellIndex: number) => (
                                    <td key={cellIndex}>
                                        <Input
                                            value={cell}
                                            onChange={(e) =>
                                                updateCell(rowIndex, cellIndex, e.target.value)
                                            }
                                            size="xs"
                                            variant="unstyled"
                                        />
                                    </td>
                                ))}
                                <td style={{ textAlign: 'center' }}>
                                    <IconButton
                                        aria-label="Delete row"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteRow(rowIndex)}
                                        isDisabled={data.length === 1}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </td>
                            </tr>
                        ))}
                        <tr>
                            <td></td>
                            {data[0]?.map((_: string, colIndex: number) => (
                                <td key={colIndex} style={{ textAlign: 'center' }}>
                                    <IconButton
                                        aria-label="Delete column"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteColumn(colIndex)}
                                        isDisabled={data[0]?.length === 1}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </td>
                            ))}
                            <td></td>
                        </tr>
                    </tbody>
                </Box>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Click cells to edit. Use buttons to add/remove rows and columns.
            </Text>
        </VStack>
    );
};


