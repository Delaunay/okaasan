import {BlockBase, BlockDef,MarkdownGeneratorContext } from "../base";
import { Text } from '@chakra-ui/react';

export interface TextData {
    text: string;
    style?: string;
  }
  
export interface TextBlockDef extends BlockDef {
    kind: "text";
    data: TextData;
}

export class TextBlock extends BlockBase {
    static kind = "text";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // I don't like this the markdown parser should generate only leaf for text
        if (this.children.length > 0) {
            return this.children.map(child => child.component(mode))
        }

        // this also generate <p>
        switch (this.def.data.style) {
            case "strong":
                return <b key={`txt-${this.key}`}>{this.def.data.text}</b>
            case "em":
                return <em key={`txt-${this.key}`}>{this.def.data.text}</em>
            case "del":
                return <del key={`txt-${this.key}`}>{this.def.data.text}</del>
            case "codespan":
                return <code key={`txt-${this.key}`}>{this.def.data.text}</code>
        }
        return <span key={`txt-${this.key}`}>{this.def.data.text}</span>
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const text = this.children.length > 0
            ? this.children.map(child => child.as_markdown(ctx)).join("")
            : this.def.data.text;
        switch (this.def.data.style) {
            case "strong":
                return `__${text}__`
            case "em":
                return `*${text}*`
            case "del":
                return `~~${text}~~`
            case "codespan":
                return `\`${text}\``
        }
        return `${text}`
    }
}



export class InputBlock extends BlockBase {
    static kind = "input";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // I don't like this the markdown parser should generate only leaf for text
        if (this.children.length > 0) {
            return this.children.map(child => child.component(mode))
        }

        // this also generate <p>
        switch (this.def.data.style) {
            case "strong":
                return <b key={`txt-${this.key}`}>{this.def.data.text}</b>
        }
        return <span key={`txt-${this.key}`}>{this.def.data.text}</span>
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const text = this.children.length > 0
            ? this.children.map(child => child.as_markdown(ctx)).join("")
            : this.def.data.text;
        switch (this.def.data.style) {
            case "strong":
                return `__${text}__`
            case "em":
                return `*${text}*`
            case "del":
                return `~~${text}~~`
            case "codespan":
                return `\`${text}\``
        }
        return `${text}`
    }
}

