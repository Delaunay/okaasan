import React from 'react';
import { Box, Table } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const SpreadsheetBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const data = block.data?.data || [['', '']]; // 2D array of cells
    const headers = block.data?.headers || [];
    const showHeaders = block.data?.showHeaders !== false;

    return (
        <Box mb={4} overflowX="auto">
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
                        minWidth: '100px'
                    },
                    '& th': {
                        backgroundColor: 'var(--chakra-colors-gray-50)',
                        fontWeight: '600',
                        color: 'var(--chakra-colors-fg)'
                    },
                    '& tbody tr:hover': readonly ? {} : {
                        backgroundColor: 'var(--chakra-colors-gray-50)'
                    }
                }}
            >
                {showHeaders && headers.length > 0 && (
                    <thead>
                        <tr>
                            {headers.map((header: string, index: number) => (
                                <th key={index}>{header}</th>
                            ))}
                        </tr>
                    </thead>
                )}
                <tbody>
                    {data.map((row: string[], rowIndex: number) => (
                        <tr key={rowIndex}>
                            {row.map((cell: string, cellIndex: number) => (
                                <td key={cellIndex}>
                                    {readonly ? (
                                        cell
                                    ) : (
                                        <input
                                            type="text"
                                            value={cell}
                                            readOnly
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                width: '100%',
                                                outline: 'none'
                                            }}
                                        />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </Box>
        </Box>
    );
};


