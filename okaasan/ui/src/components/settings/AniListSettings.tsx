import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Button, Badge } from '@chakra-ui/react';
import { Sparkles, ArrowLeft, Play, Check, ExternalLink } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface TestResult {
  success: boolean;
  provider: string;
  sample_result?: { title: string; japanese: string; episodes: number };
  error?: string;
}

const AniListSettings: React.FC = () => {
  const navigate = useNavigate();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await recipeAPI.request<TestResult>('/shows/anime/test', { method: 'POST' });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, provider: 'kitsu', error: String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Sparkles size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Anime Metadata</Heading>
        </HStack>

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between">
              <Text fontWeight="semibold">Provider</Text>
              <HStack gap={2}>
                <Badge colorPalette="blue">Kitsu</Badge>
                <Badge colorPalette="green">No auth required</Badge>
              </HStack>
            </HStack>

            <Box h="1px" bg="var(--border-color)" />

            <Text fontSize="sm" color="var(--muted-text)">
              Anime metadata is provided by{' '}
              <Text as="a" href="https://kitsu.io" target="_blank" color="var(--icon-color)">
                Kitsu <ExternalLink size={12} style={{ display: 'inline' }} />
              </Text>
              . No API key or account is needed — the library scanner automatically
              identifies anime files and fetches metadata during scans.
            </Text>

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleTest}
                disabled={testing}
              >
                <Play size={14} />
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
              {testResult?.success && (
                <HStack color="green.500">
                  <Check size={16} />
                  <Text fontSize="sm">Connected</Text>
                </HStack>
              )}
            </HStack>

            {testResult && (
              <Box p={3} bg={testResult.success ? 'green.950' : 'red.950'} borderRadius="md">
                <Text fontSize="sm" color={testResult.success ? 'green.300' : 'red.300'}>
                  {testResult.success
                    ? `Found: "${testResult.sample_result?.title}" (${testResult.sample_result?.episodes} episodes)`
                    : `Failed: ${testResult.error}`}
                </Text>
              </Box>
            )}
          </VStack>
        </Box>

        <Box p={4} bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">What this enables:</Text>
          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" color="var(--muted-text)">• Automatic anime identification during library scans</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Matches files like [SubGroup] Title - 01 to the correct anime series</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Title normalization (English, Romaji, Japanese)</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Episode counts and release info from Kitsu metadata</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default AniListSettings;
