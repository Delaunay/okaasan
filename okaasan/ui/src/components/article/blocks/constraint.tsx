import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface Constraint {
    name: string;
    expression: string;
    satisfied: boolean;
    description?: string;
}

export interface ConstraintData {
    caption?: string;
    context?: Record<string, any>;
    constraints: Constraint[];
}

export interface ConstraintBlockDef extends BlockDef {
    kind: "constraint";
    data: ConstraintData;
}

export class ConstraintBlock extends BlockBase {
    static kind = "constraint";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const constraints = this.def.data.constraints || [];

        return (
            <Box>
                {this.def.data.caption && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.caption}
                    </Text>
                )}
                <Box display="flex" flexDirection="column" gap={3}>
                    {constraints.map((constraint, idx) => (
                        <Box
                            key={idx}
                            p={3}
                            border="1px solid"
                            borderColor={constraint.satisfied ? "border.success" : "border.error"}
                            borderRadius="md"
                            bg={constraint.satisfied ? "bg.success.subtle" : "bg.error.subtle"}
                        >
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Text fontWeight="bold">{constraint.name}</Text>
                                <Text
                                    fontSize="sm"
                                    colorPalette={constraint.satisfied ? "green" : "red"}
                                >
                                    {constraint.satisfied ? "✓" : "✗"}
                                </Text>
                            </Box>
                            <Text fontSize="sm" fontFamily="mono" mb={1}>
                                {constraint.expression}
                            </Text>
                            {constraint.description && (
                                <Text fontSize="xs" color="fg.muted">
                                    {constraint.description}
                                </Text>
                            )}
                        </Box>
                    ))}
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
