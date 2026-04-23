import React from 'react';
import { Box, VStack, HStack, Text, Input, Button, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

export const ListBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const items = block.data?.items || [];

    return (
        <VStack gap={2} align="stretch">
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>List Type:</Text>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        variant={block.data?.ordered ? 'outline' : 'solid'}
                        colorScheme="blue"
                        onClick={() => onChange('ordered', false)}
                        flex={1}
                    >
                        Unordered
                    </Button>
                    <Button
                        size="xs"
                        variant={block.data?.ordered ? 'solid' : 'outline'}
                        colorScheme="blue"
                        onClick={() => onChange('ordered', true)}
                        flex={1}
                    >
                        Ordered
                    </Button>
                </HStack>
            </Box>
            <Box>
                <Text fontSize="xs" fontWeight="medium" mb={1}>Items:</Text>
                <VStack gap={1} align="stretch">
                    {items.map((item: string, index: number) => (
                        <HStack key={index} gap={1}>
                            <Text fontSize="xs" minW="15px">
                                {block.data?.ordered ? `${index + 1}.` : '•'}
                            </Text>
                            <Input
                                value={item}
                                onChange={(e) => {
                                    const newItems = [...items];
                                    newItems[index] = e.target.value;
                                    onChange('items', newItems);
                                }}
                                size="xs"
                            />
                            <IconButton
                                aria-label="Remove item"
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                onClick={() => {
                                    const newItems = items.filter((_: any, i: number) => i !== index);
                                    onChange('items', newItems);
                                }}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </HStack>
                    ))}
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onChange('items', [...items, ''])}
                    >
                        Add Item
                    </Button>
                </VStack>
            </Box>
        </VStack>
    );
};


