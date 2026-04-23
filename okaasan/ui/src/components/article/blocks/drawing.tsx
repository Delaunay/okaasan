import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface DrawingData {
    title?: string;
    width?: number;
    height?: number;
    backgroundColor?: string;
    defaultColor?: string;
    defaultLineWidth?: number;
    imageData?: string;
}

export interface DrawingBlockDef extends BlockDef {
    kind: "drawing";
    data: DrawingData;
}

export class DrawingBlock extends BlockBase {
    static kind = "drawing";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use a canvas-based drawing tool
        return (
            <Box>
                {this.def.data.title && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.title}
                    </Text>
                )}
                <Box
                    bg={this.def.data.backgroundColor || "gray.50"}
                    w={this.def.data.width || 600}
                    h={this.def.data.height || 400}
                    borderRadius="md"
                    border="1px solid"
                    borderColor="gray.300"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                >
                    <Text color="gray.600">Drawing Canvas (not implemented)</Text>
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
