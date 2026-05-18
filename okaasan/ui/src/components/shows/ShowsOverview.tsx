import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Film, Tv, Clock } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import MediaCard from './MediaCard';
import TMDBAttribution from './TMDBAttribution';

interface OverviewData {
  recently_watched: any[];
  watchlist_next: any[];
  stats_summary: {
    total_shows?: number;
    total_movies?: number;
    total_history?: number;
    movies?: { plays: number; watched: number; minutes: number };
    shows?: { watched: number };
    episodes?: { plays: number; watched: number; minutes: number };
  };
}

const ShowsOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/shows/overview')
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
    return <Text color="var(--muted-text)">Failed to load shows data.</Text>;
  }

  const stats = data.stats_summary || {};
  const totalMovies = stats.total_movies ?? stats.movies?.watched ?? 0;
  const totalShows = stats.total_shows ?? stats.shows?.watched ?? 0;
  const totalHistory = stats.total_history ?? stats.episodes?.watched ?? 0;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="flex-end">
        <TMDBAttribution />
      </HStack>

      {/* Stats Summary */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Film size={18} />} label="Movies" value={totalMovies} />
        <StatCard icon={<Tv size={18} />} label="Shows" value={totalShows} />
        <StatCard icon={<Clock size={18} />} label="Watch Events" value={totalHistory} />
      </Grid>

      {/* Recently Watched */}
      <Box>
        <HStack mb={4} justify="space-between">
          <Heading size="md" color="var(--heading-color)">Recently Watched</Heading>
          <Text
            fontSize="sm"
            color="var(--icon-color)"
            cursor="pointer"
            onClick={() => navigate('/shows-history')}
          >
            View All
          </Text>
        </HStack>
        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {data.recently_watched.map((item, idx) => (
            <MediaCard key={idx} item={item} />
          ))}
        </Grid>
      </Box>

      {/* Watchlist */}
      <Box>
        <HStack mb={4} justify="space-between">
          <Heading size="md" color="var(--heading-color)">Up Next (Watchlist)</Heading>
          <Text
            fontSize="sm"
            color="var(--icon-color)"
            cursor="pointer"
            onClick={() => navigate('/shows-watchlist')}
          >
            View All
          </Text>
        </HStack>
        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {data.watchlist_next.map((item, idx) => (
            <MediaCard key={idx} item={item} />
          ))}
        </Grid>
      </Box>
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
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

export default ShowsOverview;
