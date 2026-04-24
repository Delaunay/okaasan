import React, { useState } from 'react';
import {
    Button,
    VStack,
    HStack,
    Text,
    Box,
    Badge,
    Heading
} from '@chakra-ui/react';

// Unit system type
export type UnitSystem = 'metric' | 'us_customary';

interface UnitSystemModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Icons for different unit systems
const MetricIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
);

const USIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
    </svg>
);

const UnitSystemModal: React.FC<UnitSystemModalProps> = ({ isOpen, onClose }) => {
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Get current unit system from localStorage or default to metric
    const getCurrentUnitSystem = (): UnitSystem => {
        const stored = localStorage.getItem('unitSystem');
        return (stored === 'metric' || stored === 'us_customary') ? stored : 'metric';
    };

    const [selectedSystem, setSelectedSystem] = useState<UnitSystem>(getCurrentUnitSystem());

    const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const unitSystems = [
        {
            id: 'metric' as UnitSystem,
            name: 'Metric System',
            description: 'International standard system of measurement',
            icon: <MetricIcon />,
            examples: [
                'Weight: grams (g), kilograms (kg)',
                'Volume: milliliters (ml), liters (l)',
                'Temperature: Celsius (°C)',
                'Length: millimeters (mm), centimeters (cm)'
            ],
            badge: 'International'
        },
        {
            id: 'us_customary' as UnitSystem,
            name: 'US Customary',
            description: 'Traditional measurement system used in the United States',
            icon: <USIcon />,
            examples: [
                'Weight: ounces (oz), pounds (lb)',
                'Volume: teaspoons (tsp), cups, fluid ounces (fl oz)',
                'Temperature: Fahrenheit (°F)',
                'Length: inches (in), feet (ft)'
            ],
            badge: 'US Standard'
        }
    ];

    const handleSave = () => {
        // Save to localStorage
        localStorage.setItem('unitSystem', selectedSystem);

        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('unitSystemChanged', {
            detail: { unitSystem: selectedSystem }
        }));

        showMessage(`Unit system switched to ${unitSystems.find(s => s.id === selectedSystem)?.name}`, 'success');

        setTimeout(() => {
            onClose();
        }, 1500);
    };

    const handleCancel = () => {
        setSelectedSystem(getCurrentUnitSystem());
        setMessage(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 0, 0, 0.6)"
            zIndex={1000}
            display="flex"
            alignItems="center"
            justifyContent="center"
        >
            <Box
                bg="bg"
                borderRadius="md"
                p={6}
                maxW="600px"
                w="90%"
                maxH="90%"
                overflowY="auto"
                boxShadow="xl"
            >
                <VStack gap={6} align="stretch">
                    <HStack justify="space-between">
                        <HStack gap={3}>
                            <Box color="blue.500">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 3H17C18.1 3 19 3.9 19 5V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3M7 5V19H17V5H7M9 7H15V9H9V7M9 11H15V13H9V11M9 15H13V17H9V15Z" />
                                </svg>
                            </Box>
                            <Heading size="lg">Unit System Settings</Heading>
                        </HStack>
                        <Button variant="ghost" onClick={handleCancel}>
                            ✕
                        </Button>
                    </HStack>

                    <Text color="gray.600">
                        Choose your preferred measurement system for displaying recipe ingredients.
                        This affects how quantities are shown throughout the application.
                    </Text>

                    <VStack align="stretch" gap={4}>
                        {unitSystems.map((system) => (
                            <Box
                                key={system.id}
                                p={4}
                                borderWidth="2px"
                                borderRadius="lg"
                                borderColor={selectedSystem === system.id ? 'blue.400' : 'gray.200'}
                                bg={selectedSystem === system.id ? 'blue.50' : 'white'}
                                cursor="pointer"
                                transition="all 0.2s"
                                _hover={{
                                    borderColor: 'blue.300',
                                    bg: 'blue.50'
                                }}
                                onClick={() => setSelectedSystem(system.id)}
                            >
                                <HStack align="start" gap={4}>
                                    <Box
                                        w={5}
                                        h={5}
                                        borderRadius="full"
                                        borderWidth="2px"
                                        borderColor={selectedSystem === system.id ? 'blue.500' : 'gray.300'}
                                        bg={selectedSystem === system.id ? 'blue.500' : 'white'}
                                        mt={1}
                                        position="relative"
                                    >
                                        {selectedSystem === system.id && (
                                            <Box
                                                position="absolute"
                                                top="50%"
                                                left="50%"
                                                transform="translate(-50%, -50%)"
                                                w={2}
                                                h={2}
                                                borderRadius="full"
                                                bg="bg"
                                            />
                                        )}
                                    </Box>
                                    <VStack align="stretch" gap={2} flex="1">
                                        <HStack justify="space-between" align="start">
                                            <HStack gap={3}>
                                                <Box color="blue.600">
                                                    {system.icon}
                                                </Box>
                                                <Box>
                                                    <Text fontWeight="semibold" fontSize="lg">
                                                        {system.name}
                                                    </Text>
                                                    <Badge
                                                        colorScheme="blue"
                                                        variant="subtle"
                                                        size="sm"
                                                    >
                                                        {system.badge}
                                                    </Badge>
                                                </Box>
                                            </HStack>
                                        </HStack>

                                        <Text fontSize="sm" color="gray.600">
                                            {system.description}
                                        </Text>

                                        <Box>
                                            <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
                                                Common units:
                                            </Text>
                                            <VStack align="start" gap={0.5}>
                                                {system.examples.map((example, index) => (
                                                    <Text key={index} fontSize="xs" color="gray.600">
                                                        • {example}
                                                    </Text>
                                                ))}
                                            </VStack>
                                        </Box>
                                    </VStack>
                                </HStack>
                            </Box>
                        ))}
                    </VStack>

                    <Box
                        p={3}
                        bg="orange.50"
                        borderRadius="md"
                        borderLeft="4px solid"
                        borderColor="orange.400"
                    >
                        <Text fontSize="sm" color="orange.800" fontWeight="medium" mb={1}>
                            💡 Note
                        </Text>
                        <Text fontSize="sm" color="orange.700">
                            This setting only affects how units are displayed in the interface.
                            Recipe data supports both systems and can be converted between them using the unit conversion tools.
                        </Text>
                    </Box>

                    {message && (
                        <Box
                            p={3}
                            bg={message.type === 'success' ? 'green.50' : message.type === 'error' ? 'red.50' : 'blue.50'}
                            border="1px"
                            borderColor={message.type === 'success' ? 'green.200' : message.type === 'error' ? 'red.200' : 'blue.200'}
                            borderRadius="md"
                        >
                            <Text fontSize="sm" color={message.type === 'success' ? 'green.800' : message.type === 'error' ? 'red.800' : 'blue.800'}>
                                {message.text}
                            </Text>
                        </Box>
                    )}

                    <HStack gap={3} justify="flex-end">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            onClick={handleSave}
                            disabled={selectedSystem === getCurrentUnitSystem()}
                        >
                            Apply Changes
                        </Button>
                    </HStack>
                </VStack>
            </Box>
        </Box>
    );
};

export { UnitSystemModal };