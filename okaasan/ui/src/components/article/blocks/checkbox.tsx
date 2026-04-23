import React from 'react';
import { Box } from '@chakra-ui/react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";

export interface CheckboxData {
    checked: boolean;
}

export interface CheckboxBlockDef extends BlockDef {
    kind: "checkbox";
    data: CheckboxData;
}

/**
 * Markdown: task list checkbox
 * - [x] Done item
 */
export class CheckboxBlock extends BlockBase {
    static kind = "checkbox";

    static {
        this.register();
    }

    component(_mode: string): React.ReactNode {
        return (
            <Box as="span" display="inline-flex" alignItems="center" mr={1}>
                <input type="checkbox" checked={!!this.def.data.checked} readOnly />
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        return this.def.data.checked ? "[x] " : "[ ] ";
    }
}
