import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface TableRowData {
    header?: boolean;
    text?: string;
}

export interface TableRowBlockDef extends BlockDef {
    kind: "tablerow";
    data: TableRowData;
}

/**
 * Markdown: table row
 * | A | B |
 */
export class TableRowBlock extends BlockBase {
    static kind = "tablerow";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box as="div">
                {this.children.map(child => child.component(mode))}
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const cells = this.children.map(child => child.as_markdown(ctx));
        return `| ${cells.join(" | ")} |`;
    }
}
