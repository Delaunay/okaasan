import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Flex,
    VStack,
    HStack,
    Text,
    Heading,
    Badge
} from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import {
    Settings as SettingsLucide, FolderGit2, Download, Send,
    Ruler, FolderOpen, LayoutDashboard, CalendarDays, MapPin,
} from 'lucide-react';
import { isStaticMode, recipeAPI } from '../../services/api';
import { TelegramSettings } from '../common/TelegramSettings';
import { UnitSystemModal } from '../common/UnitSystemModal';
import { WeatherLocationModal } from '../common/WeatherLocationModal';

interface SettingsSection {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
    status?: string;
    onOpen: () => void;
}

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const [isTelegramOpen, setIsTelegramOpen] = useState(false);
    const [isUnitSystemOpen, setIsUnitSystemOpen] = useState(false);
    const [isWeatherLocationOpen, setIsWeatherLocationOpen] = useState(false);
    const [dataPath, setDataPath] = useState<string>('');
    const [version, setVersion] = useState<string>('');

    const cardBg = useColorModeValue('white', '#1e1e2e');
    const border = useColorModeValue('gray.200', 'gray.700');
    const mutedText = useColorModeValue('gray.600', 'gray.400');
    const iconBg = useColorModeValue('blue.50', 'blue.900');
    const iconColor = useColorModeValue('blue.600', 'blue.200');

    const _static = isStaticMode();

    useEffect(() => {
        if (_static) return;
        recipeAPI.getVersion().then(d => setVersion(d.version)).catch(() => {});
        recipeAPI.getGitStatus().then(d => setDataPath(d.data_path || '')).catch(() => {});
    }, [_static]);

    const settingsSections: SettingsSection[] = [
        ...(_static ? [] : [
            {
                id: 'git',
                title: 'Git Backup',
                description: 'Back up your data to a private GitHub repository with SSH-based auto-sync',
                icon: <FolderGit2 size={20} />,
                badge: 'Backup',
                onOpen: () => navigate('/settings/git'),
            },
            {
                id: 'updates',
                title: 'Software Update',
                description: 'Check for new versions, install updates, and configure auto-update',
                icon: <Download size={20} />,
                badge: 'System',
                status: version ? `v${version}` : undefined,
                onOpen: () => navigate('/settings/updates'),
            },
            {
                id: 'sidebar',
                title: 'Sidebar Sections',
                description: 'Choose which sections appear in the sidebar navigation',
                icon: <LayoutDashboard size={20} />,
                badge: 'Display',
                onOpen: () => navigate('/settings/sidebar'),
            },
            {
                id: 'gcalendar',
                title: 'Google Calendar',
                description: 'Connect your Google Calendar to see events in the planner',
                icon: <CalendarDays size={20} />,
                badge: 'Integration',
                onOpen: () => navigate('/settings/google-calendar'),
            },
        ]),
        {
            id: 'weather',
            title: 'Weather Location',
            description: 'Set your location to display weather on the home page',
            icon: <MapPin size={20} />,
            badge: 'Display',
            onOpen: () => setIsWeatherLocationOpen(true),
        },
        {
            id: 'telegram',
            title: 'Telegram Bot',
            description: 'Configure Telegram bot integration for recipe notifications and interactions',
            icon: <Send size={20} />,
            badge: 'Integration',
            onOpen: () => setIsTelegramOpen(true),
        },
        {
            id: 'units',
            title: 'Unit System',
            description: 'Set your preferred measurement system for recipe ingredients',
            icon: <Ruler size={20} />,
            badge: 'Display',
            onOpen: () => setIsUnitSystemOpen(true),
        },
    ];

    return (
        <>
            <Box maxW="6xl" mx="auto" p={6}>
                <VStack align="stretch" gap={8}>
                    <Box>
                        <HStack gap={3} mb={2}>
                            <Box color="blue.500">
                                <SettingsLucide size={24} />
                            </Box>
                            <Heading size="xl">Settings</Heading>
                        </HStack>
                        <Text fontSize="lg" color={mutedText}>
                            Configure your Okaasan instance and integrations
                        </Text>
                    </Box>

                    <Box h="1px" bg={border} />

                    <Flex wrap="wrap" gap={6}>
                        {settingsSections.map((section) => (
                            <Box
                                key={section.id}
                                bg={cardBg}
                                borderWidth="1px"
                                borderColor={border}
                                borderRadius="md"
                                cursor="pointer"
                                transition="all 0.2s"
                                w={{ base: '100%', md: '280px' }}
                                flex="0 0 auto"
                                _hover={{
                                    boxShadow: 'md',
                                    borderColor: 'blue.300',
                                    transform: 'translateY(-2px)'
                                }}
                                onClick={section.onOpen}
                            >
                                <Box p={4} pb={2}>
                                    <HStack justify="space-between" align="start">
                                        <HStack gap={3}>
                                            <Box
                                                p={2}
                                                borderRadius="md"
                                                bg={iconBg}
                                                color={iconColor}
                                            >
                                                {section.icon}
                                            </Box>
                                            <Box>
                                                <Heading size="md">{section.title}</Heading>
                                                <HStack gap={2} mt={1}>
                                                    {section.badge && (
                                                        <Badge
                                                            colorPalette="blue"
                                                            variant="subtle"
                                                            size="sm"
                                                        >
                                                            {section.badge}
                                                        </Badge>
                                                    )}
                                                    {section.status && (
                                                        <Badge
                                                            colorPalette="green"
                                                            variant="subtle"
                                                            size="sm"
                                                        >
                                                            {section.status}
                                                        </Badge>
                                                    )}
                                                </HStack>
                                            </Box>
                                        </HStack>
                                    </HStack>
                                </Box>
                                <Box p={4} pt={0}>
                                    <Text fontSize="sm" color={mutedText} lineHeight="tall">
                                        {section.description}
                                    </Text>
                                </Box>
                            </Box>
                        ))}
                    </Flex>

                    {/* Data Folder Info */}
                    {dataPath && (
                        <Box
                            bg={cardBg}
                            p={4}
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor={border}
                        >
                            <HStack gap={3} mb={2}>
                                <FolderOpen size={18} />
                                <Text fontWeight="medium">Data Folder</Text>
                            </HStack>
                            <Text fontSize="sm" fontFamily="mono" color={mutedText}>
                                {dataPath}
                            </Text>
                            <Text fontSize="xs" color={mutedText} mt={1}>
                                All application data (database, uploads, JSON configs) is stored here.
                                Set the FLASK_STATIC environment variable to change this location.
                            </Text>
                        </Box>
                    )}
                </VStack>
            </Box>

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

            <WeatherLocationModal
                isOpen={isWeatherLocationOpen}
                onClose={() => setIsWeatherLocationOpen(false)}
            />
        </>
    );
};

export default Settings;