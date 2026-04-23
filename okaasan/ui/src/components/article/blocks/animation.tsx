import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Image, Text } from '@chakra-ui/react';

export interface AnimationData {
    type?: string;
    url: string;
    caption?: string;
    width?: string;
    height?: string;
    loop?: boolean;
    autoplay?: boolean;
}

export interface AnimationBlockDef extends BlockDef {
    kind: "animation";
    data: AnimationData;
}

export class AnimationBlock extends BlockBase {
    static kind = "animation";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box>
                <Image
                    src={this.def.data.url}
                    alt={this.def.data.caption || "Animation"}
                    width={this.def.data.width || "auto"}
                    height={this.def.data.height || "auto"}
                    style={{ display: "block" }}
                />
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
