import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Code } from '@chakra-ui/react';

export interface AstData {
    caption?: string;
    sourceCode?: string;
    ast: any;
}

export interface AstBlockDef extends BlockDef {
    kind: "ast";
    data: AstData;
}

export class AstBlock extends BlockBase {
    static kind = "ast";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                {this.def.data.sourceCode && (
                    <Box mb={2}>
                        <Text fontSize="xs" color="gray.600" mb={1}>Source:</Text>
                        <Code fontSize="xs" display="block" p={2} bg="gray.50">
                            {this.def.data.sourceCode}
                        </Code>
                    </Box>
                )}
                <Box>
                    <Text fontSize="xs" color="gray.600" mb={1}>AST:</Text>
                    <Code fontSize="xs" display="block" p={2} bg="gray.50" whiteSpace="pre-wrap">
                        {JSON.stringify(this.def.data.ast, null, 2)}
                    </Code>
                </Box>
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
