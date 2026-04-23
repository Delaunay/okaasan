import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Code, Text } from '@chakra-ui/react';

export interface CliData {
    command: string;
    output?: string;
    prompt?: string;
}

export interface CliBlockDef extends BlockDef {
    kind: "cli";
    data: CliData;
}

export class CliBlock extends BlockBase {
    static kind = "cli";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const prompt = this.def.data.prompt || "$";

        return (
            <Box bg="gray.950" color="green.400" p={4} borderRadius="md" fontFamily="mono">
                <Text>
                    <Text as="span" color="gray.400">{prompt} </Text>
                    {this.def.data.command}
                </Text>
                {this.def.data.output && (
                    <Text mt={2} color="white">
                        {this.def.data.output}
                    </Text>
                )}
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const prompt = this.def.data.prompt || "$";
        let md = `\`\`\`bash\n${prompt} ${this.def.data.command}\n`;
        if (this.def.data.output) {
            md += this.def.data.output + "\n";
        }
        md += "```";
        return md;
    }
}
