import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Button, Badge } from '@chakra-ui/react';
import { Tv, ArrowLeft, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { recipeAPI } from '../../services/api';

const TraktSettings: React.FC = () => {
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const resp = await recipeAPI.request<{ message: string }>('/shows/import', {
        method: 'POST',
      });
      setResult({ success: true, message: resp.message || 'Import complete' });
    } catch (e: any) {
      setResult({ success: false, message: e.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Tv size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Trakt.tv Integration</Heading>
        </HStack>

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <Text fontWeight="semibold">Data Import</Text>

            <Text fontSize="sm" color="var(--muted-text)">
              Import or re-import your Trakt.tv data dump into the database.
              Place your Trakt export files in the <code>shows/</code> folder
              and click the button below.
            </Text>

            <Text fontSize="sm" color="var(--muted-text)">
              This will import watched shows/movies, watchlist, ratings,
              favorites, and collections. Posters will be downloaded automatically.
            </Text>

            <Box h="1px" bg="var(--border-color)" />

            <Box p={3} bg="var(--surface-muted)" borderRadius="md">
              <Text fontSize="xs" color="var(--muted-text)" fontWeight="semibold" mb={1}>
                User data is never overwritten
              </Text>
              <Text fontSize="xs" color="var(--muted-text)">
                Any shows, ratings, or watchlist items you added manually through
                the website will be preserved. Only Trakt-imported data gets refreshed.
              </Text>
            </Box>

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleImport}
                disabled={importing}
              >
                <RefreshCw size={14} className={importing ? 'animate-spin' : ''} />
                {importing ? 'Importing...' : 'Import Trakt Data'}
              </Button>
              {result && (
                <HStack color={result.success ? 'green.500' : 'red.500'}>
                  {result.success ? <Check size={16} /> : <AlertCircle size={16} />}
                  <Text fontSize="sm">{result.message}</Text>
                </HStack>
              )}
            </HStack>
          </VStack>
        </Box>

        <Box p={4} bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">Expected files in shows/ folder:</Text>
          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" color="var(--muted-text)">• watched-shows.json</Text>
            <Text fontSize="sm" color="var(--muted-text)">• watched-movies-1.json (numbered)</Text>
            <Text fontSize="sm" color="var(--muted-text)">• lists-watchlist.json</Text>
            <Text fontSize="sm" color="var(--muted-text)">• lists-favorites.json</Text>
            <Text fontSize="sm" color="var(--muted-text)">• ratings-shows.json, ratings-movies.json</Text>
            <Text fontSize="sm" color="var(--muted-text)">• collection-shows.json, collection-movies.json</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default TraktSettings;
