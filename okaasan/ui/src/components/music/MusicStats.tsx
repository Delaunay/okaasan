import React, { useEffect, useState, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge } from '@chakra-ui/react';
import { BarChart3, Music, Users, Disc3, Clock, Play, TrendingUp } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface StatsData {
  summary: {
    total_tracks: number;
    total_plays: number;
    total_duration_ms: number;
    total_listening_ms: number;
    unplayed_count: number;
  };
  most_played: (MusicTrack & { play_count: number })[];
  recently_played: (MusicTrack & { play_count: number; last_played_at: string })[];
  top_artists: { name: string; total_plays: number; track_count: number; cover_path: string | null }[];
  top_albums: { name: string; artist: string; total_plays: number; track_count: number; cover_path: string | null }[];
  genres: { name: string; track_count: number; total_plays: number; total_duration_ms: number }[];
  years: { year: number; track_count: number; total_plays: number }[];
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined;
  if (coverPath.startsWith('/uploads/') || coverPath.startsWith('uploads/')) {
    return `/api/${coverPath.replace(/^\//, '')}`;
  }
  if (coverPath.startsWith('/')) return `/api${coverPath}`;
  if (coverPath.startsWith('http')) return coverPath;
  return `/api/${coverPath}`;
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

const MusicStats: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { play } = useMusicPlayer();

  useEffect(() => {
    recipeAPI.request<StatsData>('/music/stats')
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
        <Text color="var(--muted-text)">No stats available yet. Play some music!</Text>
      </Flex>
    );
  }

  const { summary } = data;
  const playedPercent = summary.total_tracks > 0
    ? Math.round(((summary.total_tracks - summary.unplayed_count) / summary.total_tracks) * 100)
    : 0;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <BarChart3 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Music Stats</Heading>
      </HStack>

      {/* Summary Cards */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Play size={18} />} label="Total Plays" value={summary.total_plays.toLocaleString()} />
        <StatCard icon={<Clock size={18} />} label="Listening Time" value={formatDuration(summary.total_listening_ms)} />
        <StatCard icon={<Music size={18} />} label="Library Size" value={formatDuration(summary.total_duration_ms)} />
        <StatCard icon={<TrendingUp size={18} />} label="Played" value={`${playedPercent}%`} subtitle={`${summary.unplayed_count} unplayed`} />
      </Grid>

      {/* Most Played Tracks */}
      {data.most_played.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Most Played Tracks</Heading>
          <VStack gap={1} align="stretch">
            {data.most_played.map((track, i) => (
              <HStack
                key={track.id}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                _hover={{ borderColor: 'var(--icon-color)', bg: 'var(--hover-bg)' }}
                cursor="pointer"
                onClick={() => play(track)}
                gap={3}
              >
                <Text fontSize="xs" color="var(--muted-text)" w="24px" textAlign="right">{i + 1}</Text>
                {track.cover_path ? (
                  <Box as="img" src={resolveCover(track.cover_path)} w="32px" h="32px" borderRadius="sm" objectFit="cover" flexShrink={0} />
                ) : (
                  <Box w="32px" h="32px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                    <Music size={12} color="var(--muted-text)" />
                  </Box>
                )}
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{track.title}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.artist}{track.album ? ` — ${track.album}` : ''}</Text>
                </Box>
                <Badge colorPalette="blue" variant="subtle" fontSize="xs">
                  {track.play_count} plays
                </Badge>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Top Artists by plays */}
      {data.top_artists.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Top Artists</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={3}>
            {data.top_artists.map(artist => (
              <Box
                key={artist.name}
                p={3}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
                textAlign="center"
              >
                <Box
                  w="48px" h="48px" mx="auto" mb={2}
                  borderRadius="full" bg="var(--surface-muted)"
                  display="flex" alignItems="center" justifyContent="center"
                  overflow="hidden"
                >
                  {artist.cover_path ? (
                    <Box as="img" src={resolveCover(artist.cover_path)} w="100%" h="100%" objectFit="cover" />
                  ) : (
                    <Users size={20} color="var(--muted-text)" />
                  )}
                </Box>
                <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{artist.name}</Text>
                <Text fontSize="2xs" color="var(--muted-text)">
                  {artist.total_plays} plays · {artist.track_count} tracks
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>
      )}

      {/* Top Albums by plays */}
      {data.top_albums.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Top Albums</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
            {data.top_albums.map(album => (
              <Box
                key={`${album.name}-${album.artist}`}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
                overflow="hidden"
              >
                <Box w="100%" aspectRatio="1" bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center">
                  {album.cover_path ? (
                    <Box as="img" src={resolveCover(album.cover_path)} w="100%" h="100%" objectFit="cover" />
                  ) : (
                    <Disc3 size={28} color="var(--muted-text)" />
                  )}
                </Box>
                <Box p={2}>
                  <Text fontSize="xs" fontWeight="semibold" lineClamp={1}>{album.name}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{album.artist}</Text>
                  <Badge colorPalette="purple" variant="subtle" fontSize="2xs" mt={1}>
                    {album.total_plays} plays
                  </Badge>
                </Box>
              </Box>
            ))}
          </Grid>
        </Box>
      )}

      {/* Charts */}
      {(data.genres.length > 0 || data.years.length > 0) && (
        <VegaProvider>
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
            {data.genres.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Genre Breakdown</Heading>
                <GenrePieChart genres={data.genres} />
              </Box>
            )}
            {data.years.length > 0 && (
              <Box>
                <Heading size="md" color="var(--heading-color)" mb={3}>Decades</Heading>
                <DecadePieChart years={data.years} />
              </Box>
            )}
          </Grid>
        </VegaProvider>
      )}

      {/* Recently Played */}
      {data.recently_played.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Recently Played</Heading>
          <VStack gap={1} align="stretch">
            {data.recently_played.map(track => (
              <HStack
                key={track.id}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                _hover={{ borderColor: 'var(--icon-color)', bg: 'var(--hover-bg)' }}
                cursor="pointer"
                onClick={() => play(track)}
                gap={3}
              >
                {track.cover_path ? (
                  <Box as="img" src={resolveCover(track.cover_path)} w="32px" h="32px" borderRadius="sm" objectFit="cover" flexShrink={0} />
                ) : (
                  <Box w="32px" h="32px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                    <Music size={12} color="var(--muted-text)" />
                  </Box>
                )}
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{track.title}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.artist}</Text>
                </Box>
                <Text fontSize="2xs" color="var(--muted-text)">
                  {track.last_played_at ? new Date(track.last_played_at).toLocaleDateString() : ''}
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
    <Flex justify="center" mb={2} color="var(--icon-color)">
      {icon}
    </Flex>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    <Text fontSize="sm" color="var(--muted-text)">{label}</Text>
    {subtitle && <Text fontSize="2xs" color="var(--muted-text)">{subtitle}</Text>}
  </Box>
);

const GenrePieChart: React.FC<{ genres: { name: string; track_count: number; total_plays: number }[] }> = ({ genres }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container',
    height: 300,
    data: {
      values: genres.map(g => ({ genre: g.name, tracks: g.track_count })),
    },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'tracks', type: 'quantitative', stack: true },
      color: {
        field: 'genre',
        type: 'nominal',
        legend: { title: 'Genre' },
        scale: { scheme: 'tableau20' },
      },
      tooltip: [
        { field: 'genre', type: 'nominal', title: 'Genre' },
        { field: 'tracks', type: 'quantitative', title: 'Tracks' },
      ],
    },
  }), [genres]);

  return <VegaPlot spec={spec} height="360px" />;
};

const DecadePieChart: React.FC<{ years: { year: number; track_count: number; total_plays: number }[] }> = ({ years }) => {
  const spec = useMemo(() => {
    const decadeMap: Record<string, number> = {};
    for (const y of years) {
      const decade = `${Math.floor(y.year / 10) * 10}s`;
      decadeMap[decade] = (decadeMap[decade] || 0) + y.track_count;
    }
    const values = Object.entries(decadeMap)
      .map(([decade, tracks]) => ({ decade, tracks }))
      .sort((a, b) => a.decade.localeCompare(b.decade));

    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 300,
      data: { values },
      mark: { type: 'arc', innerRadius: 50, tooltip: true },
      encoding: {
        theta: { field: 'tracks', type: 'quantitative', stack: true },
        color: {
          field: 'decade',
          type: 'nominal',
          legend: { title: 'Decade' },
          scale: { scheme: 'category10' },
        },
        tooltip: [
          { field: 'decade', type: 'nominal', title: 'Decade' },
          { field: 'tracks', type: 'quantitative', title: 'Tracks' },
        ],
      },
    };
  }, [years]);

  return <VegaPlot spec={spec} height="360px" />;
};

export default MusicStats;
