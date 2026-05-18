import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, Gamepad2, Monitor, Save, Layers } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface GamesSummary {
  total_games: number;
  platforms: number;
  total_saves: number;
}

interface PlatformEntry {
  name: string;
  game_count: number;
}

interface GenreEntry {
  name: string;
  count: number;
}

interface DecadeEntry {
  decade: string;
  count: number;
}

interface StatsData {
  summary: GamesSummary;
  top_platforms: PlatformEntry[];
  genres: GenreEntry[];
  decades: DecadeEntry[];
}

const GamesStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recipeAPI.request<StatsData>('/games/stats')
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
        <Text color="var(--muted-text)">No games stats available yet.</Text>
      </Flex>
    );
  }

  const { summary } = data;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Games Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Gamepad2 size={18} />} label="Total Games" value={summary.total_games.toLocaleString()} />
        <StatCard icon={<Monitor size={18} />} label="Platforms" value={summary.platforms.toLocaleString()} />
        <StatCard icon={<Save size={18} />} label="Save States" value={summary.total_saves.toLocaleString()} />
      </Grid>

      {/* Charts */}
      {(data.top_platforms.length > 0 || data.genres.length > 0 || data.decades.length > 0) && (
        <VegaProvider>
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            {data.top_platforms.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Platforms</Heading>
                <PlatformsPieChart platforms={data.top_platforms} />
              </Box>
            )}
            {data.genres.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Genres</Heading>
                <GenresPieChart genres={data.genres} />
              </Box>
            )}
            {data.decades.length > 0 && (
              <Box gridColumn={{ lg: data.top_platforms.length > 0 && data.genres.length > 0 ? 'span 2' : undefined }}>
                <Heading size="md" color="var(--heading-color)" mb={3}>Decades</Heading>
                <DecadesPieChart decades={data.decades} />
              </Box>
            )}
          </Grid>
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

const PlatformsPieChart: React.FC<{ platforms: PlatformEntry[] }> = ({ platforms }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: platforms.map(p => ({ name: p.name, count: p.game_count })) },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Platform' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Platform' },
        { field: 'count', type: 'quantitative', title: 'Games' },
      ],
    },
  }), [platforms]);

  return <VegaPlot spec={spec} height="360px" />;
};

const GenresPieChart: React.FC<{ genres: GenreEntry[] }> = ({ genres }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: genres },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Genre' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Genre' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [genres]);

  return <VegaPlot spec={spec} height="360px" />;
};

const DecadesPieChart: React.FC<{ decades: DecadeEntry[] }> = ({ decades }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: { values: decades.map(d => ({ name: d.decade, count: d.count })) },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true },
      color: {
        field: 'name',
        type: 'nominal',
        legend: { title: 'Decade' },
        scale: { scheme: 'category10' },
      },
      tooltip: [
        { field: 'name', type: 'nominal', title: 'Decade' },
        { field: 'count', type: 'quantitative', title: 'Games' },
      ],
    },
  }), [decades]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default GamesStats;
