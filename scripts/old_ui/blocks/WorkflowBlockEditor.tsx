import React from 'react';
import { VStack, HStack, Box, Text, Input, Textarea, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const WorkflowBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const nodes = block.data?.nodes || [];
    const caption = block.data?.caption || '';
    const layout = block.data?.layout || 'vertical';

    const handleNodesChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('nodes', parsed);
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
                    placeholder="User Registration Workflow"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={2}>
                    Layout
                </Text>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        onClick={() => onChange('layout', 'vertical')}
                        variant={layout === 'vertical' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        Vertical
                    </Button>
                    <Button
                        size="xs"
                        onClick={() => onChange('layout', 'horizontal')}
                        variant={layout === 'horizontal' ? 'solid' : 'outline'}
                        colorScheme="blue"
                    >
                        Horizontal
                    </Button>
                </HStack>
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Workflow Nodes (JSON)
                </Text>
                <Textarea
                    size="sm"
                    value={JSON.stringify(nodes, null, 2)}
                    onChange={(e) => handleNodesChange(e.target.value)}
                    placeholder={`[\n  {"id": "1", "type": "start", "label": "Start"},\n  {"id": "2", "type": "task", "label": "Process Data"},\n  {"id": "3", "type": "end", "label": "End"}\n]`}
                    rows={12}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <Text fontSize="xs" fontWeight="600" color="blue.800" mb={1}>
                    Node Types:
                </Text>
                <Text fontSize="xs" color="blue.700" fontFamily="monospace" whiteSpace="pre-wrap">
{`start - Workflow start (green circle)
end - Workflow end (red circle)
task - Process/action (blue rectangle)
decision - Conditional branch (yellow diamond)
subprocess - Nested workflow (purple rectangle)`}
                </Text>
            </Box>

            <Text fontSize="xs" color="gray.500">
                BPMN-style workflow diagram for process visualization.
            </Text>
        </VStack>
    );
};


