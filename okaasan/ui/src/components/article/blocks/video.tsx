import React, { useState } from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Box, Text, Input } from '@chakra-ui/react';

export interface VideoData {
    url: string;
    caption?: string;
    width?: string
    height?: string
}

export interface VideoBlockDef extends BlockDef {
    kind: "video";
    data: VideoData;
}

export class VideoBlock extends BlockBase {
    static kind = "video";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        if (mode === "edit") {
            return <VideoEditor block={this} />;
        }
        return <VideoEditor block={this} />;
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}

function VideoEditor({ block }: { block: VideoBlock }) {
    if (!block.def.data.url) {
        return <EmptyBlockPlaceholder icon="🎬" label="Video" hint="Configure via settings to add a video URL" />;
    }
    return (
        <Box width={block.def.data.width} height={block.def.data.height}>
            <video src={block.def.data.url} controls style={{width: block.def.data.width, height: block.def.data.height, borderRadius: "8px" }} />
        </Box>
    );
}
