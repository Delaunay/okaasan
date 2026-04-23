import React, { useRef, useEffect } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

export const ListBlock: React.FC<BlockComponentProps> = ({ block, readonly, onUpdate }) => {
    const items = block.data?.items || [];
    const ordered = block.data?.ordered || false;
    const itemRefs = useRef<(HTMLElement | null)[]>([]);

    useEffect(() => {
        // Ensure refs array matches items length
        itemRefs.current = itemRefs.current.slice(0, items.length);
    }, [items.length]);

    const handleBlur = (index: number) => {
        if (readonly || !onUpdate) return;

        const element = itemRefs.current[index];
        if (!element) return;

        const newText = element.innerText || '';
        const newItems = [...items];
        newItems[index] = newText;

        onUpdate({
            ...block,
            data: {
                ...block.data,
                items: newItems
            }
        });
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLElement>) => {
        if (readonly || !onUpdate) return;

        // Press Enter to create new item
        if (e.key === 'Enter') {
            e.preventDefault();

            // Save current content before adding new item
            const element = itemRefs.current[index];
            if (element) {
                const newText = element.innerText || '';
                const newItems = [...items];
                newItems[index] = newText;
                newItems.splice(index + 1, 0, '');

                onUpdate({
                    ...block,
                    data: {
                        ...block.data,
                        items: newItems
                    }
                });

                // Focus the new item after React renders it
                setTimeout(() => {
                    const newItem = itemRefs.current[index + 1];
                    if (newItem) {
                        newItem.focus();
                    }
                }, 0);
            }
        }

        // Press Backspace on empty item to delete it
        if (e.key === 'Backspace') {
            const element = e.currentTarget;
            const text = element.innerText || '';
            if (text === '' && items.length > 1) {
                e.preventDefault();

                const newItems = items.filter((_: any, i: number) => i !== index);

                onUpdate({
                    ...block,
                    data: {
                        ...block.data,
                        items: newItems
                    }
                });

                // Focus the previous item
                setTimeout(() => {
                    const prevItem = itemRefs.current[Math.max(0, index - 1)];
                    if (prevItem) {
                        prevItem.focus();
                        // Move cursor to end
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(prevItem);
                        range.collapse(false);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }, 0);
            }
        }
    };

    return (
        <Box
            as={ordered ? 'ol' : 'ul'}
            mb={4}
            ml={4}
            css={{
                listStyleType: ordered ? 'decimal' : 'disc',
                listStylePosition: 'outside',
                paddingLeft: '1.5rem'
            }}
        >
            {items.map((item: string, index: number) => (
                <Box as="li" key={index} mb={2}>
                    <Text
                        ref={(el) => {
                            itemRefs.current[index] = el;
                        }}
                        contentEditable={!readonly}
                        suppressContentEditableWarning
                        onBlur={() => handleBlur(index)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        css={
                            !readonly
                                ? {
                                    '&:focus': {
                                        outline: '2px solid var(--chakra-colors-blue-400)',
                                        outlineOffset: '2px',
                                        borderRadius: '4px'
                                    }
                                }
                                : undefined
                        }
                    >
                        {item}
                    </Text>
                </Box>
            ))}
        </Box>
    );
};

