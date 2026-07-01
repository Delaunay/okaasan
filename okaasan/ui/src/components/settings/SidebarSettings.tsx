import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Heading, HStack, Text, VStack, Badge,
} from '@chakra-ui/react';
import { useToast } from '../ui/toaster';
import { LayoutDashboard, Eye, EyeOff, Loader2, Lock, Globe, ChevronDown, ChevronRight } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { sidebarSections } from '../../layout/Layout';

const ALWAYS_VISIBLE = new Set(['Home', 'Settings']);

const MEDIA_SECTIONS = new Set([
  'Shows & Movies', 'Music', 'Audiobooks', 'Podcasts', 'Books', 'Comics & Manga', 'Retro Games',
]);

export default function SidebarSettings() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [staticHidden, setStaticHidden] = useState<Set<string>>(new Set());
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set());
  const [staticHiddenItems, setStaticHiddenItems] = useState<Set<string>>(new Set());
  const [configuredMedia, setConfiguredMedia] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const cardBg = 'var(--card-bg)';
  const border = 'var(--border-color)';
  const mutedText = 'var(--muted-text)';
  const activeBg = 'var(--active-bg)';
  const hiddenBg = 'var(--hidden-bg)';

  const fetchConfig = useCallback(async () => {
    try {
      const data = await recipeAPI.getSidebar();
      setHidden(new Set(data.hidden || []));
      setStaticHidden(new Set(data.static_hidden || []));
      setHiddenItems(new Set(data.hidden_items || []));
      setStaticHiddenItems(new Set(data.static_hidden_items || []));
      setConfiguredMedia(new Set(data.configured_media || []));
    } catch {
      toast('error', 'Failed to load sidebar configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = async (
    nextHidden: Set<string>,
    nextStaticHidden: Set<string>,
    nextHiddenItems: Set<string>,
    nextStaticHiddenItems: Set<string>,
  ) => {
    try {
      await recipeAPI.updateSidebar({
        hidden: [...nextHidden],
        static_hidden: [...nextStaticHidden],
        hidden_items: [...nextHiddenItems],
        static_hidden_items: [...nextStaticHiddenItems],
      });
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e: any) {
      toast('error', `Failed to save: ${e.message}`);
      throw e;
    }
  };

  const toggleSection = async (title: string) => {
    if (ALWAYS_VISIBLE.has(title)) return;
    const next = new Set(hidden);
    next.has(title) ? next.delete(title) : next.add(title);
    const prev = hidden;
    setHidden(next);
    try {
      await saveConfig(next, staticHidden, hiddenItems, staticHiddenItems);
      toast('success', next.has(title) ? `${title} hidden` : `${title} visible`);
    } catch { setHidden(prev); }
  };

  const toggleStaticSection = async (e: React.MouseEvent, title: string) => {
    e.stopPropagation();
    if (ALWAYS_VISIBLE.has(title)) return;
    const next = new Set(staticHidden);
    next.has(title) ? next.delete(title) : next.add(title);
    const prev = staticHidden;
    setStaticHidden(next);
    try {
      await saveConfig(hidden, next, hiddenItems, staticHiddenItems);
      toast('success', next.has(title) ? `${title} hidden in static build` : `${title} visible in static build`);
    } catch { setStaticHidden(prev); }
  };

  const toggleItem = async (href: string) => {
    const next = new Set(hiddenItems);
    next.has(href) ? next.delete(href) : next.add(href);
    const prev = hiddenItems;
    setHiddenItems(next);
    try {
      await saveConfig(hidden, staticHidden, next, staticHiddenItems);
    } catch { setHiddenItems(prev); }
  };

  const toggleStaticItem = async (e: React.MouseEvent, href: string) => {
    e.stopPropagation();
    const next = new Set(staticHiddenItems);
    next.has(href) ? next.delete(href) : next.add(href);
    const prev = staticHiddenItems;
    setStaticHiddenItems(next);
    try {
      await saveConfig(hidden, staticHidden, hiddenItems, next);
    } catch { setStaticHiddenItems(prev); }
  };

  const toggleExpanded = (title: string) => {
    const next = new Set(expandedSections);
    next.has(title) ? next.delete(title) : next.add(title);
    setExpandedSections(next);
  };

  if (loading) {
    return (
      <Box p={6} maxW="800px" mx="auto">
        <Flex align="center" gap={2}><Loader2 className="spin" size={18} /> Loading...</Flex>
      </Box>
    );
  }

  return (
    <Box p={6} maxW="800px" mx="auto">
      <Heading size="lg" mb={2}>
        <Flex align="center" gap={2}><LayoutDashboard size={24} /> Sidebar Sections</Flex>
      </Heading>
      <Text fontSize="sm" color={mutedText} mb={2}>
        Choose which sections and sub-items appear in the sidebar.
      </Text>
      <HStack fontSize="xs" color={mutedText} mb={6} gap={4}>
        <Flex align="center" gap={1}><Eye size={14} /> Dynamic visibility</Flex>
        <Flex align="center" gap={1}><Globe size={14} /> Static/public build</Flex>
      </HStack>

      <VStack align="stretch" gap={2}>
        {sidebarSections.map((section) => {
          const locked = ALWAYS_VISIBLE.has(section.title);
          const isHidden = hidden.has(section.title);
          const isStaticHidden = staticHidden.has(section.title);
          const isMedia = MEDIA_SECTIONS.has(section.title);
          const isUnconfigured = isMedia && !configuredMedia.has(section.title);
          const hasItems = section.items && section.items.length > 0;
          const isExpanded = expandedSections.has(section.title);

          return (
            <Box key={section.title}>
              <Box
                bg={locked ? cardBg : isHidden ? hiddenBg : activeBg}
                p={3}
                borderRadius="lg"
                border="1px solid"
                borderColor={border}
                opacity={isHidden ? 0.6 : 1}
                transition="all 0.2s"
                _hover={locked ? {} : { borderColor: 'blue.300' }}
              >
                <HStack justify="space-between">
                  <HStack
                    gap={2}
                    flex="1"
                    cursor={hasItems ? 'pointer' : 'default'}
                    onClick={() => hasItems && toggleExpanded(section.title)}
                  >
                    {hasItems && (
                      <Box color={mutedText} flexShrink={0}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </Box>
                    )}
                    <Text fontWeight="bold" fontSize="sm">{section.title}</Text>
                    {locked && <Lock size={12} style={{ opacity: 0.5 }} />}
                    {isUnconfigured && <Badge colorPalette="orange" fontSize="2xs">Not configured</Badge>}
                    {hasItems && (
                      <Text fontSize="2xs" color={mutedText}>
                        {section.items.length} items
                      </Text>
                    )}
                  </HStack>
                  <HStack gap={3}>
                    <Box
                      position="relative"
                      color={isStaticHidden ? 'orange.400' : 'gray.400'}
                      cursor={locked ? 'default' : 'pointer'}
                      title={isStaticHidden ? 'Hidden in static build' : 'Visible in static build'}
                      onClick={(e) => toggleStaticSection(e, section.title)}
                      opacity={locked ? 0.3 : 0.8}
                      _hover={locked ? {} : { opacity: 1 }}
                    >
                      <Globe size={18} />
                      {isStaticHidden && !locked && (
                        <Box
                          position="absolute"
                          top="0"
                          left="8px"
                          w="2px"
                          h="18px"
                          bg="orange.400"
                          transform="rotate(45deg)"
                          transformOrigin="center"
                          borderRadius="1px"
                          pointerEvents="none"
                        />
                      )}
                    </Box>
                    <Box
                      color={isHidden ? 'gray.400' : 'green.500'}
                      cursor={locked ? 'default' : 'pointer'}
                      onClick={() => toggleSection(section.title)}
                    >
                      {locked ? (
                        <Eye size={20} style={{ opacity: 0.5 }} />
                      ) : isHidden ? (
                        <EyeOff size={20} />
                      ) : (
                        <Eye size={20} />
                      )}
                    </Box>
                  </HStack>
                </HStack>
              </Box>

              {hasItems && isExpanded && !isHidden && (
                <VStack align="stretch" gap={0} pl={6} mt={1}>
                  {section.items.map((item: { name: string; href: string }) => {
                    const itemHidden = hiddenItems.has(item.href);
                    const itemStaticHidden = staticHiddenItems.has(item.href);

                    return (
                      <HStack
                        key={item.href}
                        justify="space-between"
                        py="6px"
                        px={3}
                        borderRadius="md"
                        opacity={itemHidden ? 0.5 : 1}
                        bg={itemHidden ? hiddenBg : 'transparent'}
                        _hover={{ bg: itemHidden ? hiddenBg : 'var(--hover-bg)' }}
                        transition="all 0.15s"
                      >
                        <Text fontSize="sm">{item.name}</Text>
                        <HStack gap={3}>
                          <Box
                            position="relative"
                            color={itemStaticHidden ? 'orange.400' : 'gray.400'}
                            cursor="pointer"
                            title={itemStaticHidden ? 'Hidden in static build' : 'Visible in static build'}
                            onClick={(e) => toggleStaticItem(e, item.href)}
                            opacity={0.7}
                            _hover={{ opacity: 1 }}
                          >
                            <Globe size={14} />
                            {itemStaticHidden && (
                              <Box
                                position="absolute"
                                top="0"
                                left="6px"
                                w="2px"
                                h="14px"
                                bg="orange.400"
                                transform="rotate(45deg)"
                                transformOrigin="center"
                                borderRadius="1px"
                                pointerEvents="none"
                              />
                            )}
                          </Box>
                          <Box
                            color={itemHidden ? 'gray.400' : 'green.500'}
                            cursor="pointer"
                            onClick={() => toggleItem(item.href)}
                          >
                            {itemHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                          </Box>
                        </HStack>
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </Box>
          );
        })}
      </VStack>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
}
