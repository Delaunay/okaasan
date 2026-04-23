import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface EmbedData {
    url: string;
    caption?: string;
    aspectRatio?: string;
}

export interface EmbedBlockDef extends BlockDef {
    kind: "embed";
    data: EmbedData;
}

export class EmbedBlock extends BlockBase {
    static kind = "embed";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (!this.def.data.url) {
            return <EmptyBlockPlaceholder icon="🔗" label="Embed" hint="Configure via settings to add an embed URL" />;
        }

        const aspectRatio = this.def.data.aspectRatio || "16/9";
        const [width, height] = aspectRatio.split("/").map(Number);
        const paddingBottom = `${(height / width) * 100}%`;

        return (
            <Box>
                <Box position="relative" width="100%" paddingBottom={paddingBottom}>
                    <Box
                        position="absolute"
                        top={0}
                        left={0}
                        width="100%"
                        height="100%"
                    >
                        <iframe
                            src={this.def.data.url}
                            allowFullScreen
                            style={{
                                borderRadius: "8px",
                                width: "100%",
                                height: "100%",
                                border: "none"
                            }}
                        />
                    </Box>
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
