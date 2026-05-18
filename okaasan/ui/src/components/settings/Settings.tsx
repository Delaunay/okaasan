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
import {
    Settings as SettingsLucide, FolderGit2, Download, Send,
    Ruler, FolderOpen, LayoutDashboard, CalendarDays, MapPin, Film, Tv, HardDrive, Podcast, Layers, Gamepad2, BookOpen, Headphones, Music,
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

    const cardBg = 'var(--card-bg-raised)';
    const border = 'var(--border-color)';
    const mutedText = 'var(--muted-text)';
    const iconBg = 'var(--selected-bg)';
    const iconColor = 'var(--icon-color)';

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
            {
                id: 'tmdb',
                title: 'TMDB (Movies & Shows)',
                description: 'Add your TMDB API key to enable poster images, metadata, and discovery',
                icon: <Film size={20} />,
                badge: 'Integration',
                onOpen: () => navigate('/settings/tmdb'),
            },
            {
                id: 'library',
                title: 'Media Library',
                description: 'Configure local media folders for shows, movies, and anime to enable playback',
                icon: <HardDrive size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/library'),
            },
            {
                id: 'trakt',
                title: 'Trakt.tv',
                description: 'Import and sync your Trakt.tv watch history, ratings, and collections',
                icon: <Tv size={20} />,
                badge: 'Integration',
                onOpen: () => navigate('/settings/trakt'),
            },
            {
                id: 'podcasts',
                title: 'Podcasts',
                description: 'Configure Podcast Index API for podcast search, discovery, and feed updates',
                icon: <Podcast size={20} />,
                badge: 'Integration',
                onOpen: () => navigate('/settings/podcasts'),
            },
            {
                id: 'comics',
                title: 'Comics & Manga',
                description: 'Configure comic folders, ComicVine API key, and scan your library',
                icon: <Layers size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/comics'),
            },
            {
                id: 'games',
                title: 'Retro Games',
                description: 'Configure ROM folders and IGDB credentials for in-browser retro game emulation',
                icon: <Gamepad2 size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/games'),
            },
            {
                id: 'books',
                title: 'Books Library',
                description: 'Configure book folders, scan for ePub and PDF files, and manage your reading library',
                icon: <BookOpen size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/books'),
            },
            {
                id: 'audiobooks',
                title: 'Audiobooks Library',
                description: 'Configure audiobook folders, scan your library, and manage listening progress',
                icon: <Headphones size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/audiobooks'),
            },
            {
                id: 'music',
                title: 'Music Library',
                description: 'Configure music folders, scan for audio files, and manage your music collection',
                icon: <Music size={20} />,
                badge: 'Library',
                onOpen: () => navigate('/settings/music'),
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