import React, { useState, useRef } from 'react';
import { Box, Heading, ListItem } from '@chakra-ui/react';
import { Input, List } from '@chakra-ui/react';

import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";


export interface ListData {
    items: string[];
    level: number;
    ordered?: boolean;
    start?: number;
    loose?: boolean;
}

export interface ListBlockDef extends BlockDef {
    kind: "list";
    data: ListData;
}

export class ListBlock extends BlockBase {
    static kind = "list";

    static {
        this.register();
    }

    component(mode: string) {
        return <ListDisplay key={`view-${this.key}`} block={this} mode={mode}></ListDisplay>
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const indent = "  ".repeat(ctx.level);
        const ordered = !!this.def.data.ordered;
        const start = this.def.data.start ?? 1;

        const items = this.def.data.items ?
            this.def.data.items.map((item, idx) => {
                const marker = ordered ? `${start + idx}.` : "*";
                return `${indent}${marker} ${item}`
            }).join("\n") :
            "";

        const childrenMd = this.children
            .map((child, idx) => {
                if (child.def.kind === "list") {
                    return `${child.as_markdown(ctx.inc())}`
                }
                const marker = ordered ? `${start + idx}.` : "*";
                return `${indent}${marker} ${child.as_markdown(ctx.inc())}`
            })
            .join("\n");

        if (this.def.data.items?.length) {
            return [items, childrenMd].join("\n");
        }

        return childrenMd;
    }
}



function ListDisplay({ block, mode }: { block: ListBlock, mode: string }) {
    const listItemComponent = (child) => {
        if (child.def.kind == "list")
            return child.component("view")
        return <List.Item key={`li-${block.key}-${child.key}`}>{child.component("view")}</List.Item>
    }

    return (
        <List.Root ps="5">
            {block.def.data.items?.map((text: string, i: number) => (
                <List.Item key={`li-${block.key}-${i}`}>{text}</List.Item>
            ))}
            {block.children.map((child) => (
                listItemComponent(child)
            ))}
        </List.Root>
    )
}