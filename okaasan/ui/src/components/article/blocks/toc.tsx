import React from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, ArticleBlock } from "../base";
import { Box, VStack, Text } from '@chakra-ui/react';
import { useColorModeValue } from '../../ui/color-mode';

export interface TocData {
    title?: string;
    maxLevel?: number;
}

export interface TocBlockDef extends BlockDef {
    kind: "toc";
    data: TocData;
}

interface TOCItem {
    id: number;
    level: number;
    text: string;
}

export class TocBlock extends BlockBase {
    static kind = "toc";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <TableOfContentsBlock block={this} mode={mode} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

const TableOfContentsBlock: React.FC<{ block: TocBlock; mode: string }> = ({ block, mode }) => {
    const title = block.def.data.title || 'Table of Contents';
    const maxLevel = block.def.data.maxLevel || 3;

    // We need to access the root article to find all headings
    const article = block.article;

    const tocItems = (() => {
        const items: TOCItem[] = [];

        // Helper to traverse the block tree
        const traverse = (blocks: ArticleBlock[]) => {
            blocks.forEach((blk) => {
                // We need to check the definition kind directly
                if (blk.def && blk.def.kind === 'heading') {
                    const level = blk.def.data?.level || 1;
                    const text = blk.def.data?.text || 'Untitled';
                    // Need access to the block ID
                    const id = blk.def.id;

                    if (level <= maxLevel) {
                        items.push({
                            id,
                            level,
                            text
                        });
                    }
                }

                // Recursively check children
                // Note: ArticleBlock interface has children: Array<ArticleBlock>
                if (blk.children && blk.children.length > 0) {
                    traverse(blk.children);
                }
            });
        };

        if (article && article.children) {
            traverse(article.children);
        }

        return items;
    })();


    const handleClick = (id: number) => {
        const element = document.querySelector(`[data-block-id="${id}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Color mode values
    const bg = useColorModeValue('gray.50', 'gray.800');
    const borderColor = useColorModeValue('gray.200', 'gray.700');
    const titleColor = useColorModeValue('gray.800', 'white');
    const emptyTextColor = useColorModeValue('gray.500', 'gray.400');
    const itemHoverBg = useColorModeValue('gray.100', 'gray.700');
    const itemColorPrimary = useColorModeValue('gray.800', 'gray.200');
    const itemColorSecondary = useColorModeValue('gray.700', 'gray.300');
    const itemHoverColor = useColorModeValue('gray.800', 'white');
    const bulletColor = useColorModeValue('gray.400', 'gray.500');

    return (
        <Box
            mb={6}
            p={5}
            bg={bg}
            borderRadius="md"
            border="1px solid"
            borderColor={borderColor}
        >
            <Text
                fontSize="lg"
                fontWeight="600"
                color={titleColor}
                mb={4}
                letterSpacing="tight"
            >
                {title}
            </Text>

            {tocItems.length === 0 ? (
                <Text fontSize="sm" color={emptyTextColor} fontStyle="italic">
                    No headings found in the article
                </Text>
            ) : (
                <VStack align="stretch" gap={0}>
                    {tocItems.map((item, index) => {
                        const indent = (item.level - 1) * 16;
                        return (
                            <Box
                                key={`${item.id}-${index}`}
                                pl={`${indent}px`}
                                py={1.5}
                                cursor="pointer"
                                borderRadius="sm"
                                transition="all 0.15s"
                                _hover={{
                                    bg: itemHoverBg,
                                    pl: `${indent + 4}px`
                                }}
                                onClick={() => handleClick(item.id)}
                            >
                                <Text
                                    fontSize={item.level === 1 ? 'sm' : item.level === 2 ? 'sm' : 'xs'}
                                    fontWeight={item.level === 1 ? '600' : item.level === 2 ? '500' : 'normal'}
                                    color={item.level === 1 ? itemColorPrimary : itemColorSecondary}
                                    css={{
                                        '&:hover': {
                                            color: itemHoverColor
                                        }
                                    }}
                                >
                                    {item.level > 1 && (
                                        <Text as="span" color={bulletColor} mr={2}>
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
