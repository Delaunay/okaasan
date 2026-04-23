import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface GraphData {
    caption?: string;
    height?: number;
    theme?: string;
    graph: any; // LiteGraph graph data
}

export interface GraphBlockDef extends BlockDef {
    kind: "graph";
    data: GraphData;
}

export class GraphBlock extends BlockBase {
    static kind = "graph";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use LiteGraph.js to render
        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box
                    bg="gray.100"
                    h={this.def.data.height || 400}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                >
                    <Text color="gray.600">Visual Graph (LiteGraph.js not implemented)</Text>
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
