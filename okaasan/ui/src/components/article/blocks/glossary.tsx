import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Heading } from '@chakra-ui/react';

export interface GlossaryData {
    title?: string;
    sortAlphabetically?: boolean;
}

export interface GlossaryBlockDef extends BlockDef {
    kind: "glossary";
    data: GlossaryData;
}

export class GlossaryBlock extends BlockBase {
    static kind = "glossary";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // Glossary is typically auto-generated from definition blocks
        return (
            <Box>
                <Heading size="md" mb={4}>
                    {this.def.data.title || "Glossary"}
                </Heading>
                <Text fontSize="sm" color="gray.500">(Auto-generated from definitions)</Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
