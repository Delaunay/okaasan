import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface Model3dData {
    url: string;
    caption?: string;
    height?: number;
    autoRotate?: boolean;
}

export interface Model3dBlockDef extends BlockDef {
    kind: "model3d";
    data: Model3dData;
}

export class Model3dBlock extends BlockBase {
    static kind = "model3d";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use a 3D viewer like three.js or model-viewer
        return (
            <Box>
                <Box
                    bg="gray.100"
                    h={this.def.data.height || 400}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                >
                    <Text color="gray.600">3D Model Viewer (not implemented)</Text>
                </Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" color="gray.600" mt={2} textAlign="center">
                        {this.def.data.caption}
                    </Text>
                )}
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
