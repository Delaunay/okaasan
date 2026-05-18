import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, Headphones, CheckCircle, Clock, Users, Mic } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface AudiobooksSummary {
  total_audiobooks: number;
  completed: number;
  total_listen_time_ms: number;
  avg_duration_ms: number;
}

interface AuthorEntry {
  name: string;
  count: number;
}

interface NarratorEntry {
  name: string;
  count: number;
}

interface YearEntry {
  year: number;
  count: number;
}

interface StatsData {
  summary: AudiobooksSummary;
  authors: AuthorEntry[];
  narrators: NarratorEntry[];
  years: YearEntry[];
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

const AudiobooksStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recipeAPI.request<StatsData>('/audiobooks/stats')
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
        <Text color="var(--muted-text)">No audiobook stats available yet.</Text>
      </Flex>
    );
  }

  const { summary } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Audiobooks Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Headphones size={18} />} label="Total Audiobooks" value={summary.total_audiobooks.toLocaleString()} />
        <StatCard icon={<CheckCircle size={18} />} label="Completed" value={summary.completed.toLocaleString()} />
        <StatCard icon={<Clock size={18} />} label="Total Listen Time" value={formatDuration(summary.total_listen_time_ms)} />
        <StatCard icon={<Clock size={18} />} label="Avg Duration" value={formatDuration(summary.avg_duration_ms)} />
      </Grid>

      {/* Charts */}
      {(data.authors.length > 0 || data.narrators.length > 0 || data.years.length > 0) && (
        <VegaProvider>
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            {data.authors.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Authors</Heading>
                <AuthorsPieChart authors={data.authors} />
              </Box>
            )}
            {data.narrators.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Narrators</Heading>
                <NarratorsPieChart narrators={data.narrators} />
              </Box>
            )}
          </Grid>

          {/* Years Distribution */}
          {data.years.length > 0 && (
            <Box>
              <Heading size="md" color="var(--heading-color)" mb={3}>Years Distribution</Heading>
              <YearsBarChart years={data.years} />
            </Box>
          )}
        </VegaProvider>
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

const AuthorsPieChart: React.FC<{ authors: AuthorEntry[] }> = ({ authors }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: authors },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Author' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Author' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [authors]);

  return <VegaPlot spec={spec} height="360px" />;
};

const NarratorsPieChart: React.FC<{ narrators: NarratorEntry[] }> = ({ narrators }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: narrators },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Narrator' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Narrator' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [narrators]);

  return <VegaPlot spec={spec} height="360px" />;
};

const YearsBarChart: React.FC<{ years: YearEntry[] }> = ({ years }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: years.map(y => ({ year: String(y.year), count: y.count })).sort((a, b) => a.year.localeCompare(b.year)) },
    mark: { type: 'bar', tooltip: true, cornerRadiusEnd: 4 },
    encoding: {
      x: { field: 'year', type: 'nominal', axis: { title: 'Year', labelAngle: -45 }, sort: null },
      y: { field: 'count', type: 'quantitative', axis: { title: 'Audiobooks' } },
      color: { value: 'var(--icon-color)' },
      tooltip: [
        { field: 'year', type: 'nominal', title: 'Year' },
        { field: 'count', type: 'quantitative', title: 'Audiobooks' },
      ],
    },
  }), [years]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default AudiobooksStats;
