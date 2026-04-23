import React from 'react';
import { VStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ConstraintBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const constraints = block.data?.constraints || [];
    const caption = block.data?.caption || '';
    const context = block.data?.context || {};

    const handleConstraintsChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('constraints', parsed);
        } catch (err) {
            // Invalid JSON, don't update
        }
    };

    const handleContextChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('context', parsed);
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
                    placeholder="System Constraints"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Context/Variables (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(context, null, 2)}
                    onChange={(e) => handleContextChange(e.target.value)}
                    placeholder={`{"voltage": 12, "current": 2.5, "temp": 75}`}
                    rows={4}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Constraints (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(constraints, null, 2)}
                    onChange={(e) => handleConstraintsChange(e.target.value)}
                    placeholder={`[\n  {\n    "name": "Voltage Range",\n    "expression": "voltage >= 10 && voltage <= 15",\n    "satisfied": true,\n    "description": "Operating voltage must be between 10V and 15V"\n  }\n]`}
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
{`{
  "name": "Constraint name",
  "expression": "Mathematical/logical expression",
  "satisfied": true/false,
  "description": "Optional explanation"
}`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Engineering constraint checker for design validation and requirement tracking.
            </Text>
        </VStack>
    );
};


