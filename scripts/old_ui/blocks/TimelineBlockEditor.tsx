import React from 'react';
import { Box, VStack, HStack, Text, Button, Input, IconButton } from '@chakra-ui/react';
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

export const TimelineBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange, allBlocks }) => {
    const items = block.data?.items || [];
    const title = block.data?.title || '';
    const showProgress = block.data?.showProgress !== false;
    const dataSourceBlockId = block.data?.dataSourceBlockId;

    // Find all spreadsheet blocks that could be used as data sources
    const spreadsheetBlocks = allBlocks?.filter(b => b.kind === 'spreadsheet') || [];
    const useDataSource = dataSourceBlockId !== undefined;

    const addItem = () => {
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const newItems = [...items, {
            task: 'New Task',
            start: today,
            end: nextWeek,
            category: 'Default',
            progress: 0
        }];
        onChange('items', newItems);
    };

    const updateItem = (index: number, field: string, value: any) => {
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
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Timeline title (optional)"
                    flex={1}
                />
                <Button
                    size="xs"
                    onClick={() => onChange('showProgress', !showProgress)}
                    variant={showProgress ? 'solid' : 'outline'}
                    colorScheme="green"
                >
                    {showProgress ? 'Show' : 'Hide'} Progress
                </Button>
            </HStack>

            {/* Data Source Selection */}
            {spreadsheetBlocks.length > 0 && (
                <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                    <Text fontSize="xs" fontWeight="bold" color="blue.900" mb={2}>
                        Data Source
                    </Text>
                    <VStack gap={2} align="stretch">
                        <HStack gap={2}>
                            <Button
                                size="xs"
                                onClick={() => {
                                    if (useDataSource) {
                                        onChange('dataSourceBlockId', undefined);
                                    } else {
                                        // Set to first spreadsheet by default
                                        onChange('dataSourceBlockId', spreadsheetBlocks[0].id);
                                    }
                                }}
                                variant={useDataSource ? 'solid' : 'outline'}
                                colorScheme="blue"
                            >
                                {useDataSource ? 'Using Spreadsheet' : 'Use Spreadsheet'}
                            </Button>
                            <Button
                                size="xs"
                                onClick={() => onChange('dataSourceBlockId', undefined)}
                                variant={!useDataSource ? 'solid' : 'outline'}
                                colorScheme="gray"
                            >
                                Manual Entry
                            </Button>
                        </HStack>
                        {useDataSource && (
                            <Box>
                                <Text fontSize="xs" fontWeight="600" mb={1}>
                                    Select Spreadsheet Block:
                                </Text>
                                <Box
                                    as="select"
                                    size="sm"
                                    value={dataSourceBlockId || ''}
                                    onChange={(e: any) => onChange('dataSourceBlockId', parseInt(e.target.value))}
                                    width="100%"
                                    p={1}
                                    borderRadius="md"
                                    border="1px solid"
                                    borderColor="gray.300"
                                    fontSize="xs"
                                >
                                    {spreadsheetBlocks.map((sb: any) => (
                                        <option key={sb.id} value={sb.id}>
                                            Block #{sb.id} {sb.data?.title ? `- ${sb.data.title}` : '(Untitled Spreadsheet)'}
                                        </option>
                                    ))}
                                </Box>
                                <Text fontSize="xs" color="blue.700" mt={2}>
                                    ℹ️ The spreadsheet must have columns: <strong>task</strong>, <strong>start</strong>, <strong>end</strong>, <strong>category</strong> (optional), <strong>progress</strong> (optional)
                                </Text>
                            </Box>
                        )}
                    </VStack>
                </Box>
            )}

            {/* Manual Entry Section - only show if not using data source */}
            {!useDataSource && (
                <>
                    <HStack gap={2}>
                        <Button size="xs" onClick={addItem} variant="outline" colorScheme="blue">
                            Add Task
                        </Button>
                    </HStack>

                    {items.length === 0 ? (
                        <Text fontSize="sm" color="gray.500" fontStyle="italic">
                            No tasks yet. Click "Add Task" to create one.
                        </Text>
                    ) : (
                        <VStack gap={2} align="stretch">
                            {items.map((item: any, index: number) => (
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
                                            Task {index + 1}
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
                                        <Input
                                            size="sm"
                                            value={item.task}
                                            onChange={(e) => updateItem(index, 'task', e.target.value)}
                                            placeholder="Task name"
                                        />
                                        <HStack gap={2}>
                                            <Box flex={1}>
                                                <Text fontSize="xs" fontWeight="600" mb={1}>
                                                    Start Date
                                                </Text>
                                                <Input
                                                    size="sm"
                                                    type="date"
                                                    value={item.start}
                                                    onChange={(e) => updateItem(index, 'start', e.target.value)}
                                                />
                                            </Box>
                                            <Box flex={1}>
                                                <Text fontSize="xs" fontWeight="600" mb={1}>
                                                    End Date
                                                </Text>
                                                <Input
                                                    size="sm"
                                                    type="date"
                                                    value={item.end}
                                                    onChange={(e) => updateItem(index, 'end', e.target.value)}
                                                />
                                            </Box>
                                        </HStack>
                                        <HStack gap={2}>
                                            <Box flex={1}>
                                                <Text fontSize="xs" fontWeight="600" mb={1}>
                                                    Category
                                                </Text>
                                                <Input
                                                    size="sm"
                                                    value={item.category || ''}
                                                    onChange={(e) => updateItem(index, 'category', e.target.value)}
                                                    placeholder="Category"
                                                />
                                            </Box>
                                            {showProgress && (
                                                <Box flex={1}>
                                                    <Text fontSize="xs" fontWeight="600" mb={1}>
                                                        Progress (%)
                                                    </Text>
                                                    <Input
                                                        size="sm"
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={item.progress || 0}
                                                        onChange={(e) => updateItem(index, 'progress', parseInt(e.target.value) || 0)}
                                                    />
                                                </Box>
                                            )}
                                        </HStack>
                                    </VStack>
                                </Box>
                            ))}
                        </VStack>
                    )}

                    <Text fontSize="xs" color="gray.500">
                        Timeline displays tasks as a Gantt chart with start/end dates and optional progress indicators.
                    </Text>
                </>
            )}
        </VStack>
    );
};


