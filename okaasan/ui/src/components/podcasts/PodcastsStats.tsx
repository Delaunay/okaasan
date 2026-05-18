import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, Headphones, ListMusic, Clock, Hash } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface PodcastSummary {
  subscriptions: number;
  total_episodes: number;
  listened: number;
  total_listen_time_ms: number;
}

interface TopPodcast {
  name: string;
  episodes_listened: number;
  total_time_ms: number;
}

interface CategoryEntry {
  name: string;
  count: number;
}

interface ListeningHistoryEntry {
  title?: string;
  podcast_name?: string;
  last_listened_at: string;
  [key: string]: any;
}

interface StatsData {
  summary: PodcastSummary;
  top_podcasts: TopPodcast[];
  categories: CategoryEntry[];
  listening_history: ListeningHistoryEntry[];
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const PodcastsStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recipeAPI.request<StatsData>('/podcasts/stats')
      .then(setData)
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

  if (!data) {
    return (
      <Flex justify="center" align="center" minH="200px" direction="column" gap={3}>
        <BarChart3 size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">No podcast stats available yet.</Text>
      </Flex>
    );
  }

  const { summary } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Podcast Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Headphones size={18} />} label="Subscriptions" value={summary.subscriptions.toLocaleString()} />
        <StatCard icon={<Hash size={18} />} label="Episodes Listened" value={summary.listened.toLocaleString()} />
        <StatCard icon={<ListMusic size={18} />} label="Total Episodes" value={summary.total_episodes.toLocaleString()} />
        <StatCard icon={<Clock size={18} />} label="Listening Time" value={formatDuration(summary.total_listen_time_ms)} />
      </Grid>

      {/* Top Podcasts */}
      {data.top_podcasts.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Top Podcasts</Heading>
          <VStack gap={1} align="stretch">
            {data.top_podcasts.map((podcast, i) => (
              <HStack
                key={podcast.name}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                gap={3}
              >
                <Text fontSize="xs" color="var(--muted-text)" w="24px" textAlign="right">{i + 1}</Text>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{podcast.name}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)">
                    {podcast.episodes_listened} episodes · {formatDuration(podcast.total_time_ms)}
                  </Text>
                </Box>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Categories Pie Chart */}
      {data.categories.length > 0 && (
        <VegaProvider>
          <Box>
            <Heading size="md" color="var(--heading-color)" mb={3}>Categories</Heading>
            <CategoriesPieChart categories={data.categories} />
          </Box>
        </VegaProvider>
      )}

      {/* Listening History */}
      {data.listening_history.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Listening History</Heading>
          <VStack gap={1} align="stretch">
            {data.listening_history.map((entry, i) => (
              <HStack
                key={`${entry.title}-${i}`}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                gap={3}
              >
                <Box w="32px" h="32px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                  <Headphones size={12} color="var(--muted-text)" />
                </Box>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{entry.title || 'Untitled'}</Text>
                  {entry.podcast_name && (
                    <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{entry.podcast_name}</Text>
                  )}
                </Box>
                <Text fontSize="2xs" color="var(--muted-text)">
                  {entry.last_listened_at ? new Date(entry.last_listened_at).toLocaleDateString() : ''}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; subtitle?: string }> = ({ icon, label, value, subtitle }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    border="1px solid"
    borderColor="var(--border-color)"
    borderRadius="lg"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    <Text fontSize="sm" color="var(--muted-text)">{label}</Text>
    {subtitle && <Text fontSize="2xs" color="var(--muted-text)">{subtitle}</Text>}
  </Box>
);

const CategoriesPieChart: React.FC<{ categories: CategoryEntry[] }> = ({ categories }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: categories },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Category' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Category' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [categories]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default PodcastsStats;
