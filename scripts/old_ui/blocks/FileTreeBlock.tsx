import React, { useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { BlockComponentProps } from './BlockTypes';

interface TreeNode {
    name: string;
    type: 'file' | 'folder';
    children?: TreeNode[];
}

const TreeItem: React.FC<{
    node: TreeNode;
    prefix: string;
    isLast: boolean;
    readonly: boolean;
}> = ({ node, prefix, isLast, readonly }) => {
    const [isOpen, setIsOpen] = useState(true);
    const isFolder = node.type === 'folder';

    // Determine the connector for this item
    const connector = isLast ? '└── ' : '├── ';

    // Determine the prefix for children
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    return (
        <Box>
            <Text
                fontFamily="monospace"
                fontSize="sm"
                color={isFolder ? 'blue.600' : 'gray.700'}
                fontWeight={isFolder ? '600' : 'normal'}
                cursor={isFolder && readonly ? 'pointer' : 'default'}
                _hover={isFolder && readonly ? { bg: 'gray.100' } : {}}
                py={0.5}
                px={2}
                whiteSpace="pre"
                onClick={() => isFolder && readonly && setIsOpen(!isOpen)}
            >
                {prefix}{connector}{node.name}{isFolder ? '/' : ''}
            </Text>

            {isFolder && isOpen && node.children && node.children.length > 0 && (
                <Box>
                    {node.children.map((child, idx) => (
                        <TreeItem
                            key={idx}
                            node={child}
                            prefix={childPrefix}
                            isLast={idx === node.children!.length - 1}
                            readonly={readonly}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
};

export const FileTreeBlock: React.FC<BlockComponentProps> = ({ block, readonly }) => {
    const tree = block.data?.tree || [];
    const title = block.data?.title;

    if (tree.length === 0) {
        return (
            <Box mb={4} p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
                <Text fontSize="sm" color="gray.500" fontStyle="italic">
                    No file tree defined
                </Text>
            </Box>
        );
    }

    return (
        <Box mb={4}>
            {title && (
                <Text fontSize="sm" fontWeight="600" color="gray.700" mb={2}>
                    {title}
                </Text>
            )}
            <Box
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                bg="gray.50"
                py={2}
            >
                {tree.map((node: TreeNode, idx: number) => (
                    <TreeItem
                        key={idx}
                        node={node}
                        prefix=""
                        isLast={idx === tree.length - 1}
                        readonly={readonly}
                    />
                ))}
            </Box>
        </Box>
    );
};


