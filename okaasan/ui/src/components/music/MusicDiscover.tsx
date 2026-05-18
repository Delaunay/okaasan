import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { Compass, Music, Users, Disc3, Play, Plus, Shuffle } from 'lucide-react';
import { recipeAPI } from '../../services/api';
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

interface DiscoverData {
  genres: Genre[];
  top_artists: TopArtist[];
  random_tracks: MusicTrack[];
  recent_albums: RecentAlbum[];
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

const MusicDiscover: React.FC = () => {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const { play, addToQueue, shuffleAll } = useMusicPlayer();

  useEffect(() => {
    recipeAPI.request<DiscoverData>('/music/discover')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    recipeAPI.request<DiscoverData>('/music/discover')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

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
        <Compass size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">No music data available yet.</Text>
      </Flex>
    );
  }

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack>
          <Compass size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Discover</Heading>
        </HStack>
        <HStack>
          <Button size="sm" variant="outline" onClick={shuffleAll}>
            <Shuffle size={14} />
            <Text ml={1}>Shuffle All</Text>
          </Button>
        </HStack>
      </HStack>

      {/* Random Picks */}
      {data.random_tracks.length > 0 && (
        <Box>
          <HStack mb={3} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Random Picks</Heading>
            <Button size="xs" variant="ghost" onClick={refresh}>Refresh</Button>
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
                <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={(e) => { e.stopPropagation(); addToQueue(track); }}>
                  <Plus size={12} />
                </Button>
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

export default MusicDiscover;
