import React, { useMemo } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock } from '../../ui/src/services/type';

interface GlossaryItem {
    id: number | undefined;
    term: string;
    definition: string;
    pronunciation?: string;
    partOfSpeech?: string;
}

export const GlossaryBlock: React.FC<BlockComponentProps> = ({ block }) => {
    // Get all blocks from the article (passed via extension data)
    const allBlocks = block.data?.allBlocks || [];
    const title = block.data?.title || 'Glossary';
    const sortAlphabetically = block.data?.sortAlphabetically !== false;

    // Extract all definitions from the article blocks (recursive)
    const glossaryItems = useMemo(() => {
        const items: GlossaryItem[] = [];

        const extractDefinitions = (blocks: ArticleBlock[]) => {
            blocks.forEach((blk) => {
                if (blk.kind === 'definition') {
                    items.push({
                        id: blk.id,
                        term: blk.data?.term || 'Unknown Term',
                        definition: blk.data?.definition || '',
                        pronunciation: blk.data?.pronunciation,
                        partOfSpeech: blk.data?.partOfSpeech
                    });
                }

                // Recursively check children
                if (blk.children && blk.children.length > 0) {
                    extractDefinitions(blk.children);
                }
            });
        };

        extractDefinitions(allBlocks);

        // Sort alphabetically if enabled
        if (sortAlphabetically) {
            items.sort((a, b) => a.term.localeCompare(b.term));
        }

        return items;
    }, [allBlocks, sortAlphabetically]);

    // Group by first letter
    const groupedItems = useMemo(() => {
        const groups: { [key: string]: GlossaryItem[] } = {};

        glossaryItems.forEach(item => {
            const firstLetter = item.term[0]?.toUpperCase() || '#';
            if (!groups[firstLetter]) {
                groups[firstLetter] = [];
            }
            groups[firstLetter].push(item);
        });

        return Object.keys(groups).sort().map(letter => ({
            letter,
            items: groups[letter]
        }));
    }, [glossaryItems]);

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

            {glossaryItems.length === 0 ? (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No definitions found in the article
                </Text>
            ) : (
                <VStack align="stretch" gap={4}>
                    {groupedItems.map((group) => (
                        <Box key={group.letter}>
                            <Text
                                fontSize="xl"
                                fontWeight="700"
                                color="blue.600"
                                mb={3}
                                pb={1}
                                borderBottom="2px solid"
                                borderColor="blue.200"
                            >
                                {group.letter}
                            </Text>
                            <VStack align="stretch" gap={3}>
                                {group.items.map((item, index) => (
                                    <Box key={index} pl={2}>
                                        <Box display="flex" alignItems="baseline" gap={2} mb={1}>
                                            <Text fontSize="md" fontWeight="600" color="gray.800">
                                                {item.term}
                                            </Text>
                                            {item.pronunciation && (
                                                <Text fontSize="xs" color="gray.600" fontStyle="italic">
                                                    /{item.pronunciation}/
                                                </Text>
                                            )}
                                            {item.partOfSpeech && (
                                                <Text
                                                    fontSize="xs"
                                                    color="blue.700"
                                                    fontWeight="600"
                                                    px={1.5}
                                                    py={0.5}
                                                    bg="blue.100"
                                                    borderRadius="sm"
                                                >
                                                    {item.partOfSpeech}
                                                </Text>
                                            )}
                                        </Box>
                                        <Text fontSize="sm" color="gray.700" lineHeight="1.6">
                                            {item.definition}
                                        </Text>
                                    </Box>
                                ))}
                            </VStack>
                        </Box>
                    ))}
                </VStack>
            )}
        </Box>
    );
};


