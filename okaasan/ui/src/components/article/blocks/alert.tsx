import React from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Alert } from '@chakra-ui/react';

export interface AlertData {
    type: 'info' | 'success' | 'warning' | 'error';
    title?: string;
    message: string;
}

export interface AlertBlockDef extends BlockDef {
    kind: "alert";
    data: AlertData;
}

export class AlertBlock extends BlockBase {
    static kind = "alert";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const colorPalette = {
            info: 'blue',
            success: 'green',
            warning: 'orange',
            error: 'red'
        }[this.def.data.type] || 'blue';

        return (
            <Alert.Root status={this.def.data.type} colorPalette={colorPalette}>
                <Alert.Title>{this.def.data.title || this.def.data.type}</Alert.Title>
                <Alert.Description>{this.def.data.message}</Alert.Description>
            </Alert.Root>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `> **${this.def.data.title || this.def.data.type}**: ${this.def.data.message}`;
    }
}
