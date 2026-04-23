import React from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface BrBlockDef extends BlockDef {
    kind: "br";
    data: {};
}

/**
 * Markdown: hard line break
 * Line one  (two spaces)
 * Line two
 */
export class BrBlock extends BlockBase {
    static kind = "br";

    static {
        this.register();
    }

    component(_mode: string): React.ReactNode {
        return <br />;
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        return "  \n";
    }
}
