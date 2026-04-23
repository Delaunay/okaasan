import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface BlocklyData {
    caption?: string;
    height?: number;
    language?: string;
    blocks: any; // Blockly blocks data
}

export interface BlocklyBlockDef extends BlockDef {
    kind: "blockly";
    data: BlocklyData;
}

export class BlocklyBlock extends BlockBase {
    static kind = "blockly";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use Google Blockly to render
        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box
                    bg="gray.100"
                    h={this.def.data.height || 450}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                >
                    <Text color="gray.600">Blockly Visual Programming (not implemented)</Text>
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
