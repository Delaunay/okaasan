import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Text, Image, HStack, VStack, Badge, Spinner, Button } from '@chakra-ui/react';
import { ArrowLeft, Star, Calendar, Clock, Globe, ChevronDown, ChevronRight, Tv, CheckCircle, Play } from 'lucide-react';
import { recipeAPI, isStaticMode, resolveMediaUrl } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';
import VideoPlayerModal from './VideoPlayerModal';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

interface DetailData {
  media_type: string;
  tmdb_id: number;
  trakt?: any;
  tmdb?: any;
  poster_local?: string;
  backdrop_local?: string;
}

interface LibraryFile {
  id: number;
  season: number | null;
  episode: number | null;
  title: string | null;
  container: string | null;
}

interface PlayerState {
  fileId: number;
  title: string;
  episodeLabel?: string;
  fileIndex: number;
}

const ShowsDetail: React.FC = () => {
  const { mediaType, tmdbId } = useParams<{ mediaType: string; tmdbId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);
  const [player, setPlayer] = useState<PlayerState | null>(null);

  useEffect(() => {
    if (!mediaType || !tmdbId) return;
    setLoading(true);
    setError(null);
    recipeAPI.request<DetailData>(`/shows/detail/${mediaType}/${tmdbId}`)
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load details'))
      .finally(() => setLoading(false));
    // Fetch library files
    recipeAPI.request<LibraryFile[]>(`/shows/library/files-by-tmdb/${tmdbId}`)
      .then(setLibraryFiles)
      .catch(() => setLibraryFiles([]));
  }, [mediaType, tmdbId]);

  const playFile = useCallback((file: LibraryFile, index: number, showTitle: string) => {
    const epLabel = file.season != null && file.episode != null
      ? `S${String(file.season).padStart(2, '0')}E${String(file.episode).padStart(2, '0')}`
      : undefined;
    setPlayer({ fileId: file.id, title: showTitle, episodeLabel: epLabel, fileIndex: index });
  }, []);

  const playNext = useCallback(() => {
    if (!player) return;
    const nextIdx = player.fileIndex + 1;
    if (nextIdx < libraryFiles.length) {
      const next = libraryFiles[nextIdx];
      playFile(next, nextIdx, player.title);
    }
  }, [player, libraryFiles, playFile]);

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
  const imdbId = tmdb?.imdb_id || source?.ids?.imdb;
  const posterUrl = tmdb?.poster_path
    ? (isStaticMode() ? resolveMediaUrl(data.poster_path) : `${TMDB_IMAGE_BASE}/w500${tmdb.poster_path}`)
    : resolveMediaUrl(data.poster_path) || null;
  const backdropUrl = tmdb?.backdrop_path && !isStaticMode()
    ? `${TMDB_IMAGE_BASE}/w1280${tmdb.backdrop_path}`
    : null;
  const nextEpisode = tmdb?.next_episode_to_air;
  const lastEpisode = tmdb?.last_episode_to_air;

  // Trakt-specific data
  const traktRating = trakt?.show?.rating || trakt?.movie?.rating;
  const plays = trakt?.plays;
  const lastWatched = trakt?.last_watched_at;

  const movieFile = data.media_type === 'movie' ? libraryFiles[0] : null;

  return (
    <Box>
      {/* Video Player Modal */}
      {player && (
        <VideoPlayerModal
          streamUrl={`/api/shows/library/stream/${player.fileId}`}
          title={player.title}
          episodeLabel={player.episodeLabel}
          onClose={() => setPlayer(null)}
          onNext={player.fileIndex < libraryFiles.length - 1 ? playNext : undefined}
          hasNext={player.fileIndex < libraryFiles.length - 1}
        />
      )}

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
            {imdbId && (
              <a href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noopener noreferrer">
                <HStack gap={1} color="var(--link-color)" _hover={{ textDecoration: 'underline' }}>
                  <Text fontSize="sm" fontWeight="semibold">IMDb</Text>
                </HStack>
              </a>
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

          {/* Play button for movies */}
          {movieFile && (
            <Button
              colorPalette="blue"
              size="sm"
              onClick={() => playFile(movieFile, 0, title)}
            >
              <Play size={16} />
              <Text ml={1}>Play</Text>
            </Button>
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

          {/* Seasons & Episodes */}
          {data.media_type === 'show' && tmdb?.seasons && tmdb.seasons.length > 0 && (
            <SeasonsBreakdown
              tmdbId={data.tmdb_id}
              seasons={tmdb.seasons}
              watchedSeasons={(data as any).watched_seasons || {}}
              libraryFiles={libraryFiles}
              onPlay={(file, idx) => playFile(file, idx, title)}
            />
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

interface SeasonInfo {
  season_number: number;
  name: string;
  episode_count: number;
  air_date?: string;
}

interface EpisodeDetail {
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number | null;
  watched?: boolean;
}

interface WatchedSeasonInfo {
  watched: number;
  total: number;
  complete: boolean;
}

const SeasonsBreakdown: React.FC<{
  tmdbId: number;
  seasons: SeasonInfo[];
  watchedSeasons: Record<number, WatchedSeasonInfo>;
  libraryFiles: LibraryFile[];
  onPlay: (file: LibraryFile, index: number) => void;
}> = ({ tmdbId, seasons, watchedSeasons, libraryFiles, onPlay }) => {
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, EpisodeDetail[]>>({});
  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  const toggleSeason = useCallback(async (seasonNumber: number) => {
    if (expandedSeason === seasonNumber) {
      setExpandedSeason(null);
      return;
    }
    setExpandedSeason(seasonNumber);

    if (episodes[seasonNumber]) return;

    setLoadingSeason(seasonNumber);
    try {
      const data = await recipeAPI.request<{ episodes: EpisodeDetail[] }>(
        `/shows/detail/tv/${tmdbId}/season/${seasonNumber}`
      );
      setEpisodes(prev => ({ ...prev, [seasonNumber]: data.episodes }));
    } catch {
      setEpisodes(prev => ({ ...prev, [seasonNumber]: [] }));
    } finally {
      setLoadingSeason(null);
    }
  }, [expandedSeason, episodes, tmdbId]);

  const regularSeasons = seasons.filter(s => s.season_number > 0);
  const specials = seasons.find(s => s.season_number === 0);

  return (
    <Box w="100%">
      <HStack mb={3} gap={2}>
        <Tv size={16} />
        <Text fontSize="sm" fontWeight="semibold">Seasons & Episodes</Text>
        <Badge colorPalette="blue" fontSize="xs">{regularSeasons.length} seasons</Badge>
      </HStack>
      <VStack align="stretch" gap={1}>
        {regularSeasons.map(season => (
          <Box key={season.season_number}>
            <Button
              variant="ghost"
              w="100%"
              justifyContent="flex-start"
              onClick={() => toggleSeason(season.season_number)}
              size="sm"
              px={3}
              py={2}
              h="auto"
              borderRadius="md"
              _hover={{ bg: 'var(--hover-bg)' }}
            >
              <HStack gap={2} w="100%">
                {expandedSeason === season.season_number ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {watchedSeasons[season.season_number]?.complete ? (
                  <CheckCircle size={16} color="green" />
                ) : (
                  <Box w="16px" h="16px" borderRadius="full" border="1.5px solid" borderColor="var(--border-color)" />
                )}
                <Text fontSize="sm" fontWeight="medium">{season.name || `Season ${season.season_number}`}</Text>
                {watchedSeasons[season.season_number] && !watchedSeasons[season.season_number].complete && (
                  <Text fontSize="xs" color="var(--muted-text)">
                    ({watchedSeasons[season.season_number].watched}/{watchedSeasons[season.season_number].total})
                  </Text>
                )}
                <Badge colorPalette="gray" fontSize="xs" ml="auto">{season.episode_count} eps</Badge>
                {season.air_date && (
                  <Text fontSize="xs" color="var(--muted-text)">{season.air_date.slice(0, 4)}</Text>
                )}
              </HStack>
            </Button>

            {expandedSeason === season.season_number && (
              <Box pl={6} pr={2} py={2}>
                {loadingSeason === season.season_number ? (
                  <Spinner size="sm" />
                ) : (episodes[season.season_number] || []).length > 0 ? (
                  <VStack align="stretch" gap={2}>
                    {episodes[season.season_number].map(ep => (
                      <HStack
                        key={ep.episode_number}
                        gap={3}
                        p={2}
                        borderRadius="md"
                        border="1px solid"
                        borderColor="var(--border-color)"
                        bg="var(--card-bg)"
                        align="center"
                      >
                        {ep.watched ? (
                          <CheckCircle size={16} color="green" />
                        ) : (
                          <Box w="16px" h="16px" borderRadius="full" border="1.5px solid" borderColor="var(--border-color)" />
                        )}
                        <Text fontSize="xs" fontWeight="bold" color="var(--muted-text)" minW="28px">
                          E{String(ep.episode_number).padStart(2, '0')}
                        </Text>
                        <Box flex={1}>
                          <Text fontSize="sm" fontWeight="medium">{ep.name || `Episode ${ep.episode_number}`}</Text>
                          <HStack gap={3} mt={0.5}>
                            {ep.air_date && (
                              <Text fontSize="xs" color="var(--muted-text)">{new Date(ep.air_date).toLocaleDateString()}</Text>
                            )}
                            {ep.runtime && (
                              <Text fontSize="xs" color="var(--muted-text)">{ep.runtime} min</Text>
                            )}
                            {ep.vote_average != null && ep.vote_average > 0 && (
                              <HStack gap={0.5}>
                                <Star size={10} />
                                <Text fontSize="xs" color="var(--muted-text)">{ep.vote_average.toFixed(1)}</Text>
                              </HStack>
                            )}
                          </HStack>
                        </Box>
                        {(() => {
                          const file = libraryFiles.find(f => f.season === season.season_number && f.episode === ep.episode_number);
                          if (!file) return null;
                          const idx = libraryFiles.indexOf(file);
                          return (
                            <Button size="xs" variant="ghost" onClick={() => onPlay(file, idx)} title="Play" p={1} minW="auto" h="auto">
                              <Play size={14} />
                            </Button>
                          );
                        })()}
                      </HStack>
                    ))}
                  </VStack>
                ) : (
                  <Text fontSize="xs" color="var(--muted-text)">No episode data available</Text>
                )}
              </Box>
            )}
          </Box>
        ))}
        {specials && (
          <Box>
            <Button
              variant="ghost"
              w="100%"
              justifyContent="flex-start"
              onClick={() => toggleSeason(0)}
              size="sm"
              px={3}
              py={2}
              h="auto"
              borderRadius="md"
              _hover={{ bg: 'var(--hover-bg)' }}
            >
              <HStack gap={2} w="100%">
                {expandedSeason === 0 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Text fontSize="sm" fontWeight="medium">Specials</Text>
                <Badge colorPalette="gray" fontSize="xs" ml="auto">{specials.episode_count} eps</Badge>
              </HStack>
            </Button>

            {expandedSeason === 0 && (
              <Box pl={6} pr={2} py={2}>
                {loadingSeason === 0 ? (
                  <Spinner size="sm" />
                ) : (episodes[0] || []).length > 0 ? (
                  <VStack align="stretch" gap={2}>
                    {episodes[0].map(ep => (
                      <HStack
                        key={ep.episode_number}
                        gap={3}
                        p={2}
                        borderRadius="md"
                        border="1px solid"
                        borderColor="var(--border-color)"
                        bg="var(--card-bg)"
                        align="flex-start"
                      >
                        <Text fontSize="xs" fontWeight="bold" color="var(--muted-text)" minW="28px">
                          E{String(ep.episode_number).padStart(2, '0')}
                        </Text>
                        <Box flex={1}>
                          <Text fontSize="sm" fontWeight="medium">{ep.name || `Episode ${ep.episode_number}`}</Text>
                          {ep.overview && (
                            <Text fontSize="xs" color="var(--muted-text)" lineClamp={2} mt={0.5}>{ep.overview}</Text>
                          )}
                          <HStack gap={3} mt={1}>
                            {ep.air_date && (
                              <Text fontSize="xs" color="var(--muted-text)">{new Date(ep.air_date).toLocaleDateString()}</Text>
                            )}
                            {ep.runtime && (
                              <Text fontSize="xs" color="var(--muted-text)">{ep.runtime} min</Text>
                            )}
                          </HStack>
                        </Box>
                      </HStack>
                    ))}
                  </VStack>
                ) : (
                  <Text fontSize="xs" color="var(--muted-text)">No episode data available</Text>
                )}
              </Box>
            )}
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default ShowsDetail;
