import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Music, Disc3, Users, ListMusic, Shuffle } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';

interface MusicOverviewData {
  recent_tracks: MusicTrack[];
  stats: {
    total_tracks: number;
    total_albums: number;
    total_artists: number;
    total_playlists: number;
  };
}

const MusicOverview: React.FC = () => {
  const [data, setData] = useState<MusicOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { play, addToQueue, shuffleAll } = useMusicPlayer();

  useEffect(() => {
    recipeAPI.request<MusicOverviewData>('/music/overview')
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
        <Music size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">
          No music data available. Configure your music library in Settings.
        </Text>
      </Flex>
    );
  }

  const stats = data.stats;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack>
          <Music size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Music</Heading>
        </HStack>
        {stats.total_tracks > 0 && (
          <Button size="sm" variant="outline" onClick={shuffleAll}>
            <Shuffle size={14} />
            <Text ml={1}>Shuffle All</Text>
          </Button>
        )}
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<ListMusic size={18} />} label="Tracks" value={stats.total_tracks} />
        <StatCard icon={<Disc3 size={18} />} label="Albums" value={stats.total_albums} />
        <StatCard icon={<Users size={18} />} label="Artists" value={stats.total_artists} />
      </Grid>

      {data.recent_tracks.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Recently Added</Heading>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/music-library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.recent_tracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                onPlay={() => play(track)}
                onQueue={() => addToQueue(track)}
              />
            ))}
          </Grid>
        </Box>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    border="1px solid"
    borderColor="var(--border-color)"
    borderRadius="lg"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">
      {icon}
    </Flex>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    <Text fontSize="sm" color="var(--muted-text)">{label}</Text>
  </Box>
);

const TrackCard: React.FC<{
  track: MusicTrack;
  onPlay: () => void;
  onQueue: () => void;
}> = ({ track, onPlay }) => {
  const coverSrc = track.cover_path
    ? (track.cover_path.startsWith('/') ? `/api${track.cover_path}` : `/api/${track.cover_path}`)
    : null;

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor="pointer"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      onClick={onPlay}
    >
      {coverSrc ? (
        <Box
          as="img"
          src={coverSrc}
          alt={track.title}
          w="100%"
          h="160px"
          objectFit="cover"
          loading="lazy"
        />
      ) : (
        <Box
          w="100%"
          h="160px"
          bg="var(--surface-muted)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Music size={48} color="var(--muted-text)" />
        </Box>
      )}
      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{track.title}</Text>
        <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{track.artist}</Text>
        {track.album && (
          <Badge colorPalette="gray" fontSize="2xs" mt={1}>{track.album}</Badge>
        )}
      </Box>
    </Box>
  );
};

export default MusicOverview;
