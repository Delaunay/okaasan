import React from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock } from '../../ui/src/services/type';

// This will be resolved via the BlockFactory to avoid circular dependencies
let BlockViewEditor: React.FC<BlockComponentProps>;

export const setBlockViewEditor = (component: React.FC<BlockComponentProps>) => {
    BlockViewEditor = component;
};

export const LayoutBlock: React.FC<BlockComponentProps> = ({
    block,
    readonly,
    onUpdate,
    level = 0,
    onHoverChange,
    hoveredBlockId,
    onDragStart,
    onDragEnd,
    onDrop,
    draggedBlockId
}) => {
    const numColumns = block.data?.columns || 2;
    const columnChildren = block.children || [];

    // Create an array of columns, filling empty slots with placeholders
    const columns = Array.from({ length: numColumns }, (_, index) => {
        const child = columnChildren[index];
        return child || null; // null for empty slots
    });

    return (
        <Box mb={4}>
            <HStack gap={4} align="stretch" flexDirection={{ base: 'column', md: 'row' }}>
                {columns.map((child, index) => (
                    <Box
                        key={child?.id || `empty-column-${index}`}
                        flex={1}
                        p={4}
                        bg="gray.50"
                        borderRadius="md"
                        minW={0}
                    >
                        {child ? (
                            BlockViewEditor && (
                                <BlockViewEditor
                                    block={child}
                                    readonly={readonly}
                                    onUpdate={(updatedChild) => {
                                        if (onUpdate && block.children) {
                                            const newChildren = block.children.map((c) =>
                                                c.id === child.id ? updatedChild : c
                                            );
                                            onUpdate({ ...block, children: newChildren });
                                        }
                                    }}
                                    level={level + 1}
                                    onHoverChange={onHoverChange}
                                    hoveredBlockId={hoveredBlockId}
                                    onDragStart={onDragStart}
                                    onDragEnd={onDragEnd}
                                    onDrop={onDrop}
                                    draggedBlockId={draggedBlockId}
                                />
                            )
                        ) : (
                            // Empty column placeholder (only in edit mode)
                            !readonly && (
                                <Box
                                    textAlign="center"
                                    py={8}
                                    color="gray.400"
                                    border="2px dashed"
                                    borderColor="gray.300"
                                    borderRadius="md"
                                    cursor="pointer"
                                    _hover={{
                                        borderColor: 'blue.400',
                                        color: 'blue.500',
                                        bg: 'blue.50'
                                    }}
                                    onClick={() => {
                                        if (onUpdate) {
                                            const newBlock: ArticleBlock = {
                                                id: Date.now() + Math.random(),
                                                page_id: block.page_id,
                                                parent_id: block.id,
                                                kind: 'paragraph',
                                                data: { text: 'New paragraph' },
                                                children: []
                                            };
                                            const newChildren = [...columnChildren];
                                            newChildren[index] = newBlock;
                                            onUpdate({ ...block, children: newChildren });
                                        }
                                    }}
                                >
                                    <Text fontSize="2xl" mb={2}>
                                        +
                                    </Text>
                                    <Text fontSize="sm">Click to add content</Text>
                                </Box>
                            )
                        )}
                    </Box>
                ))}
            </HStack>
            {columnChildren.length > numColumns && (
                <Text fontSize="xs" color="orange.600" mt={2}>
                    Note: {columnChildren.length - numColumns} child block(s) hidden (only showing{' '}
                    {numColumns} column(s))
                </Text>
            )}
        </Box>
    );
};


