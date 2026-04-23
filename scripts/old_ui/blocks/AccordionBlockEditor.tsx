import React from 'react';
import { Box, VStack, HStack, Text, Button, Input, Textarea, IconButton } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

const DeleteIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
        <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z" />
    </svg>
);

const MoveUpIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M8 3.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z" />
        <path fillRule="evenodd" d="M7.646 2.646a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8 3.707 5.354 6.354a.5.5 0 1 1-.708-.708l3-3z" />
    </svg>
);

const MoveDownIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path fillRule="evenodd" d="M8 12.5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-1 0v9a.5.5 0 0 0 .5.5z" />
        <path fillRule="evenodd" d="M7.646 13.354a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8 12.293l-2.646-2.647a.5.5 0 0 0-.708.708l3 3z" />
    </svg>
);

export const AccordionBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const items = block.data?.items || [];
    const allowMultiple = block.data?.allowMultiple !== false;

    const addItem = () => {
        const newItems = [...items, { title: 'New Item', content: '' }];
        onChange('items', newItems);
    };

    const updateItem = (index: number, field: 'title' | 'content', value: string) => {
        const newItems = items.map((item: any, i: number) =>
            i === index ? { ...item, [field]: value } : item
        );
        onChange('items', newItems);
    };

    const deleteItem = (index: number) => {
        const newItems = items.filter((_: any, i: number) => i !== index);
        onChange('items', newItems);
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        const newItems = [...items];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < items.length) {
            [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
            onChange('items', newItems);
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <HStack gap={2}>
                <Button size="xs" onClick={addItem} variant="outline" colorScheme="blue">
                    Add Item
                </Button>
                <Button
                    size="xs"
                    onClick={() => onChange('allowMultiple', !allowMultiple)}
                    variant={allowMultiple ? 'solid' : 'outline'}
                    colorScheme="green"
                >
                    {allowMultiple ? 'Multiple Open' : 'Single Open'}
                </Button>
            </HStack>

            {items.length === 0 ? (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No items yet. Click "Add Item" to create one.
                </Text>
            ) : (
                <VStack gap={3} align="stretch">
                    {items.map((item: { title: string; content: string }, index: number) => (
                        <Box
                            key={index}
                            p={3}
                            border="1px solid"
                            borderColor="gray.200"
                            borderRadius="md"
                            bg="gray.50"
                        >
                            <HStack gap={2} mb={2} justifyContent="space-between">
                                <Text fontSize="xs" fontWeight="bold" color="gray.600">
                                    Item {index + 1}
                                </Text>
                                <HStack gap={1}>
                                    <IconButton
                                        aria-label="Move up"
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => moveItem(index, 'up')}
                                        isDisabled={index === 0}
                                    >
                                        <MoveUpIcon />
                                    </IconButton>
                                    <IconButton
                                        aria-label="Move down"
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => moveItem(index, 'down')}
                                        isDisabled={index === items.length - 1}
                                    >
                                        <MoveDownIcon />
                                    </IconButton>
                                    <IconButton
                                        aria-label="Delete"
                                        size="xs"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={() => deleteItem(index)}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </HStack>
                            </HStack>

                            <VStack gap={2} align="stretch">
                                <Box>
                                    <Text fontSize="xs" fontWeight="600" mb={1}>
                                        Title
                                    </Text>
                                    <Input
                                        size="sm"
                                        value={item.title}
                                        onChange={(e) => updateItem(index, 'title', e.target.value)}
                                        placeholder="Accordion item title"
                                    />
                                </Box>
                                <Box>
                                    <Text fontSize="xs" fontWeight="600" mb={1}>
                                        Content
                                    </Text>
                                    <Textarea
                                        size="sm"
                                        value={item.content}
                                        onChange={(e) => updateItem(index, 'content', e.target.value)}
                                        placeholder="Accordion item content"
                                        rows={3}
                                    />
                                </Box>
                            </VStack>
                        </Box>
                    ))}
                </VStack>
            )}

            <Text fontSize="xs" color="gray.500">
                {allowMultiple
                    ? 'Multiple items can be expanded at once.'
                    : 'Only one item can be expanded at a time.'}
            </Text>
        </VStack>
    );
};


