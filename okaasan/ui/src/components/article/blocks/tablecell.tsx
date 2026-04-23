import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface TableCellData {
    text: string;
    header?: boolean;
    align?: "center" | "left" | "right" | null;
}

export interface TableCellBlockDef extends BlockDef {
    kind: "tablecell";
    data: TableCellData;
}

/**
 * Markdown: table cell
 * | A | B |
 */
export class TableCellBlock extends BlockBase {
    static kind = "tablecell";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box as="span">
                {this.children.length > 0 ? this.children.map(child => child.component(mode)) : this.def.data.text}
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        if (this.children.length > 0) {
            return this.children.map(child => child.as_markdown(ctx)).join("");
        }
        return this.def.data.text ?? "";
    }
}
