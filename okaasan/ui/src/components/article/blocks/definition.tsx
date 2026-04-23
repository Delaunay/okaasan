import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Heading } from '@chakra-ui/react';

export interface DefinitionData {
    term: string;
    pronunciation?: string;
    partOfSpeech?: string;
    definition: string;
}

export interface DefinitionBlockDef extends BlockDef {
    kind: "definition";
    data: DefinitionData;
}

export class DefinitionBlock extends BlockBase {
    static kind = "definition";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box p={4} borderLeft="4px solid" borderColor="border.accent" bg="bg.accent.subtle" borderRadius="md">
                <Heading size="md" mb={2}>
                    {this.def.data.term}
                    {this.def.data.pronunciation && (
                        <Text as="span" fontSize="sm" fontWeight="normal" color="fg.muted" ml={2}>
                            ({this.def.data.pronunciation})
                        </Text>
                    )}
                </Heading>
                {this.def.data.partOfSpeech && (
                    <Text fontSize="sm" color="fg.muted" mb={2} fontStyle="italic">
                        {this.def.data.partOfSpeech}
                    </Text>
                )}
                <Text>{this.def.data.definition}</Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return `**${this.def.data.term}**: ${this.def.data.definition}`;
    }
}
