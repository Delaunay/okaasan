import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Heading } from '@chakra-ui/react';

export interface BibliographyData {
    title?: string;
    style?: string;
}

export interface BibliographyBlockDef extends BlockDef {
    kind: "bibliography";
    data: BibliographyData;
}

export class BibliographyBlock extends BlockBase {
    static kind = "bibliography";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // Bibliography is typically auto-generated from reference blocks
        return (
            <Box>
                <Heading size="md" mb={4}>
                    {this.def.data.title || "References"}
                </Heading>
                <Text fontSize="sm" color="gray.500">(Auto-generated from references)</Text>
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
