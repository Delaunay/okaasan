import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface BlockquoteBlockDef extends BlockDef {
    kind: "blockquote";
    data: {};
}

/**
 * Markdown: blockquote
 * > Quoted text
 */
export class BlockquoteBlock extends BlockBase {
    static kind = "blockquote";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box
                as="blockquote"
                borderLeft="4px solid"
                borderColor="gray.300"
                pl={3}
                color="gray.600"
            >
                {this.children.length > 0
                    ? this.children.map(child => child.component(mode))
                    : <Text color="gray.400" fontStyle="italic">Empty quote — click to edit</Text>
                }
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const content = this.children.map(child => child.as_markdown(ctx)).join("\n");
        return content
            .split("\n")
            .map(line => `> ${line}`.trimEnd())
            .join("\n");
    }
}
