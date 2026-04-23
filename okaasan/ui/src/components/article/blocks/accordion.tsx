import React from 'react';
import { BlockBase, BlockDef, MarkdownGeneratorContext, EmptyBlockPlaceholder } from "../base";
import { Accordion } from '@chakra-ui/react';

export interface AccordionItem {
    title: string;
    content: string;
}

export interface AccordionData {
    allowMultiple?: boolean;
    defaultExpanded?: number[];
    items: AccordionItem[];
}

export interface AccordionBlockDef extends BlockDef {
    kind: "accordion";
    data: AccordionData;
}

export class AccordionBlock extends BlockBase {
    static kind = "accordion";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const items = this.def.data.items || [];
        const allowMultiple = this.def.data.allowMultiple !== false;
        const defaultIndex = this.def.data.defaultExpanded || [];

        if (items.length === 0) {
            return <EmptyBlockPlaceholder icon="▸" label="Accordion" hint="Configure via settings to add sections" />;
        }

        return (
            <Accordion.Root
                multiple={allowMultiple}
                defaultValue={defaultIndex}
                collapsible
            >
                {items.map((item, idx) => (
                    <Accordion.Item key={idx} value={`item-${idx}`}>
                        <Accordion.ItemTrigger>
                            {item.title}
                        </Accordion.ItemTrigger>
                        <Accordion.ItemContent>
                            <Accordion.ItemBody>
                                {item.content.split("\n").map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                            </Accordion.ItemBody>
                        </Accordion.ItemContent>
                    </Accordion.Item>
                ))}
            </Accordion.Root>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
