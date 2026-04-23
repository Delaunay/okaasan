import React, { useState, useRef } from 'react';
import { Box, Heading } from '@chakra-ui/react';
import { Input } from '@chakra-ui/react';

import {BlockBase, BlockDef, MarkdownGeneratorContext} from "../base";


export interface HeadingData {
    text: string;
    level: number;
  }
  
export interface HeadingBlockDef extends BlockDef {
    kind: "heading";
    data: HeadingData;
  }


type HeadingSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | undefined;

const fontSizeMap: Record<number, HeadingSize> = {
    1: '2xl',
    2: 'xl',
    3: 'lg',
    4: 'md',
    5: 'sm',
    6: 'xs'
};

export class HeadingBlock extends BlockBase {
    static kind = "heading";
 
    static {
        this.register(); 
    }

    component(mode: string) {
        return <HeadingDisplay block={this} mode="view"></HeadingDisplay>
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const level = Math.min(Math.max(this.def.data.level || 1, 1), 6); // clamp 1..6
        const text = this.def.data.text ?? "";
        const inline = this.children.map(child => child.as_markdown(ctx)).join("");
        const spacer = text && inline ? " " : "";
        return `${"#".repeat(level)} ${text}${spacer}${inline}`;
    }
}


 
function HeadingDisplay({block, mode}: {block: HeadingBlock, mode:string}) {
    const [text, setText] = useState(block.def.data.text || "");

    switch (mode) {
        case "view":
            return (
                <Heading 
                    key={block.def.id}
                    size={fontSizeMap[block.def.data.level || 1]}
                    >
                    {block.def.data.text}{block.children.map(child => child.component(mode))}
                </Heading>)

        // Edit
        case "edit":
            const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                setText(e.target.value);
                block.def.data.text = e.target.value;
                block.version += 1;
            }
            return <Input
                value={text}
                fontSize={fontSizeMap[block.def.data.level || 1]}
                onChange={onChange}
                placeholder="Heading text..."
                size="sm"
                style={{ outline: block.edit ? "2px solid blue" : "none" }}
            /> 
        
        //
        case "debug":
            return (
                <Box  
                    padding="1px" 
                    margin="1px"      
                    border="1px solid"
                    borderColor="grey.400"
                > 
                    {block.def.kind}
                    {block.children.map(child => child.react())}
                </Box>
            ) 
    }
}