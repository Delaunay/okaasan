import { BlockBase, BlockDef, BlockSetting, MarkdownGeneratorContext } from "../base";
import { HStack, Box, Text } from '@chakra-ui/react';
import React from "react";
import { ItemBlock } from "./item";

export interface LayoutData {
    layout: string;
    column: number;
    widths?: string;
}

export interface LayoutBlockDef extends BlockDef {
    kind: "layout";
    data: LayoutData;
}

function range(n: number) {
    return Array.from({ length: n }, (_, i) => i);
}

function parseWidths(widths: string | undefined, cols: number): string[] {
    if (!widths || !widths.trim()) {
        return Array(cols).fill("1");
    }
    const parts = widths.trim().split(/\s+/);
    while (parts.length < cols) {
        parts.push(parts[parts.length - 1] || "1");
    }
    return parts.slice(0, cols);
}


export class LayoutBlock extends BlockBase {
    static kind = "layout";

    static {
        this.register();
    }

    settings(): BlockSetting {
        return {
            column: { "type": "int",    "required": false },
            widths: { "type": "string", "required": false },
        }
    }

    column(mode: string, n: number): React.ReactNode {
        const cols = Math.max(n || 2, 1);
        while (this.children.length < cols) {
            this.children.push(new ItemBlock(this.article, { kind: "item" } as BlockDef, this));
        }

        const flexValues = parseWidths(this.def.data.widths, cols);

        return <HStack
            gap={4}
            align="stretch"
            flexDirection={{ base: "column", md: "row" }}
            flex="1"
            minH={0}
            width="100%"
        >
            {range(cols).map(i => {
                const child = this.children[i];
                return (
                    <Box key={`lyt-${child.key}`} paddingLeft="20px" flex={flexValues[i]} minH="50px" alignSelf="stretch">
                        {child.react()}
                    </Box>)
            })}
        </HStack>
    }

    component(mode: string): React.ReactNode {
        const cols = this.def.data.column || this.def.data.columns || 2;
        return this.column(mode, cols);
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return this.children.map(child => child.as_markdown(ctx)).join(" ");
    }
}

