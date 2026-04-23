import React, { useState } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Heading,
    Badge
} from '@chakra-ui/react';
import { TelegramSettings } from './TelegramSettings';
import { UnitSystemModal } from './UnitSystemModal';

// Icons for different settings sections
const SettingsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z" />
    </svg>
);

const TelegramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

const UnitsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 3H17C18.1 3 19 3.9 19 5V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3M7 5V19H17V5H7M9 7H15V9H9V7M9 11H15V13H9V11M9 15H13V17H9V15Z" />
    </svg>
);

interface SettingsSection {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
    onOpen: () => void;
}

const Settings: React.FC = () => {
    const [isTelegramOpen, setIsTelegramOpen] = useState(false);
    const [isUnitSystemOpen, setIsUnitSystemOpen] = useState(false);

    const settingsSections: SettingsSection[] = [
        {
            id: 'telegram',
            title: 'Telegram Bot',
            description: 'Configure Telegram bot integration for recipe notifications and interactions',
            icon: <TelegramIcon />,
            badge: 'Integration',
            onOpen: () => setIsTelegramOpen(true)
        },
        {
            id: 'units',
            title: 'Unit System',
            description: 'Set your preferred measurement system for recipe ingredients',
            icon: <UnitsIcon />,
            badge: 'Display',
            onOpen: () => setIsUnitSystemOpen(true)
        }
    ];

    return (
        <>
            <Box maxW="6xl" mx="auto" p={6}>
                <VStack align="stretch" gap={8}>
                    {/* Header */}
                    <Box>
                        <HStack gap={3} mb={2}>
                            <Box color="blue.500">
                                <SettingsIcon />
                            </Box>
                            <Heading size="xl">Settings</Heading>
                        </HStack>
                        <Text fontSize="lg" color="gray.600">
                            Configure your RecipeBook experience and integrations
                        </Text>
                    </Box>

                    {/* Divider */}
                    <Box h="1px" bg="gray.200" />

                    {/* Settings Grid */}
                    <Box
                        display="grid"
                        gridTemplateColumns={{
                            base: "1fr",
                            md: "repeat(2, 1fr)",
                            lg: "repeat(3, 1fr)"
                        }}
                        gap={6}
                    >
                        {settingsSections.map((section) => (
                            <Box
                                key={section.id}
                                borderWidth="1px"
                                borderColor="gray.200"
                                borderRadius="md"
                                cursor="pointer"
                                transition="all 0.2s"
                                _hover={{
                                    boxShadow: 'md',
                                    borderColor: 'blue.300',
                                    transform: 'translateY(-2px)'
                                }}
                                onClick={section.onOpen}
                            >
                                {/* Card Header */}
                                <Box p={4} pb={2}>
                                    <HStack justify="space-between" align="start">
                                        <HStack gap={3}>
                                            <Box
                                                p={2}
                                                borderRadius="md"
                                                bg="blue.50"
                                                color="blue.600"
                                            >
                                                {section.icon}
                                            </Box>
                                            <Box>
                                                <Heading size="md">{section.title}</Heading>
                                                {section.badge && (
                                                    <Badge
                                                        colorScheme="blue"
                                                        variant="subtle"
                                                        size="sm"
                                                        mt={1}
                                                    >
                                                        {section.badge}
                                                    </Badge>
                                                )}
                                            </Box>
                                        </HStack>
                                    </HStack>
                                </Box>
                                {/* Card Body */}
                                <Box p={4} pt={0}>
                                    <Text fontSize="sm" color="gray.600" lineHeight="tall">
                                        {section.description}
                                    </Text>
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    {/* Additional Info */}
                    <Box
                        p={4}
                        bg="blue.50"
                        borderRadius="md"
                        borderLeft="4px solid"
                        borderColor="blue.400"
                    >
                        <Text fontWeight="medium" color="blue.800" mb={2}>
                            💡 Settings Tips
                        </Text>
                        <VStack align="start" gap={1} fontSize="sm" color="blue.700">
                            <Text>• Click on any setting card to configure that feature</Text>
                            <Text>• Changes are saved automatically when you apply them</Text>
                            <Text>• Some settings may require a page refresh to take effect</Text>
                            <Text>• More configuration options will be added in future updates</Text>
                        </VStack>
                    </Box>
                </VStack>
            </Box>

            {/* Modals */}
            {isTelegramOpen && (
                <TelegramSettings
                    isOpen={isTelegramOpen}
                    onClose={() => setIsTelegramOpen(false)}
                />
            )}

            <UnitSystemModal
                isOpen={isUnitSystemOpen}
                onClose={() => setIsUnitSystemOpen(false)}
            />
        </>
    );
};

export default Settings;