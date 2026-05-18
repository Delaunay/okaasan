import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge } from '@chakra-ui/react';
import { Podcast, ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { recipeAPI } from '../../services/api';

const PodcastsSettings: React.FC = () => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [refreshInterval, setRefreshInterval] = useState('60');
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    recipeAPI.request<{ configured: boolean; refresh_interval: number }>('/podcasts/settings/status')
      .then(data => {
        setStatus({ configured: data.configured });
        if (data.refresh_interval) setRefreshInterval(String(data.refresh_interval));
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await recipeAPI.request('/podcasts/settings/configure', {
        method: 'POST',
        body: JSON.stringify({
          api_key: apiKey || undefined,
          api_secret: apiSecret || undefined,
          refresh_interval: parseInt(refreshInterval) || 60,
        }),
      });
      setStatus({ configured: true });
      setSaved(true);
      setApiKey('');
      setApiSecret('');
      window.dispatchEvent(new Event('sidebar-config-changed'));
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
          <Podcast size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Podcasts Integration</Heading>
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

            <Box h="1px" bg="var(--border-color)" />

            <Text fontSize="sm" color="var(--muted-text)">
              Podcast Index API powers podcast search and discovery.
              Get a free API key and secret from{' '}
              <Text as="a" href="https://api.podcastindex.org/" target="_blank" color="var(--icon-color)">
                podcastindex.org <ExternalLink size={12} style={{ display: 'inline' }} />
              </Text>
            </Text>

            <Input
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              bg="var(--input-bg)"
            />

            <Input
              placeholder="API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              bg="var(--input-bg)"
              type="password"
            />

            <Box h="1px" bg="var(--border-color)" />

            <VStack align="stretch" gap={2}>
              <Text fontSize="sm" fontWeight="medium">Refresh Interval (minutes)</Text>
              <Text fontSize="xs" color="var(--muted-text)">
                How often to check for new episodes from your subscriptions.
              </Text>
              <Input
                type="number"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                bg="var(--input-bg)"
                maxW="120px"
                min={5}
              />
            </VStack>

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
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
            <Text fontSize="sm" color="var(--muted-text)">• Search and discover millions of podcasts via Podcast Index</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Subscribe and automatically fetch new episodes</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Track listening progress across episodes</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Configurable refresh interval for feed updates</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default PodcastsSettings;
