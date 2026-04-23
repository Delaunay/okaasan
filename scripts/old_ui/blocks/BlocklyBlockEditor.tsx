import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const BlocklyBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const toolbox = block.data?.toolbox;
    const blocks = block.data?.blocks;
    const caption = block.data?.caption || '';
    const height = block.data?.height || 400;
    const language = block.data?.language || 'JavaScript';

    const handleToolboxChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('toolbox', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    const handleBlocksChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('blocks', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    const languages = ['JavaScript', 'Python', 'PHP', 'Lua', 'Dart'];

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
                    placeholder="Visual Programming Example"
                />
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Height (px)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={height}
                        onChange={(e) => onChange('height', parseInt(e.target.value) || 400)}
                        placeholder="400"
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={2}>
                        Language
                    </Text>
                    <HStack gap={2} flexWrap="wrap">
                        {languages.map((lang) => (
                            <Box
                                key={lang}
                                px={2}
                                py={1}
                                borderRadius="md"
                                border="2px solid"
                                borderColor={language === lang ? 'blue.500' : 'gray.200'}
                                bg={language === lang ? 'blue.50' : 'white'}
                                cursor="pointer"
                                onClick={() => onChange('language', lang)}
                                fontSize="xs"
                            >
                                {lang}
                            </Box>
                        ))}
                    </HStack>
                </Box>
            </HStack>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Toolbox Configuration (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={toolbox ? JSON.stringify(toolbox, null, 2) : ''}
                    onChange={(e) => handleToolboxChange(e.target.value)}
                    placeholder={`{\n  "kind": "categoryToolbox",\n  "contents": [\n    {\n      "kind": "category",\n      "name": "Logic",\n      "colour": "210",\n      "contents": [\n        {"kind": "block", "type": "controls_if"}\n      ]\n    }\n  ]\n}`}
                    rows={8}
                    fontFamily="monospace"
                    fontSize="xs"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Leave empty to use default toolbox
                </Text>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Initial Blocks (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={blocks ? JSON.stringify(blocks, null, 2) : ''}
                    onChange={(e) => handleBlocksChange(e.target.value)}
                    placeholder={`{\n  "blocks": {\n    "languageVersion": 0,\n    "blocks": []\n  }\n}`}
                    rows={8}
                    fontFamily="monospace"
                    fontSize="xs"
                />
                <Text fontSize="xs" color="gray.500" mt={1}>
                    Blockly workspace serialization format
                </Text>
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Common Block Types:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
                    {`controls_if - If statement
controls_repeat_ext - Repeat loop
logic_compare - Comparison
math_arithmetic - Math operations
text_print - Print text
variables_set - Set variable`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Visual block-based programming using Google Blockly. Requires blockly npm package.
            </Text>
        </VStack>
    );
};

