import React from 'react';
import { VStack, Box, Text, Input, Textarea, HStack, Button } from '@chakra-ui/react';
import { BlockEditorProps } from './BlockTypes';

export const ElectricalDiagramBlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
    const title = block.data?.title || '';
    const width = block.data?.width || 600;
    const height = block.data?.height || 400;
    const componentsJson = JSON.stringify(block.data?.components || [], null, 2);
    const wiresJson = JSON.stringify(block.data?.wires || [], null, 2);

    const handleComponentsChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('components', parsed);
        } catch {
            // Invalid JSON, don't update
        }
    };

    const handleWiresChange = (value: string) => {
        try {
            const parsed = JSON.parse(value);
            onChange('wires', parsed);
        } catch {
            // Invalid JSON, don't update
        }
    };

    const addSampleCircuit = () => {
        onChange('components', [
            { id: 'V1', type: 'battery', value: '9V', x: 100, y: 200, rotation: 90 },
            { id: 'R1', type: 'resistor', value: '1kΩ', x: 250, y: 100, rotation: 0 },
            { id: 'LED1', type: 'led', value: 'Red', x: 400, y: 100, rotation: 0 },
            { id: 'GND', type: 'ground', value: '', x: 500, y: 200, rotation: 0 }
        ]);
        onChange('wires', [
            { points: [[100, 160], [100, 100], [210, 100]] },
            { points: [[290, 100], [360, 100]] },
            { points: [[440, 100], [500, 100], [500, 180]] },
            { points: [[100, 240], [100, 280], [500, 280], [500, 220]] }
        ]);
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
                    placeholder="Circuit diagram title"
                />
            </Box>

            <HStack gap={2}>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Width (px)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={width}
                        onChange={(e) => onChange('width', parseInt(e.target.value) || 600)}
                    />
                </Box>
                <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" mb={1}>
                        Height (px)
                    </Text>
                    <Input
                        size="sm"
                        type="number"
                        value={height}
                        onChange={(e) => onChange('height', parseInt(e.target.value) || 400)}
                    />
                </Box>
            </HStack>

            <Box>
                <HStack justifyContent="space-between" mb={1}>
                    <Text fontSize="sm" fontWeight="600">
                        Components (JSON)
                    </Text>
                    <Button size="xs" onClick={addSampleCircuit} colorScheme="blue">
                        Load Sample Circuit
                    </Button>
                </HStack>
                <Textarea
                    value={componentsJson}
                    onChange={(e) => handleComponentsChange(e.target.value)}
                    placeholder='[{"id": "R1", "type": "resistor", "value": "10kΩ", "x": 100, "y": 100, "rotation": 0}]'
                    rows={12}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box>
                <Text fontSize="sm" fontWeight="600" mb={1}>
                    Wires (JSON)
                </Text>
                <Textarea
                    value={wiresJson}
                    onChange={(e) => handleWiresChange(e.target.value)}
                    placeholder='[{"points": [[100, 100], [200, 100], [200, 200]]}]'
                    rows={8}
                    fontFamily="monospace"
                    fontSize="xs"
                />
            </Box>

            <Box p={3} bg="blue.50" borderRadius="md" fontSize="xs" color="gray.700">
                <Text fontWeight="600" mb={2}>Component Types:</Text>
                <Text mb={1}>resistor, capacitor, inductor, voltage_source, current_source, battery, diode, led, transistor, switch, fuse, ground</Text>
                <Text fontWeight="600" mb={2} mt={2}>Properties:</Text>
                <Text>• id: Component identifier (e.g., "R1", "C1")</Text>
                <Text>• type: Component type from list above</Text>
                <Text>• value: Display value (e.g., "10kΩ", "100μF")</Text>
                <Text>• x, y: Position coordinates</Text>
                <Text>• rotation: Angle in degrees (0, 90, 180, 270)</Text>
            </Box>
        </VStack>
    );
};

