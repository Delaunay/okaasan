import React from 'react';
import { VStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const FileTreeBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || '';
    const tree = block.data?.tree || [];

    const handleTreeChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('tree', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Title (Optional)
                </Text>
                <Input
                    size="sm"
                    value={title}
                    onChange={(e) => onChange('title', e.target.value)}
                    placeholder="Project Structure"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    File Tree (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(tree, null, 2)}
                    onChange={(e) => handleTreeChange(e.target.value)}
                    placeholder={`[\n  {\n    "name": "src",\n    "type": "folder",\n    "children": [\n      { "name": "index.ts", "type": "file" }\n    ]\n  }\n]`}
                    rows={12}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Format:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
{`[
  {
    "name": "folder-name",
    "type": "folder",
    "children": [
      { "name": "file.txt", "type": "file" }
    ]
  }
]`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Collapsible file/directory tree viewer. Folders are expandable.
            </Text>
        </VStack>
    );
};


