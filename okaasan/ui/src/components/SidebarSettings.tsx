import { useState, useEffect, useCallback } from 'react';
import {
  Box, Flex, Heading, HStack, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { useToast } from './ui/toaster';
import { LayoutDashboard, Eye, EyeOff, Loader2, Lock, Globe } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '/api';

interface SectionInfo {
  title: string;
  href: string;
  items?: string[];
}

const ALWAYS_VISIBLE = new Set(['Home', 'Settings']);

export default function SidebarSettings() {
  const [allSections, setAllSections] = useState<SectionInfo[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [staticHidden, setStaticHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');
  const activeBg = useColorModeValue('green.50', 'green.900');
  const hiddenBg = useColorModeValue('gray.50', 'gray.800');

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/sidebar`);
      if (res.ok) {
        const data = await res.json();
        setAllSections(data.all_sections || []);
        setHidden(new Set(data.hidden || []));
        setStaticHidden(new Set(data.static_hidden || []));
      }
    } catch {
      toast('error', 'Failed to load sidebar configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = async (nextHidden: Set<string>, nextStaticHidden: Set<string>) => {
    try {
      await fetch(`${API}/api/sidebar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hidden: [...nextHidden],
          static_hidden: [...nextStaticHidden],
        }),
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
    if (next.has(title)) {
      next.delete(title);
    } else {
      next.add(title);
    }
    const prev = hidden;
    setHidden(next);

    try {
      await saveConfig(next, staticHidden);
      toast('success', next.has(title) ? `${title} hidden` : `${title} visible`);
    } catch {
      setHidden(prev);
    }
  };

  const toggleStaticHidden = async (e: React.MouseEvent, title: string) => {
    e.stopPropagation();
    if (ALWAYS_VISIBLE.has(title)) return;

    const next = new Set(staticHidden);
    if (next.has(title)) {
      next.delete(title);
    } else {
      next.add(title);
    }
    const prev = staticHidden;
    setStaticHidden(next);

    try {
      await saveConfig(hidden, next);
      toast('success', next.has(title)
        ? `${title} hidden in static build`
        : `${title} visible in static build`);
    } catch {
      setStaticHidden(prev);
    }
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
      <Text fontSize="sm" color={mutedText} mb={6}>
        Choose which sections appear in the sidebar. Home and Settings are always visible.
        The globe icon controls visibility in the static/public build.
      </Text>

      <VStack align="stretch" gap={2}>
        {allSections.map((section) => {
          const locked = ALWAYS_VISIBLE.has(section.title);
          const isHidden = hidden.has(section.title);
          const isStaticHidden = staticHidden.has(section.title);

          return (
            <Box
              key={section.title}
              bg={locked ? cardBg : isHidden ? hiddenBg : activeBg}
              p={4}
              borderRadius="lg"
              border="1px solid"
              borderColor={border}
              cursor={locked ? 'default' : 'pointer'}
              opacity={isHidden ? 0.6 : 1}
              transition="all 0.2s"
              _hover={locked ? {} : { borderColor: 'blue.300' }}
              onClick={() => toggleSection(section.title)}
            >
              <HStack justify="space-between">
                <Box>
                  <HStack gap={2} mb={1}>
                    <Text fontWeight="bold" fontSize="sm">{section.title}</Text>
                    {locked && (
                      <Lock size={12} style={{ opacity: 0.5 }} />
                    )}
                  </HStack>
                  {section.items && section.items.length > 0 && (
                    <Text fontSize="xs" color={mutedText}>
                      {section.items.join(' · ')}
                    </Text>
                  )}
                </Box>
                <HStack gap={3}>
                  <Box
                    color={isStaticHidden ? 'orange.400' : 'gray.400'}
                    cursor={locked ? 'default' : 'pointer'}
                    title={isStaticHidden ? 'Hidden in static build' : 'Visible in static build'}
                    onClick={(e) => toggleStaticHidden(e, section.title)}
                    opacity={locked ? 0.3 : 0.8}
                    _hover={locked ? {} : { opacity: 1 }}
                  >
                    <Globe size={18} />
                    {isStaticHidden && !locked && (
                      <Box
                        position="absolute"
                        mt="-20px"
                        ml="12px"
                        w="2px"
                        h="20px"
                        bg="orange.400"
                        transform="rotate(45deg)"
                        borderRadius="1px"
                      />
                    )}
                  </Box>
                  <Box color={isHidden ? 'gray.400' : 'green.500'}>
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
