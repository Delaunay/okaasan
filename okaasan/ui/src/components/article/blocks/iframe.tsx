import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface IframeData {
    url: string;
    caption?: string;
    height?: number;
    allowFullscreen?: boolean;
}

export interface IframeBlockDef extends BlockDef {
    kind: "iframe";
    data: IframeData;
}

export class IframeBlock extends BlockBase {
    static kind = "iframe";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (!this.def.data.url) {
            return <EmptyBlockPlaceholder icon="🌐" label="iFrame" hint="Configure via settings to add a URL" />;
        }
        return (
            <Box>
                <iframe
                    src={this.def.data.url}
                    height={this.def.data.height || 400}
                    width="100%"
                    allowFullScreen={this.def.data.allowFullscreen !== false}
                    style={{ border: "none", borderRadius: "8px" }}
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
