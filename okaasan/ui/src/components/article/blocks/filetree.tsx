import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text } from '@chakra-ui/react';

export interface FileTreeNode {
    name: string;
    type: 'file' | 'folder';
    children?: FileTreeNode[];
}

export interface FiletreeData {
    title?: string;
    tree: FileTreeNode[];
}

export interface FiletreeBlockDef extends BlockDef {
    kind: "filetree";
    data: FiletreeData;
}

export class FiletreeBlock extends BlockBase {
    static kind = "filetree";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        return (
            <Box>
                {this.def.data.title && (
                    <Text fontSize="sm" fontWeight="bold" mb={2}>
                        {this.def.data.title}
                    </Text>
                )}
                <Box fontFamily="mono" fontSize="sm" bg="gray.50" p={4} borderRadius="md">
                    {this.renderTree(this.def.data.tree || [], "")}
                </Box>
            </Box>
        );
    }

    private renderTree(nodes: FileTreeNode[], prefix: string): React.ReactNode {
        return (
            <>
                {nodes.map((node, idx) => {
                    const isLast = idx === nodes.length - 1;
                    const currentPrefix = prefix + (isLast ? "└── " : "├── ");
                    const nextPrefix = prefix + (isLast ? "    " : "│   ");

                    return (
                        <Box key={node.name}>
                            <Text>
                                {currentPrefix}
                                {node.type === "folder" ? "📁" : "📄"} {node.name}
                            </Text>
                            {node.children && node.children.length > 0 && (
                                <Box ml={4}>
                                    {this.renderTree(node.children, nextPrefix)}
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </>
        );
    }

    is_md_representable(): boolean {
        return false;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        return "";
    }
}
