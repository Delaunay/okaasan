import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface HrBlockDef extends BlockDef {
    kind: "hr";
    data: { raw?: string };
}

/**
 * Markdown: horizontal rule
 * ---
 */
export class HrBlock extends BlockBase {
    static kind = "hr";

    static {
        this.register();
    }

    component(_mode: string): React.ReactNode {
        return <Box as="hr" borderColor="gray.300" my={2} />;
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        return this.def.data.raw ?? "---";
    }
}
