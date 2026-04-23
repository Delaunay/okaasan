import React, { useMemo } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock } from '../../ui/src/services/type';

interface FootnoteItem {
    id: number | undefined;
    index: number;
    text: string;
    reference?: string;
}

export const FootnotesBlock: React.FC<BlockComponentProps> = ({ block }) => {
    // Get all blocks from the article (passed via extension data)
    const allBlocks = block.data?.allBlocks || [];
    const title = block.data?.title || 'Footnotes';
    const showDivider = block.data?.showDivider !== false;

    // Extract all footnotes from the article blocks (recursive)
    const footnotes = useMemo(() => {
        const items: FootnoteItem[] = [];
        let counter = 1;

        const extractFootnotes = (blocks: ArticleBlock[]) => {
            blocks.forEach((blk) => {
                if (blk.kind === 'footnote') {
                    items.push({
                        id: blk.id,
                        index: counter++,
                        text: blk.data?.text || 'No content',
                        reference: blk.data?.reference
                    });
                }

                // Recursively check children
                if (blk.children && blk.children.length > 0) {
                    extractFootnotes(blk.children);
                }
            });
        };

        extractFootnotes(allBlocks);
        return items;
    }, [allBlocks]);

    return (
        <Box mb={6}>
            {showDivider && (
                <Box
                    borderTop="2px solid"
                    borderColor="gray.300"
                    width="40%"
                    mb={4}
                />
            )}

            <Box
                p={4}
                bg="gray.50"
                borderRadius="md"
                border="1px solid"
                borderColor="gray.200"
            >
                <Text
                    fontSize="md"
                    fontWeight="600"
                    color="gray.800"
                    mb={4}
                    letterSpacing="tight"
                >
                    {title}
                </Text>

                {footnotes.length === 0 ? (
                    <Text fontSize="sm" color="gray.500" fontStyle="italic">
                        No footnotes found in the article
                    </Text>
                ) : (
                    <VStack align="stretch" gap={3}>
                        {footnotes.map((footnote) => (
                            <Box
                                key={footnote.index}
                                display="flex"
                                gap={2}
                            >
                                <Text
                                    fontSize="xs"
                                    fontWeight="600"
                                    color="gray.600"
                                    flexShrink={0}
                                    mt={0.5}
                                >
                                    {footnote.index}.
                                </Text>
                                <Box flex={1}>
                                    <Text fontSize="sm" color="gray.700" lineHeight="1.6">
                                        {footnote.text}
                                    </Text>
                                    {footnote.reference && (
                                        <Text fontSize="xs" color="gray.500" mt={1} fontStyle="italic">
                                            — {footnote.reference}
                                        </Text>
                                    )}
                                </Box>
                            </Box>
                        ))}
                    </VStack>
                )}
            </Box>
        </Box>
    );
};


