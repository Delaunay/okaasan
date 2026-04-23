import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface TimelineItem {
    task: string;
    start: string;
    end: string;
    category?: string;
    progress?: number;
}

export interface TimelineData {
    title?: string;
    showProgress?: boolean;
    dataSourceBlockId?: number;
    items?: TimelineItem[];
}

export interface TimelineBlockDef extends BlockDef {
    kind: "timeline";
    data: TimelineData;
}

export class TimelineBlock extends BlockBase {
    static kind = "timeline";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const items = this.def.data.items || [];
        const showProgress = this.def.data.showProgress !== false;

        return (
            <Box>
                {this.def.data.title && (
                    <Text fontWeight="bold" mb={4}>{this.def.data.title}</Text>
                )}
                <Box display="flex" flexDirection="column" gap={4}>
                    {items.map((item, idx) => (
                        <Box key={idx} pl={4} borderLeft="2px solid" borderColor="border.accent">
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Text fontWeight="bold">{item.task}</Text>
                                <Text fontSize="sm" color="fg.muted">
                                    {item.start} - {item.end}
                                </Text>
                            </Box>
                            {item.category && (
                                <Text fontSize="sm" color="fg.muted">{item.category}</Text>
                            )}
                            {showProgress && item.progress !== undefined && (
                                <Box mt={2}>
                                    <Box
                                        bg="bg.subtle"
                                        h="4px"
                                        borderRadius="full"
                                        overflow="hidden"
                                    >
                                        <Box
                                            bg="bg.accent"
                                            h="100%"
                                            w={`${item.progress}%`}
                                            transition="width 0.3s"
                                        />
                                    </Box>
                                    <Text fontSize="xs" color="fg.muted" mt={1}>
                                        {item.progress}%
                                    </Text>
                                </Box>
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
