import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { Compass, Users, Disc3, RefreshCw, ExternalLink, Sparkles } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface Recommendation {
  name: string;
  mbid: string;
  reason: string;
  source_artist: string;
  genres: string[];
  tags: string[];
}

interface MissingAlbum {
  title: string;
  artist: string;
  type: string;
  mbid: string;
  year: string;
}

interface TasteProfile {
  top_genres: string[];
  seed_artists: string[];
}

interface DiscoverData {
  recommendations: Recommendation[];
  missing_albums: MissingAlbum[];
  taste_profile: TasteProfile;
}

const MusicDiscover: React.FC = () => {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    recipeAPI.request<DiscoverData>('/music/discover')
      .then(setData)
      .catch((e) => {
        console.error(e);
        setError('Failed to load recommendations. Make sure MusicBrainz metadata is enabled in Settings.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px" direction="column" gap={3}>
        <Spinner size="lg" />
        <Text fontSize="sm" color="var(--muted-text)">Finding new music for you...</Text>
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex justify="center" align="center" minH="200px" direction="column" gap={3}>
        <Compass size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">{error}</Text>
        <Button size="sm" variant="outline" onClick={fetchData}>
          <RefreshCw size={14} />
          <Text ml={1}>Retry</Text>
        </Button>
      </Flex>
    );
  }

  if (!data || (data.recommendations.length === 0 && data.missing_albums.length === 0)) {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Compass size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Discover</Heading>
        </HStack>
        <Flex justify="center" align="center" minH="200px" direction="column" gap={3}>
          <Sparkles size={48} color="var(--muted-text)" />
          <Text color="var(--muted-text)" textAlign="center">
            Not enough data to generate recommendations yet.
            Play some music so we can learn your taste!
          </Text>
          <Button size="sm" variant="outline" onClick={fetchData}>
            <RefreshCw size={14} />
            <Text ml={1}>Try Again</Text>
          </Button>
        </Flex>
      </VStack>
    );
  }

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack>
          <Compass size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Discover</Heading>
        </HStack>
        <Button size="sm" variant="outline" onClick={fetchData}>
          <RefreshCw size={14} />
          <Text ml={1}>Refresh</Text>
        </Button>
      </HStack>

      {/* Taste Profile Summary */}
      {data.taste_profile.top_genres.length > 0 && (
        <Box>
          <Text fontSize="sm" color="var(--muted-text)" mb={2}>
            Based on your taste in:
          </Text>
          <Flex flexWrap="wrap" gap={2}>
            {data.taste_profile.top_genres.map(g => (
              <Badge key={g} px={2} py={0.5} borderRadius="full" colorPalette="purple" variant="subtle" fontSize="xs">
                {g}
              </Badge>
            ))}
          </Flex>
        </Box>
      )}

      {/* Artist Recommendations */}
      {data.recommendations.length > 0 && (
        <Box>
          <HStack mb={3}>
            <Users size={18} color="var(--icon-color)" />
            <Heading size="md" color="var(--heading-color)">Artists You Might Like</Heading>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={3}>
            {data.recommendations.map(rec => (
              <Box
                key={rec.mbid || rec.name}
                p={4}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
                _hover={{ borderColor: 'var(--icon-color)', transform: 'translateY(-1px)' }}
                transition="all 0.2s"
              >
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="md" fontWeight="bold" lineClamp={1}>{rec.name}</Text>
                  {rec.mbid && (
                    <Box
                      as="a"
                      href={`https://musicbrainz.org/artist/${rec.mbid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      flexShrink={0}
                      color="var(--muted-text)"
                      _hover={{ color: 'var(--icon-color)' }}
                      title="View on MusicBrainz"
                    >
                      <ExternalLink size={14} />
                    </Box>
                  )}
                </HStack>
                <Text fontSize="xs" color="var(--muted-text)" mb={2}>
                  {rec.reason}
                </Text>
                {rec.genres.length > 0 && (
                  <Flex flexWrap="wrap" gap={1}>
                    {rec.genres.map(g => (
                      <Badge key={g} fontSize="2xs" variant="outline" borderRadius="full" px={1.5} colorPalette="blue">
                        {g}
                      </Badge>
                    ))}
                  </Flex>
                )}
                {rec.genres.length === 0 && rec.tags.length > 0 && (
                  <Flex flexWrap="wrap" gap={1}>
                    {rec.tags.slice(0, 4).map(t => (
                      <Badge key={t} fontSize="2xs" variant="outline" borderRadius="full" px={1.5}>
                        {t}
                      </Badge>
                    ))}
                  </Flex>
                )}
              </Box>
            ))}
          </Grid>
        </Box>
      )}

      {/* Albums You're Missing */}
      {data.missing_albums.length > 0 && (
        <Box>
          <HStack mb={3}>
            <Disc3 size={18} color="var(--icon-color)" />
            <Heading size="md" color="var(--heading-color)">Albums to Explore</Heading>
          </HStack>
          <Text fontSize="xs" color="var(--muted-text)" mb={3}>
            Releases from artists you listen to that aren't in your library yet.
          </Text>
          <Grid templateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={3}>
            {data.missing_albums.map(album => (
              <HStack
                key={album.mbid || `${album.artist}-${album.title}`}
                p={3}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
                _hover={{ borderColor: 'var(--icon-color)' }}
                transition="border-color 0.2s"
                gap={3}
              >
                <Box w="44px" h="44px" bg="var(--surface-muted)" borderRadius="md" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                  <Disc3 size={20} color="var(--muted-text)" />
                </Box>
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{album.title}</Text>
                  <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{album.artist}</Text>
                  <HStack gap={1} mt={0.5}>
                    <Badge fontSize="2xs" colorPalette="gray" variant="subtle">{album.type}</Badge>
                    {album.year && (
                      <Text fontSize="2xs" color="var(--muted-text)">{album.year}</Text>
                    )}
                  </HStack>
                </Box>
                {album.mbid && (
                  <Box
                    as="a"
                    href={`https://musicbrainz.org/release-group/${album.mbid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    flexShrink={0}
                    color="var(--muted-text)"
                    _hover={{ color: 'var(--icon-color)' }}
                    title="View on MusicBrainz"
                  >
                    <ExternalLink size={14} />
                  </Box>
                )}
              </HStack>
            ))}
          </Grid>
        </Box>
      )}
    </VStack>
  );
};

export default MusicDiscover;
