import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface CodespanData {
    text: string;
}

export interface CodespanBlockDef extends BlockDef {
    kind: "codespan";
    data: CodespanData;
}

/**
 * Markdown: inline code
 * `code()`
 */
export class CodespanBlock extends BlockBase {
    static kind = "codespan";

    static {
        this.register();
    }

    component(_mode: string): React.ReactNode {
        return <Box as="code" fontFamily="mono">{this.def.data.text}</Box>;
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        return `\`${this.def.data.text}\``;
    }
}
