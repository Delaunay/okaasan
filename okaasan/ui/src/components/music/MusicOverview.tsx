import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Music, Users, Disc3, ListMusic, Play, Plus, Shuffle } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';

interface Genre {
  name: string;
  count: number;
}

interface TopArtist {
  name: string;
  track_count: number;
  album_count: number;
  cover_path: string | null;
}

interface RecentAlbum {
  name: string;
  artist: string;
  year: number | null;
  track_count: number;
  cover_path: string | null;
}

interface OverviewData {
  stats: {
    total_tracks: number;
    total_albums: number;
    total_artists: number;
    total_playlists: number;
  };
  genres: Genre[];
  top_artists: TopArtist[];
  random_tracks: MusicTrack[];
  recent_albums: RecentAlbum[];
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

const MusicOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { play, addToQueue, shuffleAll } = useMusicPlayer();

  const fetchData = () => {
    setLoading(true);
    recipeAPI.request<OverviewData>('/music/overview')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

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
        <HStack>
          {stats.total_tracks > 0 && (
            <Button size="sm" variant="outline" onClick={shuffleAll}>
              <Shuffle size={14} />
              <Text ml={1}>Shuffle All</Text>
            </Button>
          )}
        </HStack>
      </HStack>

      {/* Stats */}
      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<ListMusic size={18} />} label="Tracks" value={stats.total_tracks} onClick={() => navigate('/music-library')} />
        <StatCard icon={<Disc3 size={18} />} label="Albums" value={stats.total_albums} onClick={() => navigate('/music-library')} />
        <StatCard icon={<Users size={18} />} label="Artists" value={stats.total_artists} onClick={() => navigate('/music-library')} />
      </Grid>

      {/* Random Picks */}
      {data.random_tracks.length > 0 && (
        <Box>
          <HStack mb={3} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Random Picks</Heading>
            <Button size="xs" variant="ghost" onClick={fetchData}>Refresh</Button>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={3}>
            {data.random_tracks.map(track => (
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
                gap={2}
              >
                {track.cover_path ? (
                  <Box as="img" src={resolveCover(track.cover_path)} w="36px" h="36px" borderRadius="sm" objectFit="cover" flexShrink={0} />
                ) : (
                  <Box w="36px" h="36px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                    <Music size={14} color="var(--muted-text)" />
                  </Box>
                )}
                <Box flex={1} minW={0}>
                  <Text fontSize="xs" fontWeight="semibold" lineClamp={1}>{track.title}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.artist}</Text>
                </Box>
                <HStack gap={0}>
                  <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={(e) => { e.stopPropagation(); play(track); }}>
                    <Play size={12} />
                  </Button>
                  <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={(e) => { e.stopPropagation(); addToQueue(track); }}>
                    <Plus size={12} />
                  </Button>
                </HStack>
              </HStack>
            ))}
          </Grid>
        </Box>
      )}

      {/* Genres */}
      {data.genres.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Genres</Heading>
          <Flex flexWrap="wrap" gap={2}>
            {data.genres.map(g => (
              <Badge
                key={g.name}
                px={3} py={1}
                borderRadius="full"
                colorPalette="blue"
                variant="subtle"
                fontSize="xs"
                cursor="default"
              >
                {g.name} ({g.count})
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      {/* Top Artists */}
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
                  w="56px" h="56px" mx="auto" mb={2}
                  borderRadius="full" bg="var(--surface-muted)"
                  display="flex" alignItems="center" justifyContent="center"
                  overflow="hidden"
                >
                  {artist.cover_path ? (
                    <Box as="img" src={resolveCover(artist.cover_path)} w="100%" h="100%" objectFit="cover" />
                  ) : (
                    <Users size={24} color="var(--muted-text)" />
                  )}
                </Box>
                <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{artist.name}</Text>
                <Text fontSize="2xs" color="var(--muted-text)">
                  {artist.track_count} tracks · {artist.album_count} albums
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>
      )}

      {/* Recent Albums */}
      {data.recent_albums.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Recently Added Albums</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
            {data.recent_albums.map(album => (
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
                    <Disc3 size={32} color="var(--muted-text)" />
                  )}
                </Box>
                <Box p={2}>
                  <Text fontSize="xs" fontWeight="semibold" lineClamp={1}>{album.name}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{album.artist}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)">{album.track_count} tracks{album.year ? ` · ${album.year}` : ''}</Text>
                </Box>
              </Box>
            ))}
          </Grid>
        </Box>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number; onClick?: () => void }> = ({ icon, label, value, onClick }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    border="1px solid"
    borderColor="var(--border-color)"
    borderRadius="lg"
    textAlign="center"
    cursor={onClick ? 'pointer' : 'default'}
    _hover={onClick ? { borderColor: 'var(--icon-color)' } : undefined}
    onClick={onClick}
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">
      {icon}
    </Flex>
    <Text fontSize="2xl" fontWeight="bold">{value}</Text>
    <Text fontSize="sm" color="var(--muted-text)">{label}</Text>
  </Box>
);

export default MusicOverview;
