import React from 'react';
import { VStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ASTBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const ast = block.data?.ast;
    const caption = block.data?.caption || '';
    const sourceCode = block.data?.sourceCode || '';

    const handleASTChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('ast', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    return (
        <VStack gap={3} align="stretch">
            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Caption (Optional)
                </Text>
                <Input
                    size="sm"
                    value={caption}
                    onChange={(e) => onChange('caption', e.target.value)}
                    placeholder="Function AST"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Source Code (Optional)
                </Text>
                <Textarea
                    size="sm"
                    value={sourceCode}
                    onChange={(e) => onChange('sourceCode', e.target.value)}
                    placeholder="function add(a, b) { return a + b; }"
                    rows={4}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    AST (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={ast ? JSON.stringify(ast, null, 2) : ''}
                    onChange={(e) => handleASTChange(e.target.value)}
                    placeholder={`{\n  "type": "FunctionDeclaration",\n  "value": "add",\n  "children": [\n    {\n      "type": "Parameter",\n      "value": "a"\n    }\n  ]\n}`}
                    rows={15}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Node Structure:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
{`{
  "type": "NodeType",
  "value": "optional value",
  "attributes": {"key": "value"},
  "children": [...]
}`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Visual Abstract Syntax Tree representation. Click nodes to expand/collapse.
            </Text>
        </VStack>
    );
};


