import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface ToggleData {
    title: string;
    content: string;
    defaultOpen?: boolean;
}

export interface ToggleBlockDef extends BlockDef {
    kind: "toggle";
    data: ToggleData;
}

export class ToggleBlock extends BlockBase {
    static kind = "toggle";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return <ToggleDisplay block={this} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `**${this.def.data.title}**\n\n${this.def.data.content}`;
    }
}

function ToggleDisplay({ block }: { block: ToggleBlock }) {
    const [open, setOpen] = useState(block.def.data.defaultOpen || false);
    const content = block.def.data.content || "";

    return (
        <Box>
            <Box
                as="button"
                onClick={() => setOpen(!open)}
                cursor="pointer"
                fontWeight="bold"
                mb={open ? 2 : 0}
            >
                {block.def.data.title || "Toggle"} {open ? '▼' : '▶'}
            </Box>
            {open && (
                <Box>
                    {content
                        ? content.split("\n").map((line, i) => (
                            <Text key={i}>{line}</Text>
                        ))
                        : <Text color="gray.400" fontStyle="italic">Empty toggle content — configure via settings</Text>
                    }
                </Box>
            )}
        </Box>
    );
}
