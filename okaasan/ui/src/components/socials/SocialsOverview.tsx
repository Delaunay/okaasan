import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Share2, Instagram, Facebook, Linkedin, FolderOpen, Settings } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface PlatformSummary {
  id: string;
  name: string;
  configured: boolean;
  dump_path: string | null;
  default_path: string;
  categories: number;
}

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <Instagram size={22} />,
  facebook: <Facebook size={22} />,
  linkedin: <Linkedin size={22} />,
};

const SocialsOverview: React.FC = () => {
  const [platforms, setPlatforms] = useState<PlatformSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.getSocialsOverview()
      .then((data) => setPlatforms(data.platforms))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  const configuredCount = platforms.filter((p) => p.configured).length;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <HStack>
          <Share2 size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Socials</Heading>
        </HStack>
        <Badge
          cursor="pointer"
          colorPalette="blue"
          variant="subtle"
          onClick={() => navigate('/settings/socials')}
        >
          <Settings size={12} />
          Configure dumps
        </Badge>
      </HStack>

      <Text color="var(--muted-text)" fontSize="sm" maxW="3xl">
        Inspect exported data from Instagram, Facebook, and LinkedIn.
        Conversion to Okaasan publishable content will be added later.
      </Text>

      {configuredCount === 0 ? (
        <Box
          p={6}
          borderRadius="lg"
          border="1px solid"
          borderColor="var(--border-color)"
          bg="var(--card-bg)"
        >
          <VStack gap={3} align="start">
            <HStack color="var(--muted-text)">
              <FolderOpen size={18} />
              <Text fontWeight="semibold" color="var(--heading-color)">No dumps configured yet</Text>
            </HStack>
            <Text fontSize="sm" color="var(--muted-text)">
              Extract your platform exports and point each platform to its folder in Settings → Socials.
              Default location: <code>private/dumps/socials/&lt;platform&gt;/</code>
            </Text>
          </VStack>
        </Box>
      ) : (
        <Text fontSize="sm" color="var(--muted-text)">
          {configuredCount} of {platforms.length} platforms have dumps available.
        </Text>
      )}

      <Grid templateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={4}>
        {platforms.map((platform) => (
          <Box
            key={platform.id}
            p={5}
            borderRadius="lg"
            border="1px solid"
            borderColor="var(--border-color)"
            bg="var(--card-bg)"
            cursor={platform.configured ? 'pointer' : 'default'}
            opacity={platform.configured ? 1 : 0.7}
            _hover={platform.configured ? { bg: 'var(--hover-bg)' } : undefined}
            onClick={() => platform.configured && navigate(`/socials/${platform.id}`)}
          >
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between">
                <HStack color="var(--icon-color)">
                  {PLATFORM_ICONS[platform.id]}
                  <Heading size="sm" color="var(--heading-color)">{platform.name}</Heading>
                </HStack>
                <Badge colorPalette={platform.configured ? 'green' : 'gray'} variant="subtle">
                  {platform.configured ? 'Ready' : 'Not configured'}
                </Badge>
              </HStack>

              {platform.configured ? (
                <>
                  <Text fontSize="sm" color="var(--muted-text)">
                    {platform.categories} categories found
                  </Text>
                  <Text fontSize="xs" color="var(--empty-text)" lineClamp={2}>
                    {platform.dump_path}
                  </Text>
                </>
              ) : (
            <Text fontSize="sm" color="var(--muted-text)">
              Place export in <code>dumps/{platform.id}/</code> or set a custom path in settings.
            </Text>
              )}
            </VStack>
          </Box>
        ))}
      </Grid>
    </VStack>
  );
};

export default SocialsOverview;
