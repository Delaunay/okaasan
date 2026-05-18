import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Text, Image, HStack, VStack, Badge, Spinner } from '@chakra-ui/react';
import { ArrowLeft, Star, Calendar, Clock, Globe } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

interface DetailData {
  media_type: string;
  tmdb_id: number;
  trakt?: any;
  tmdb?: any;
  poster_local?: string;
  backdrop_local?: string;
}

const ShowsDetail: React.FC = () => {
  const { mediaType, tmdbId } = useParams<{ mediaType: string; tmdbId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaType || !tmdbId) return;
    setLoading(true);
    setError(null);
    recipeAPI.request<DetailData>(`/shows/detail/${mediaType}/${tmdbId}`)
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load details'))
      .finally(() => setLoading(false));
  }, [mediaType, tmdbId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minH="300px">
        <Spinner size="lg" />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box p={6}>
        <Text color="red.500">{error || 'Not found'}</Text>
      </Box>
    );
  }

  const tmdb = data.tmdb;
  const trakt = data.trakt;
  const source = trakt?.show || trakt?.movie || {};

  const title = tmdb?.name || tmdb?.title || source.title || 'Unknown';
  const tagline = tmdb?.tagline;
  const overview = tmdb?.overview || source.overview;
  const year = tmdb?.first_air_date?.slice(0, 4) || tmdb?.release_date?.slice(0, 4) || source.year;
  const rating = tmdb?.vote_average;
  const runtime = tmdb?.runtime || tmdb?.episode_run_time?.[0];
  const genres = tmdb?.genres?.map((g: any) => g.name) || source.genres || [];
  const status = tmdb?.status;
  const networks = tmdb?.networks?.map((n: any) => n.name) || [];
  const seasons = tmdb?.number_of_seasons;
  const episodes = tmdb?.number_of_episodes;
  const country = tmdb?.origin_country?.[0] || tmdb?.production_countries?.[0]?.iso_3166_1 || source.country;
  const posterUrl = tmdb?.poster_path ? `${TMDB_IMAGE_BASE}/w500${tmdb.poster_path}` : null;
  const backdropUrl = tmdb?.backdrop_path ? `${TMDB_IMAGE_BASE}/w1280${tmdb.backdrop_path}` : null;
  const nextEpisode = tmdb?.next_episode_to_air;
  const lastEpisode = tmdb?.last_episode_to_air;

  // Trakt-specific data
  const traktRating = trakt?.show?.rating || trakt?.movie?.rating;
  const plays = trakt?.plays;
  const lastWatched = trakt?.last_watched_at;

  return (
    <Box>
      {/* Backdrop */}
      {backdropUrl && (
        <Box
          position="relative"
          h={{ base: '200px', md: '350px' }}
          overflow="hidden"
          borderRadius="lg"
          mb={6}
        >
          <Image
            src={backdropUrl}
            alt={title}
            w="100%"
            h="100%"
            objectFit="cover"
          />
          <Box
            position="absolute"
            bottom={0}
            left={0}
            right={0}
            h="60%"
            bgGradient="to-t"
            gradientFrom="var(--page-bg)"
            gradientTo="transparent"
          />
        </Box>
      )}

      {/* Back button */}
      <HStack mb={4} justify="space-between">
        <HStack
          cursor="pointer"
          onClick={() => navigate(-1)}
          color="var(--icon-color)"
          gap={1}
          display="inline-flex"
        >
          <ArrowLeft size={18} />
          <Text fontSize="sm">Back</Text>
        </HStack>
        <TMDBAttribution />
      </HStack>

      {/* Main content */}
      <Box display={{ md: 'flex' }} gap={8}>
        {/* Poster */}
        {posterUrl && (
          <Box flexShrink={0} mb={{ base: 4, md: 0 }}>
            <Image
              src={posterUrl}
              alt={title}
              w={{ base: '200px', md: '280px' }}
              borderRadius="lg"
              boxShadow="lg"
            />
          </Box>
        )}

        {/* Info */}
        <VStack align="start" gap={4} flex={1}>
          <Box>
            <Text fontSize="2xl" fontWeight="bold">{title}</Text>
            {tagline && (
              <Text fontSize="md" color="var(--muted-text)" fontStyle="italic">{tagline}</Text>
            )}
          </Box>

          {/* Meta row */}
          <HStack gap={4} flexWrap="wrap">
            {year && (
              <HStack gap={1} color="var(--muted-text)">
                <Calendar size={14} />
                <Text fontSize="sm">{year}</Text>
              </HStack>
            )}
            {rating && (
              <HStack gap={1} color="var(--muted-text)">
                <Star size={14} />
                <Text fontSize="sm">{rating.toFixed(1)} / 10</Text>
              </HStack>
            )}
            {runtime && (
              <HStack gap={1} color="var(--muted-text)">
                <Clock size={14} />
                <Text fontSize="sm">{runtime} min</Text>
              </HStack>
            )}
            {country && (
              <HStack gap={1} color="var(--muted-text)">
                <Globe size={14} />
                <Text fontSize="sm">{country}</Text>
              </HStack>
            )}
          </HStack>

          {/* Genres */}
          {genres.length > 0 && (
            <HStack gap={2} flexWrap="wrap">
              {genres.map((g: string) => (
                <Badge key={g} variant="subtle" colorPalette="blue" fontSize="xs">{g}</Badge>
              ))}
            </HStack>
          )}

          {/* Overview */}
          {overview && (
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={1}>Overview</Text>
              <Text fontSize="sm" color="var(--muted-text)" lineHeight="tall">{overview}</Text>
            </Box>
          )}

          {/* Show-specific info */}
          {data.media_type === 'show' && (seasons || episodes || status) && (
            <Box
              p={4}
              borderRadius="md"
              border="1px solid"
              borderColor="var(--border-color)"
              bg="var(--card-bg)"
              w="100%"
            >
              <HStack gap={6} flexWrap="wrap">
                {status && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Status</Text>
                    <Text fontSize="sm" fontWeight="medium">{status}</Text>
                  </Box>
                )}
                {seasons && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Seasons</Text>
                    <Text fontSize="sm" fontWeight="medium">{seasons}</Text>
                  </Box>
                )}
                {episodes && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Episodes</Text>
                    <Text fontSize="sm" fontWeight="medium">{episodes}</Text>
                  </Box>
                )}
                {networks.length > 0 && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Network</Text>
                    <Text fontSize="sm" fontWeight="medium">{networks.join(', ')}</Text>
                  </Box>
                )}
              </HStack>
            </Box>
          )}

          {/* Episode Airing Schedule */}
          {data.media_type === 'show' && (nextEpisode || lastEpisode) && (
            <Box
              p={4}
              borderRadius="md"
              border="1px solid"
              borderColor="var(--border-color)"
              bg="var(--card-bg)"
              w="100%"
            >
              <Text fontSize="xs" color="var(--muted-text)" mb={2}>Episode Schedule</Text>
              <VStack align="start" gap={3}>
                {nextEpisode && (
                  <Box>
                    <HStack gap={2}>
                      <Badge colorPalette="green" fontSize="xs">Next Episode</Badge>
                      <Text fontSize="sm" fontWeight="medium">
                        S{String(nextEpisode.season_number).padStart(2, '0')}E{String(nextEpisode.episode_number).padStart(2, '0')}
                        {nextEpisode.name && ` — ${nextEpisode.name}`}
                      </Text>
                    </HStack>
                    <HStack gap={1} mt={1} color="var(--muted-text)">
                      <Calendar size={12} />
                      <Text fontSize="xs">
                        Airs {new Date(nextEpisode.air_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </Text>
                    </HStack>
                    {nextEpisode.overview && (
                      <Text fontSize="xs" color="var(--muted-text)" mt={1} lineClamp={2}>{nextEpisode.overview}</Text>
                    )}
                  </Box>
                )}
                {lastEpisode && !nextEpisode && (
                  <Box>
                    <HStack gap={2}>
                      <Badge colorPalette="gray" fontSize="xs">Last Episode</Badge>
                      <Text fontSize="sm" fontWeight="medium">
                        S{String(lastEpisode.season_number).padStart(2, '0')}E{String(lastEpisode.episode_number).padStart(2, '0')}
                        {lastEpisode.name && ` — ${lastEpisode.name}`}
                      </Text>
                    </HStack>
                    <HStack gap={1} mt={1} color="var(--muted-text)">
                      <Calendar size={12} />
                      <Text fontSize="xs">
                        Aired {new Date(lastEpisode.air_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </Text>
                    </HStack>
                  </Box>
                )}
                {lastEpisode && nextEpisode && (
                  <Box>
                    <HStack gap={2}>
                      <Badge colorPalette="gray" fontSize="xs">Previous</Badge>
                      <Text fontSize="xs" color="var(--muted-text)">
                        S{String(lastEpisode.season_number).padStart(2, '0')}E{String(lastEpisode.episode_number).padStart(2, '0')}
                        {lastEpisode.name && ` — ${lastEpisode.name}`}
                        {' '}(aired {new Date(lastEpisode.air_date).toLocaleDateString()})
                      </Text>
                    </HStack>
                  </Box>
                )}
              </VStack>
            </Box>
          )}

          {/* Trakt stats */}
          {trakt && (
            <Box
              p={4}
              borderRadius="md"
              border="1px solid"
              borderColor="var(--border-color)"
              bg="var(--card-bg)"
              w="100%"
            >
              <Text fontSize="xs" color="var(--muted-text)" mb={2}>Your Activity (Trakt)</Text>
              <HStack gap={6} flexWrap="wrap">
                {traktRating && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Trakt Rating</Text>
                    <Text fontSize="sm" fontWeight="medium">{traktRating.toFixed(1)}</Text>
                  </Box>
                )}
                {plays && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Plays</Text>
                    <Text fontSize="sm" fontWeight="medium">{plays}</Text>
                  </Box>
                )}
                {lastWatched && (
                  <Box>
                    <Text fontSize="xs" color="var(--muted-text)">Last Watched</Text>
                    <Text fontSize="sm" fontWeight="medium">
                      {new Date(lastWatched).toLocaleDateString()}
                    </Text>
                  </Box>
                )}
              </HStack>
            </Box>
          )}
        </VStack>
      </Box>
    </Box>
  );
};

export default ShowsDetail;
