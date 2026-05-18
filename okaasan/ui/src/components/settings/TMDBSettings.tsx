import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge } from '@chakra-ui/react';
import { Film, ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { recipeAPI } from '../../services/api';

const TMDBSettings: React.FC = () => {
  const navigate = useNavigate();
  const [bearerToken, setBearerToken] = useState('');
  const [status, setStatus] = useState<{ configured: boolean; has_cached_data: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    recipeAPI.request<{ configured: boolean; has_cached_data: boolean }>('/shows/tmdb/status')
      .then(setStatus)
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!bearerToken.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await recipeAPI.request('/shows/tmdb/configure', {
        method: 'POST',
        body: JSON.stringify({ bearer_token: bearerToken }),
      });
      setStatus({ configured: true, has_cached_data: status?.has_cached_data || false });
      setSaved(true);
      setBearerToken('');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Film size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">TMDB Integration</Heading>
        </HStack>

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between">
              <Text fontWeight="semibold">Status</Text>
              {status?.configured ? (
                <Badge colorPalette="green">Configured</Badge>
              ) : (
                <Badge colorPalette="orange">Not configured</Badge>
              )}
            </HStack>

            {status?.has_cached_data && (
              <Text fontSize="sm" color="var(--muted-text)">
                Cached metadata available — posters will display even without an active key.
              </Text>
            )}

            <Box h="1px" bg="var(--border-color)" />

            <Text fontSize="sm" color="var(--muted-text)">
              TMDB provides poster images, movie/show metadata, and powers the Discover tab.
              Get a free API Read Access Token from{' '}
              <Text as="a" href="https://www.themoviedb.org/settings/api" target="_blank" color="var(--icon-color)">
                themoviedb.org <ExternalLink size={12} style={{ display: 'inline' }} />
              </Text>
              {' '}(under "API Read Access Token" / Bearer token).
            </Text>

            <Input
              placeholder="Enter TMDB Bearer token (API Read Access Token)"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              bg="var(--input-bg)"
              type="password"
            />

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleSave}
                disabled={!bearerToken.trim() || saving}
              >
                {saving ? 'Saving...' : 'Save Token'}
              </Button>
              {saved && (
                <HStack color="green.500">
                  <Check size={16} />
                  <Text fontSize="sm">Saved successfully</Text>
                </HStack>
              )}
            </HStack>
          </VStack>
        </Box>

        <Box p={4} bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">What this enables:</Text>
          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" color="var(--muted-text)">• Poster images and backdrop art for all shows/movies</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Rich metadata (genres, ratings, taglines) from TMDB</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Discover tab with trending, popular, and top-rated content</Text>
            <Text fontSize="sm" color="var(--muted-text)">• All data is cached locally — once fetched, works offline</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default TMDBSettings;
