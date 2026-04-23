import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Code } from '@chakra-ui/react';

export interface BnfRule {
    name: string;
    definition: string;
}

export interface BnfData {
    caption?: string;
    notation?: string;
    rules: BnfRule[];
}

export interface BnfBlockDef extends BlockDef {
    kind: "bnf";
    data: BnfData;
}

export class BnfBlock extends BlockBase {
    static kind = "bnf";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const rules = this.def.data.rules || [];

        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box display="flex" flexDirection="column" gap={2}>
                    {rules.map((rule, idx) => (
                        <Box key={idx} fontFamily="mono" fontSize="sm">
                            <Text as="span" fontWeight="bold">{rule.name}</Text>
                            <Text as="span" mx={2}>::=</Text>
                            <Text as="span">{rule.definition}</Text>
                        </Box>
                    ))}
                </Box>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const rules = this.def.data.rules || [];
        return rules.map(rule => `${rule.name} ::= ${rule.definition}`).join("\n");
    }
}
