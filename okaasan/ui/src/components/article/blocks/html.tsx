import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface HtmlData {
    raw: string;
    text?: string;
    block?: boolean;
    pre?: boolean;
}

export interface HtmlBlockDef extends BlockDef {
    kind: "html";
    data: HtmlData;
}

/**
 * Markdown: raw HTML
 * <span>Inline HTML</span>
 */
export class HtmlBlock extends BlockBase {
    static kind = "html";

    static {
        this.register();
    }

    component(_mode: string): React.ReactNode {
        const content = this.def.data.raw ?? this.def.data.text ?? "";
        return (
            <Box as="div" whiteSpace="pre-wrap">
                {content}
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        return this.def.data.raw ?? this.def.data.text ?? "";
    }
}
