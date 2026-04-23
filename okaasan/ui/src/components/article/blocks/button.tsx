import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Button } from '@chakra-ui/react';

export interface ButtonData {
    text: string;
    url: string;
    variant?: 'solid' | 'outline' | 'ghost';
    colorScheme?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    openInNewTab?: boolean;
}

export interface ButtonBlockDef extends BlockDef {
    kind: "button";
    data: ButtonData;
}

export class ButtonBlock extends BlockBase {
    static kind = "button";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Button
                as="a"
                href={this.def.data.url}
                target={this.def.data.openInNewTab ? "_blank" : undefined}
                variant={this.def.data.variant || "solid"}
                colorPalette={this.def.data.colorScheme || "blue"}
                size={this.def.data.size || "md"}
            >
                {this.def.data.text}
            </Button>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `[${this.def.data.text}](${this.def.data.url})`;
    }
}
