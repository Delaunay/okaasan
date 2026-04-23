import {BlockBase, BlockDef, MarkdownGeneratorContext} from "../base";
import { Text } from '@chakra-ui/react';

export interface ParagraphData {
    text: string;
  }
  
export interface ParagraphBlockDef extends BlockDef {
    kind: "paragraph";
    data: ParagraphData;
}

export class ParagraphBlock extends BlockBase {
    static kind = "paragraph";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const hasContent = this.def.data.text || this.children.length > 0;
        return <Text key={this.def.id} color={hasContent ? undefined : "gray.400"} fontStyle={hasContent ? undefined : "italic"}>
            {hasContent ? this.def.data.text : "Empty paragraph — click to edit"}
            {this.children.map(child => child.component(mode))}
        </Text>
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const text = this.def.data.text ?? "";
        const inline = this.children.map(child => child.as_markdown(ctx)).join("");
        const spacer = text && inline ? " " : "";
        return `${text}${spacer}${inline}`;
    }
}

