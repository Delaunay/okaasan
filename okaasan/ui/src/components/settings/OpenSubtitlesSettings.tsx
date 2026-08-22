import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge } from '@chakra-ui/react';
import { Captions, ArrowLeft, ExternalLink, Check } from 'lucide-react';
import { recipeAPI } from '../../services/api';

const OpenSubtitlesSettings: React.FC = () => {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    recipeAPI.request<{ configured: boolean }>('/shows/subtitles/status')
      .then(setStatus)
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await recipeAPI.request('/shows/subtitles/configure', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey, username, password }),
      });
      setStatus({ configured: true });
      setSaved(true);
      setApiKey('');
      setUsername('');
      setPassword('');
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
          <Captions size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">OpenSubtitles Integration</Heading>
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
              Lets the video player search and download subtitles on demand, saved next to
              the video file so they're picked up automatically next time. Get a free API key from{' '}
              <Text as="a" href="https://www.opensubtitles.com/en/consumers" target="_blank" color="var(--icon-color)">
                opensubtitles.com <ExternalLink size={12} style={{ display: 'inline' }} />
              </Text>
              {' '}(Consumer/API section).
            </Text>

            <Input
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              bg="var(--input-bg)"
              type="password"
            />

            <Text fontSize="xs" color="var(--muted-text)">
              Username/password are optional — logging in raises the daily download quota,
              but search and a handful of downloads a day work on the API key alone.
            </Text>

            <Input
              placeholder="Username (optional)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              bg="var(--input-bg)"
            />
            <Input
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              bg="var(--input-bg)"
              type="password"
            />

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleSave}
                disabled={!apiKey.trim() || saving}
              >
                {saving ? 'Saving...' : 'Save'}
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
            <Text fontSize="sm" color="var(--muted-text)">• Search subtitles by title (and season/episode for shows) from the player</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Downloaded subtitles are saved as a .srt file next to the video</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Any player (VLC, this app, Plex, etc.) picks them up automatically afterward</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default OpenSubtitlesSettings;
