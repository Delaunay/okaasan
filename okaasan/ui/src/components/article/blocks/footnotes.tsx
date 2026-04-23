import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Heading } from '@chakra-ui/react';

export interface FootnotesData {
    title?: string;
    showDivider?: boolean;
}

export interface FootnotesBlockDef extends BlockDef {
    kind: "footnotes";
    data: FootnotesData;
}

export class FootnotesBlock extends BlockBase {
    static kind = "footnotes";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // Footnotes section is typically auto-generated from footnote blocks
        return (
            <Box>
                {this.def.data.showDivider && <Box borderTop="1px solid" borderColor="gray.300" my={4} />}
                <Heading size="md" mb={4}>
                    {this.def.data.title || "Footnotes"}
                </Heading>
                <Text fontSize="sm" color="gray.500">(Auto-generated from footnotes)</Text>
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
