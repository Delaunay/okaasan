import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Link } from '@chakra-ui/react';
import React from 'react';

export interface LinkData {
    text: string;
    url: string;
    title?: string;
}

export interface LinkBlockDef extends BlockDef {
    kind: "link";
    data: LinkData;
}

export class LinkBlock extends BlockBase {
    static kind = "link";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Link key={`lnk-${this.key}`} href={this.def.data.url} title={this.def.data.title} color="blue.500" target="_blank" rel="noopener noreferrer">
                {this.children.length > 0 ? this.children.map(child => child.component(mode)) : this.def.data.text}
            </Link>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        const text = this.children.length > 0
            ? this.children.map(child => child.as_markdown(_ctx)).join("")
            : this.def.data.text;
        if (this.def.data.title) {
            return `[${text}](${this.def.data.url} "${this.def.data.title}")`
        }
        return `[${text}](${this.def.data.url})`
    }
}
