import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Code } from '@chakra-ui/react';

export interface TraceStep {
    timestamp: number;
    function: string;
    type: string;
    variables?: Record<string, any>;
    message?: string;
}

export interface TraceData {
    caption?: string;
    steps: TraceStep[];
}

export interface TraceBlockDef extends BlockDef {
    kind: "trace";
    data: TraceData;
}

export class TraceBlock extends BlockBase {
    static kind = "trace";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const steps = this.def.data.steps || [];

        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box display="flex" flexDirection="column" gap={2}>
                    {steps.map((step, idx) => {
                        const colorPalette = step.type === "call" ? "blue" : "green";
                        return (
                            <Box
                                key={idx}
                                p={2}
                                bg="bg.subtle"
                                borderRadius="md"
                                borderLeft="4px solid"
                                borderColor="border.accent"
                                colorPalette={colorPalette}
                            >
                                <Text fontSize="sm" fontWeight="bold">
                                    [{step.timestamp}] {step.function}
                                </Text>
                                {step.message && (
                                    <Text fontSize="xs" color="fg.muted" mt={1}>
                                        {step.message}
                                    </Text>
                                )}
                                {step.variables && Object.keys(step.variables).length > 0 && (
                                    <Code fontSize="xs" mt={1} display="block" p={1} bg="bg.canvas">
                                        {JSON.stringify(step.variables, null, 2)}
                                    </Code>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
