import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Code, Text } from '@chakra-ui/react';

export interface SandboxData {
    caption?: string;
    language?: string;
    code: string;
}

export interface SandboxBlockDef extends BlockDef {
    kind: "sandbox";
    data: SandboxData;
}

export class SandboxBlock extends BlockBase {
    static kind = "sandbox";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        // In production, you'd use a code execution sandbox
        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Code display="block" whiteSpace="pre-wrap" p={4} bg="gray.50" borderRadius="md">
                    {this.def.data.code}
                </Code>
                <Text fontSize="xs" color="gray.500" mt={2}>
                    (Code execution sandbox not implemented)
                </Text>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        const lang = this.def.data.language || "javascript";
        return `\`\`\`${lang}\n${this.def.data.code}\n\`\`\``;
    }
}
