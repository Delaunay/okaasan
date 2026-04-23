import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface WorkflowNode {
    id: string;
    type: string;
    label: string;
}

export interface WorkflowData {
    caption?: string;
    layout?: string;
    nodes: WorkflowNode[];
}

export interface WorkflowBlockDef extends BlockDef {
    kind: "workflow";
    data: WorkflowData;
}

export class WorkflowBlock extends BlockBase {
    static kind = "workflow";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const nodes = this.def.data.nodes || [];
        const layout = this.def.data.layout || "vertical";

        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box display="flex" flexDirection="column" gap={2}>
                    {nodes.map((node, idx) => {
                        const colorPalette =
                            node.type === "start" ? "green" :
                                node.type === "end" ? "red" :
                                    node.type === "decision" ? "yellow" :
                                        "blue";
                        return (
                            <Box
                                key={node.id}
                                p={3}
                                bg="bg.subtle"
                                borderRadius="md"
                                textAlign="center"
                                colorPalette={colorPalette}
                            >
                                <Text fontWeight="bold">{node.label}</Text>
                            </Box>
                        );
                    })}
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
