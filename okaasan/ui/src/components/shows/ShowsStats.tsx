import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { BarChart3, Film, Tv, Star } from 'lucide-react';
import { VegaProvider } from '../../contexts/VegaContext';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';
import GenreChart from './GenreChart';
import CountryChart from './CountryChart';

interface StatsData {
  user_stats: Record<string, any>;
  total_shows_watched: number;
  total_movies_watched: number;
  ratings_distribution: Record<number, number>;
  top_genres: [string, number][];
  top_countries: [string, number][];
  total_ratings: number;
}

const ShowsStats: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

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

      {/* Ratings Distribution */}
      <Box>
        <Heading size="sm" mb={4} color="var(--heading-color)">Ratings Distribution</Heading>
        <RatingsChart distribution={stats.ratings_distribution || {}} />
      </Box>

      {/* Top Genres & Countries */}
      <VegaProvider>
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
          <Box>
            <Heading size="sm" mb={4} color="var(--heading-color)">Top Genres</Heading>
            <GenreChart genres={stats.top_genres} />
          </Box>
          <Box>
            <Heading size="sm" mb={4} color="var(--heading-color)">By Country</Heading>
            <CountryChart countries={stats.top_countries} />
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
