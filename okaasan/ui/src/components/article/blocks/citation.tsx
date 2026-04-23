import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface CitationData {
    author: string;
    year?: string;
    page?: string;
    text: string;
}

export interface CitationBlockDef extends BlockDef {
    kind: "citation";
    data: CitationData;
}

export class CitationBlock extends BlockBase {
    static kind = "citation";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box p={3} borderLeft="4px solid" borderColor="border.accent" pl={4} fontStyle="italic">
                <Text>"{this.def.data.text}"</Text>
                <Text fontSize="sm" color="fg.muted" mt={1}>
                    — {this.def.data.author}
                    {this.def.data.year && ` (${this.def.data.year})`}
                    {this.def.data.page && `, p. ${this.def.data.page}`}
                </Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `> "${this.def.data.text}" — ${this.def.data.author}${this.def.data.year ? ` (${this.def.data.year})` : ""}`;
    }
}
