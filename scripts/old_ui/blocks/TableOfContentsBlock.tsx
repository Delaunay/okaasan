import React, { useMemo } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock } from '../../ui/src/services/type';

interface TOCItem {
    id: number | undefined;
    level: number;
    text: string;
}

export const TableOfContentsBlock: React.FC<BlockComponentProps> = ({ block }) => {
    // Get all blocks from the article (passed via extension data)
    const allBlocks = block.data?.allBlocks || [];
    const maxLevel = block.data?.maxLevel || 3; // Default: show headings up to level 3
    const title = block.data?.title || 'Table of Contents';

    // Extract all headings from the article blocks (recursive)
    const tocItems = useMemo(() => {
        const items: TOCItem[] = [];

        const extractHeadings = (blocks: ArticleBlock[]) => {
            blocks.forEach((blk) => {
                if (blk.kind === 'heading') {
                    const level = blk.data?.level || 1;
                    const text = blk.data?.text || 'Untitled';

                    // Only include headings up to maxLevel
                    if (level <= maxLevel) {
                        items.push({
                            id: blk.id,
                            level,
                            text
                        });
                    }
                }

                // Recursively check children
                if (blk.children && blk.children.length > 0) {
                    extractHeadings(blk.children);
                }
            });
        };

        extractHeadings(allBlocks);
        return items;
    }, [allBlocks, maxLevel]);

    const handleClick = (id: number | undefined) => {
        if (id) {
            // Scroll to the heading element
            const element = document.querySelector(`[data-block-id="${id}"]`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    return (
        <Box
            mb={6}
            p={5}
            bg="gray.50"
            borderRadius="md"
            border="1px solid"
            borderColor="gray.200"
        >
            <Text
                fontSize="lg"
                fontWeight="600"
                color="gray.800"
                mb={4}
                letterSpacing="tight"
            >
                {title}
            </Text>

            {tocItems.length === 0 ? (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No headings found in the article
                </Text>
            ) : (
                <VStack align="stretch" gap={0}>
                    {tocItems.map((item, index) => {
                        // Calculate indentation based on heading level
                        const indent = (item.level - 1) * 16;

                        return (
                            <Box
                                key={index}
                                pl={`${indent}px`}
                                py={1.5}
                                cursor="pointer"
                                borderRadius="sm"
                                transition="all 0.15s"
                                _hover={{
                                    bg: 'gray.100',
                                    pl: `${indent + 4}px`
                                }}
                                onClick={() => handleClick(item.id)}
                            >
                                <Text
                                    fontSize={item.level === 1 ? 'sm' : item.level === 2 ? 'sm' : 'xs'}
                                    fontWeight={item.level === 1 ? '600' : item.level === 2 ? '500' : 'normal'}
                                    color={item.level === 1 ? 'gray.800' : 'gray.700'}
                                    css={{
                                        '&:hover': {
                                            color: '#2d3748'
                                        }
                                    }}
                                >
                                    {item.level > 1 && (
                                        <Text as="span" color="gray.400" mr={2}>
                                            •
                                        </Text>
                                    )}
                                    {item.text}
                                </Text>
                            </Box>
                        );
                    })}
                </VStack>
            )}
        </Box>
    );
};

