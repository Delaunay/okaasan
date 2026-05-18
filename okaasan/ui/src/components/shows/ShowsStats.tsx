import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, Film, Tv, Star } from 'lucide-react';
import { VegaProvider } from '../../contexts/VegaContext';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';
import GenreChart from './GenreChart';
import CountryChart from './CountryChart';

interface MediaTypeStats {
  ratings_distribution: Record<number, number>;
  top_genres: [string, number][];
  top_countries: [string, number][];
  total_ratings: number;
}

interface StatsData {
  user_stats: Record<string, any>;
  total_shows_watched: number;
  total_movies_watched: number;
  ratings_distribution: Record<number, number>;
  top_genres: [string, number][];
  top_countries: [string, number][];
  total_ratings: number;
  shows: MediaTypeStats;
  movies: MediaTypeStats;
}

type StatsTab = 'all' | 'shows' | 'movies';

const ShowsStats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatsTab>('all');

  useEffect(() => {
    recipeAPI.request<StatsData>('/shows/stats')
      .then(setStats)
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

  if (!stats) {
    return <Text color="var(--muted-text)">Failed to load stats.</Text>;
  }

  const current: MediaTypeStats = tab === 'shows' ? stats.shows
    : tab === 'movies' ? stats.movies
    : { ratings_distribution: stats.ratings_distribution, top_genres: stats.top_genres, top_countries: stats.top_countries, total_ratings: stats.total_ratings };

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} />
        <Heading size="lg" color="var(--heading-color)">Viewing Stats</Heading>
        <TMDBAttribution />
      </HStack>

      {/* Key Metrics */}
      <Grid templateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap={4}>
        <MetricCard icon={<Film size={20} />} label="Movies" value={stats.total_movies_watched} />
        <MetricCard icon={<Tv size={20} />} label="Shows" value={stats.total_shows_watched} />
        <MetricCard icon={<Star size={20} />} label="Ratings" value={stats.total_ratings} />
      </Grid>

      {/* Filter tabs */}
      <HStack gap={2}>
        <TabButton label="All" active={tab === 'all'} onClick={() => setTab('all')} />
        <TabButton label="TV Shows" icon={<Tv size={14} />} active={tab === 'shows'} onClick={() => setTab('shows')} />
        <TabButton label="Movies" icon={<Film size={14} />} active={tab === 'movies'} onClick={() => setTab('movies')} />
      </HStack>

      {/* Ratings Distribution */}
      <Box>
        <Heading size="sm" mb={4} color="var(--heading-color)">Ratings Distribution</Heading>
        <RatingsChart distribution={current.ratings_distribution || {}} />
      </Box>

      {/* Top Genres & Countries */}
      <VegaProvider>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
          <Box>
            <Heading size="sm" mb={4} color="var(--heading-color)">Top Genres</Heading>
            <GenreChart genres={current.top_genres} />
          </Box>
          <Box>
            <Heading size="sm" mb={4} color="var(--heading-color)">By Country</Heading>
            <CountryChart countries={current.top_countries} />
          </Box>
        </Grid>
      </VegaProvider>
    </VStack>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <Box
    p={4}
    borderRadius="lg"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">{value.toLocaleString()}</Text>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
  </Box>
);

const TabButton: React.FC<{ label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }> = ({
  label, icon, active, onClick
}) => (
  <Box
    px={3}
    py={1.5}
    borderRadius="md"
    cursor="pointer"
    fontWeight={active ? 'bold' : 'normal'}
    bg={active ? 'var(--selected-bg)' : 'transparent'}
    borderWidth="1px"
    borderColor={active ? 'var(--panel-blue-border)' : 'var(--border-color)'}
    onClick={onClick}
    transition="all 0.2s"
    _hover={{ borderColor: 'var(--panel-blue-border)' }}
  >
    <HStack gap={1}>
      {icon}
      <Text fontSize="sm">{label}</Text>
    </HStack>
  </Box>
);

const RatingsChart: React.FC<{ distribution: Record<string, number> }> = ({ distribution }) => {
  const maxVal = Math.max(...Object.values(distribution), 1);

  return (
    <HStack gap={1} align="end" h="120px">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(rating => {
        const count = distribution[String(rating)] || 0;
        const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
        return (
          <VStack key={rating} gap={1} flex={1}>
            <Text fontSize="xs" color="var(--muted-text)">{count}</Text>
            <Box
              w="100%"
              h={`${Math.max(height, 4)}px`}
              bg={rating >= 7 ? 'green.400' : rating >= 4 ? 'yellow.400' : 'red.400'}
              borderRadius="sm"
              transition="height 0.3s"
            />
            <Text fontSize="xs" fontWeight="bold">{rating}</Text>
          </VStack>
        );
      })}
    </HStack>
  );
};

export default ShowsStats;
