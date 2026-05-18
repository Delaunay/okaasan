import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, BookImage, FileText, Library, Hash } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface ComicsSummary {
  total_issues: number;
  total_read: number;
  total_pages_read: number;
  series_count: number;
}

interface TopSeries {
  name: string;
  issue_count: number;
  read_count: number;
}

interface PublisherEntry {
  name: string;
  count: number;
}

interface MediaTypeEntry {
  type: string;
  count: number;
}

interface ReadingHistoryEntry {
  title?: string;
  series_name?: string;
  issue_number?: number;
  last_read_at: string;
  [key: string]: any;
}

interface StatsData {
  summary: ComicsSummary;
  top_series: TopSeries[];
  publishers: PublisherEntry[];
  media_types: MediaTypeEntry[];
  reading_history: ReadingHistoryEntry[];
}

const ComicsStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recipeAPI.request<StatsData>('/comics/stats')
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
        <Text color="var(--muted-text)">No comics stats available yet.</Text>
      </Flex>
    );
  }

  const { summary } = data;
  const readPercent = summary.total_issues > 0
    ? Math.round((summary.total_read / summary.total_issues) * 100)
    : 0;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Comics Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<BookImage size={18} />} label="Total Issues" value={summary.total_issues.toLocaleString()} />
        <StatCard icon={<Hash size={18} />} label="Issues Read" value={summary.total_read.toLocaleString()} subtitle={`${readPercent}% read`} />
        <StatCard icon={<FileText size={18} />} label="Pages Read" value={summary.total_pages_read.toLocaleString()} />
        <StatCard icon={<Library size={18} />} label="Series" value={summary.series_count.toLocaleString()} />
      </Grid>

      {/* Top Series */}
      {data.top_series.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Top Series</Heading>
          <VStack gap={1} align="stretch">
            {data.top_series.map((series, i) => (
              <HStack
                key={series.name}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                gap={3}
              >
                <Text fontSize="xs" color="var(--muted-text)" w="24px" textAlign="right">{i + 1}</Text>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{series.name}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)">
                    {series.read_count} / {series.issue_count} issues read
                  </Text>
                </Box>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Charts */}
      {(data.publishers.length > 0 || data.media_types.length > 0) && (
        <VegaProvider>
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            {data.publishers.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Publishers</Heading>
                <PublishersPieChart publishers={data.publishers} />
              </Box>
            )}
            {data.media_types.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Media Types</Heading>
                <MediaTypesPieChart mediaTypes={data.media_types} />
              </Box>
            )}
          </Grid>
        </VegaProvider>
      )}

      {/* Reading History */}
      {data.reading_history.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Reading History</Heading>
          <VStack gap={1} align="stretch">
            {data.reading_history.map((entry, i) => (
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
                  <BookImage size={12} color="var(--muted-text)" />
                </Box>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>
                    {entry.title || entry.series_name || 'Untitled'}
                    {entry.issue_number != null && ` #${entry.issue_number}`}
                  </Text>
                  {entry.series_name && entry.title && (
                    <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{entry.series_name}</Text>
                  )}
                </Box>
                <Text fontSize="2xs" color="var(--muted-text)">
                  {entry.last_read_at ? new Date(entry.last_read_at).toLocaleDateString() : ''}
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

const PublishersPieChart: React.FC<{ publishers: PublisherEntry[] }> = ({ publishers }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: publishers },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Publisher' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Publisher' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [publishers]);

  return <VegaPlot spec={spec} height="360px" />;
};

const MediaTypesPieChart: React.FC<{ mediaTypes: MediaTypeEntry[] }> = ({ mediaTypes }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: mediaTypes.map(m => ({ name: m.type, count: m.count })) },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Type' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Type' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [mediaTypes]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default ComicsStats;
