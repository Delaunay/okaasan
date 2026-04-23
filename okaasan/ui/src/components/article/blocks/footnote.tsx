import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Textarea, Input } from '@chakra-ui/react';

export interface FootnoteData {
    number?: string;
    text: string;
    reference?: string;
}

export interface FootnoteBlockDef extends BlockDef {
    kind: "footnote";
    data: FootnoteData;
}

export class FootnoteBlock extends BlockBase {
    static kind = "footnote";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <FootnoteEditor block={this} />;
        }
        return (
            <Box fontSize="sm" color="gray.600">
                <Text as="span" fontWeight="bold">[{this.def.data.number || "*"}]</Text>
                <Text as="span" ml={2}>{this.def.data.text}</Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const num = this.def.data.number || "*";
        return `[^${num}]: ${this.def.data.text}`;
    }
}

function FootnoteEditor({ block }: { block: FootnoteBlock }) {
    const [number, setNumber] = useState(block.def.data.number || "");
    const [text, setText] = useState(block.def.data.text || "");

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNumber(e.target.value);
        block.def.data.number = e.target.value;
        block.version += 1;
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        block.def.data.text = e.target.value;
        block.version += 1;
    };

    return (
        <Box>
            <Input
                value={number}
                onChange={handleNumberChange}
                placeholder="Footnote number"
                mb={2}
                size="sm"
            />
            <Textarea
                value={text}
                onChange={handleTextChange}
                placeholder="Footnote text"
                rows={2}
            />
        </Box>
    );
}
