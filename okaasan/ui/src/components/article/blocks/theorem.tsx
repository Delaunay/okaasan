import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Heading } from '@chakra-ui/react';

export interface TheoremData {
    type?: string;
    number?: string;
    title?: string;
    content: string;
}

export interface TheoremBlockDef extends BlockDef {
    kind: "theorem";
    data: TheoremData;
}

export class TheoremBlock extends BlockBase {
    static kind = "theorem";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const type = this.def.data.type || "theorem";
        const label = type === "proof" ? "Proof" : `Theorem ${this.def.data.number || ""}`;

        return (
            <Box p={4} border="1px solid" borderColor="border.emphasized" borderRadius="md" bg="bg.subtle">
                <Heading size="sm" mb={2}>
                    {this.def.data.title || label}
                </Heading>
                <Text>{this.def.data.content}</Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const type = this.def.data.type || "theorem";
        const label = type === "proof" ? "Proof" : `Theorem ${this.def.data.number || ""}`;
        return `**${this.def.data.title || label}**\n\n${this.def.data.content}`;
    }
}
