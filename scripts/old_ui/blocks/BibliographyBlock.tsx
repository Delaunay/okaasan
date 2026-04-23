import React, { useMemo } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';
import { ArticleBlock } from '../../ui/src/services/type';

interface ReferenceItem {
    id: number | undefined;
    citation: string;
    authors?: string;
    title?: string;
    year?: string;
    url?: string;
    doi?: string;
}

export const BibliographyBlock: React.FC<BlockComponentProps> = ({ block }) => {
    // Get all blocks from the article (passed via extension data)
    const allBlocks = block.data?.allBlocks || [];
    const title = block.data?.title || 'Bibliography';
    const style = block.data?.style || 'apa'; // apa, mla, chicago, numbered

    // Extract all references from the article blocks (recursive)
    const references = useMemo(() => {
        const items: ReferenceItem[] = [];

        const extractReferences = (blocks: ArticleBlock[]) => {
            blocks.forEach((blk) => {
                if (blk.kind === 'reference') {
                    items.push({
                        id: blk.id,
                        citation: blk.data?.citation || 'Unknown Reference',
                        authors: blk.data?.authors,
                        title: blk.data?.title,
                        year: blk.data?.year,
                        url: blk.data?.url,
                        doi: blk.data?.doi
                    });
                }

                // Recursively check children
                if (blk.children && blk.children.length > 0) {
                    extractReferences(blk.children);
                }
            });
        };

        extractReferences(allBlocks);
        return items;
    }, [allBlocks]);

    const formatReference = (ref: ReferenceItem, index: number) => {
        if (style === 'numbered') {
            return `[${index + 1}] ${ref.citation}`;
        }
        // Default: display the citation as-is
        return ref.citation;
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

            {references.length === 0 ? (
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No references found in the article
                </Text>
            ) : (
                <VStack align="stretch" gap={3}>
                    {references.map((ref, index) => (
                        <Box
                            key={index}
                            pl={style === 'numbered' ? 0 : 4}
                            css={{
                                position: 'relative',
                                '&::before': style === 'numbered' ? {} : {
                                    content: '""',
                                    position: 'absolute',
                                    left: '0',
                                    top: '10px',
                                    width: '4px',
                                    height: '4px',
                                    borderRadius: '50%',
                                    backgroundColor: '#718096'
                                }
                            }}
                        >
                            <Text fontSize="sm" color="gray.700" lineHeight="1.6">
                                {formatReference(ref, index)}
                            </Text>
                            {ref.url && (
                                <Text fontSize="xs" color="blue.600" mt={1}>
                                    <a
                                        href={ref.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ textDecoration: 'underline' }}
                                    >
                                        {ref.url}
                                    </a>
                                </Text>
                            )}
                            {ref.doi && (
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    DOI: {ref.doi}
                                </Text>
                            )}
                        </Box>
                    ))}
                </VStack>
            )}
        </Box>
    );
};


