import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface DatastructureData {
    caption?: string;
    type?: string;
    data: any;
}

export interface DatastructureBlockDef extends BlockDef {
    kind: "datastructure";
    data: DatastructureData;
}

export class DatastructureBlock extends BlockBase {
    static kind = "datastructure";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use a data structure visualization library
        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box
                    bg="gray.100"
                    p={4}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    minH="200px"
                >
                    <Text color="gray.600">
                        Data Structure Visualization ({this.def.data.type || "tree"}) (not implemented)
                    </Text>
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
