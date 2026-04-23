import React from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, BlockSetting, EmptyBlockPlaceholder } from "../base";
import { Box } from '@chakra-ui/react';

export interface AudioData {
    url: string;
    caption?: string;
}

export interface AudioBlockDef extends BlockDef {
    kind: "audio";
    data: AudioData;
}

export class AudioBlock extends BlockBase {
    static kind = "audio";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <AudioEditor block={this} />;
        }
        return <AudioEditor block={this} />;
    }

    settings(): BlockSetting {
        return {
            url:    { "type": "string", "required": false },
            caption:{ "type": "string", "required": false },
        }
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

function AudioEditor({ block }: { block: AudioBlock }) {
    if (!block.def.data.url) {
        return <EmptyBlockPlaceholder icon="🔊" label="Audio" hint="Configure via settings to add an audio URL" />;
    }
    return (
        <Box>
            <audio src={block.def.data.url} controls style={{ width: "100%" }} />
        </Box>
    );
}
