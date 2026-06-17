import { Box } from '@chakra-ui/react';
import {BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder} from "../base";


export interface ItemData {
    items: string[];
    level: number;
  }
  
export interface ItemBlockDef extends BlockDef {
    kind: "item";
    data: ItemData;
  }

export class ItemBlock extends BlockBase {
    // Item block holds a group of children
    static kind = "item";
 
    static {
        this.register(); 
    }

    component(_mode: string) {
        if (this.children.length > 0) {
            if (this.def.data?.listItem) {
                return (
                    <Box display="inline-flex" alignItems="center" flexWrap="wrap">
                        {this.children.map(child => child.component("view"))}
                    </Box>
                );
            }
            return <>{this.children.map(child => child.react())}</>
        }
        return <EmptyBlockPlaceholder icon="📝" label="Empty block" hint="Click to add content" />
    }

    is_md_representable(): boolean {
        // if it is empty, we can use markdown to insert children to this
        // if it is NOT empty, then we can use the existing blocks to insert things
        return this.children.length === 0;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const children = this.children.filter(child => child.def.kind !== "separator");
        if (this.def.data?.listItem) {
            let result = "";
            for (const child of children) {
                const md = child.as_markdown(ctx);
                if (child.is_md_block() && result.length > 0) {
                    result += "\n" + md;
                } else {
                    result += md;
                }
            }
            return result;
        }
        return children.map(child => child.as_markdown(ctx)).join("\n\n");
    }
}
