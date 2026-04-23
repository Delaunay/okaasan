import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Textarea, Input } from '@chakra-ui/react';

export interface ReferenceData {
    citation: string;
    authors?: string;
    title?: string;
    year?: string;
    url?: string;
    doi?: string;
}

export interface ReferenceBlockDef extends BlockDef {
    kind: "reference";
    data: ReferenceData;
}

export class ReferenceBlock extends BlockBase {
    static kind = "reference";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <ReferenceEditor block={this} />;
        }
        return (
            <Box p={3} borderLeft="4px solid" borderColor="blue.500" pl={4}>
                <Text fontSize="sm" fontStyle="italic">
                    {this.def.data.citation}
                </Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `[${this.def.data.citation}]`;
    }
}

function ReferenceEditor({ block }: { block: ReferenceBlock }) {
    const [citation, setCitation] = useState(block.def.data.citation || "");

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCitation(e.target.value);
        block.def.data.citation = e.target.value;
        block.version += 1;
    };

    return (
        <Textarea
            value={citation}
            onChange={handleChange}
            placeholder="Enter citation (e.g., Smith, J. (2024). Title. Publisher.)"
            rows={3}
        />
    );
}
