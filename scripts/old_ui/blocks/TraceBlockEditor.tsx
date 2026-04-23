import React from 'react';
import { VStack, Box, Text, Input, Textarea } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const TraceBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const steps = block.data?.steps || [];
    const caption = block.data?.caption || '';

    const handleStepsChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('steps', parsed);
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
                    placeholder="Execution trace"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Trace Steps (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(steps, null, 2)}
                    onChange={(e) => handleStepsChange(e.target.value)}
                    placeholder={`[\n  {\n    "timestamp": 0,\n    "function": "main()",\n    "line": 1,\n    "type": "call",\n    "variables": {"x": 5}\n  }\n]`}
                    rows={12}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Step Types:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
{`call - Function call (blue)
return - Function return (green)
log - Console/debug log (gray)
error - Error/exception (red)`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                Visual execution trace showing function calls, returns, and variable states. Click steps to see details.
            </Text>
        </VStack>
    );
};


