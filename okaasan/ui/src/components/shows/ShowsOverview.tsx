import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, IconButton, Image, Badge } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import MediaCard from './MediaCard';
import LibraryCard from './LibraryCard';
import type { LibraryFile, GroupedMedia } from './LibraryCard';
import VideoPlayerModal from './VideoPlayerModal';
import TMDBAttribution from './TMDBAttribution';

interface RecentlyAddedItem {
  id?: number;
  media_id: number;
  media_type: string;
  title?: string;
  db_title?: string;
  poster_path?: string;
  year?: number;
  season?: number | null;
  episode?: number | null;
  file_path?: string;
  file_size?: number | null;
  container?: string | null;
  matched?: boolean;
  is_watched?: boolean;
}

interface OverviewData {
  recently_added_shows: RecentlyAddedItem[];
  recently_added_movies: RecentlyAddedItem[];
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

interface UpcomingEpisode {
  id: number;
  title: string;
  tmdb_id: number;
  poster_path: string | null;
  media_type: string;
  episode: {
    season: number;
    episode: number;
    name?: string;
    air_date?: string;
    overview?: string;
  };
}

interface ScheduleData {
  upcoming: UpcomingEpisode[];
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function getNext7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

const ShowsOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [player, setPlayer] = useState<{ title: string; files: LibraryFile[] } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/shows/overview')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
    recipeAPI.request<ScheduleData>('/shows/schedule')
      .then(setSchedule)
      .catch(() => {});
    recipeAPI.request<{ ids: number[] }>('/shows/favorites/ids')
      .then(r => setFavoriteIds(new Set(r.ids)))
      .catch(() => { });
  }, []);

  const toggleFavorite = useCallback(async (mediaId: number) => {
    try {
      await recipeAPI.request('/shows/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId }),
      });
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (next.has(mediaId)) next.delete(mediaId);
        else next.add(mediaId);
        return next;
      });
    } catch (e) { console.error(e); }
  }, []);

  const markWatched = useCallback(async (mediaId: number) => {
    try {
      await recipeAPI.request('/shows/history', {
        method: 'POST',
        body: JSON.stringify({ media_id: mediaId }),
      });
    } catch (e) { console.error(e); }
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

  // Convert items into GroupedMedia for LibraryCard
  const toGroups = (items: RecentlyAddedItem[]): GroupedMedia[] =>
    items.map((item) => {
      const file: LibraryFile = {
        id: item.id || 0,
        media_id: item.media_id,
        media_type: item.media_type,
        tmdb_id: null,
        title: item.db_title || item.title || null,
        db_title: item.db_title || item.title || null,
        season: item.season ?? null,
        episode: item.episode ?? null,
        file_path: item.file_path || '',
        file_size: item.file_size ?? null,
        container: item.container ?? null,
        matched: item.matched !== false,
        poster_path: item.poster_path || null,
        year: item.year ?? null,
      };
      return {
        key: `recent-${item.media_id}`,
        title: item.db_title || item.title || 'Unknown',
        media_type: item.media_type,
        tmdb_id: null,
        media_id: item.media_id,
        matched: item.matched !== false,
        poster_path: item.poster_path || null,
        year: item.year ?? null,
        files: [file],
      };
    });

  const showGroups = toGroups(data.recently_added_shows);
  const movieGroups = toGroups(data.recently_added_movies);

  const days = getNext7Days();
  const upcomingByDay: Record<string, UpcomingEpisode[]> = {};
  for (const day of days) upcomingByDay[day] = [];
  for (const item of schedule?.upcoming || []) {
    const d = item.episode.air_date;
    if (d && upcomingByDay[d]) upcomingByDay[d].push(item);
  }
  const hasUpcoming = schedule?.upcoming && schedule.upcoming.length > 0;

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack justify="flex-end">
        <TMDBAttribution />
      </HStack>

      {/* Upcoming This Week */}
      {hasUpcoming && (
        <Box>
          <HStack mb={4} justify="space-between">
            <HStack>
              <Calendar size={18} />
              <Heading size="md" color="var(--heading-color)">Airing This Week</Heading>
              <Badge colorPalette="blue" ml={1}>{schedule!.upcoming.length}</Badge>
            </HStack>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/shows/schedule')}
            >
              Full Schedule
            </Text>
          </HStack>
          <Flex gap={2} overflowX="auto" pb={2} mx={8} css={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}>
            {days.map(day => {
              const items = upcomingByDay[day];
              if (items.length === 0) return null;
              return (
                <Box key={day} minW="160px" flexShrink={0}>
                  <Text fontSize="xs" fontWeight="bold" mb={1} color="var(--muted-text)" textAlign="center">
                    {getDayLabel(day)}
                  </Text>
                  <VStack gap={2}>
                    {items.map(item => (
                      <Box
                        key={`${item.tmdb_id}-${item.episode.season}-${item.episode.episode}`}
                        borderRadius="md"
                        overflow="hidden"
                        border="1px solid"
                        borderColor="var(--border-color)"
                        bg="var(--card-bg)"
                        w="160px"
                        cursor="pointer"
                        onClick={() => navigate(`/shows/detail/tv/${item.tmdb_id}`)}
                        _hover={{ transform: 'translateY(-2px)', boxShadow: 'sm' }}
                        transition="transform 0.2s"
                      >
                        <Image
                          src={resolveMediaUrl(item.poster_path) || undefined}
                          alt={item.title}
                          w="100%"
                          h="220px"
                          objectFit="cover"
                          bg="var(--hover-bg)"
                        />
                        <Box p={1}>
                          <Text fontSize="xs" fontWeight="600" lineClamp={1}>{item.title}</Text>
                          <Text fontSize="xs" color="var(--muted-text)">
                            S{item.episode.season}E{item.episode.episode}
                          </Text>
                        </Box>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              );
            })}
          </Flex>
        </Box>
      )}

      {/* Recently Added Shows */}
      {showGroups.length > 0 && (
        <CarouselRow
          title="Recently Added Shows"
          onViewAll={() => navigate('/shows/library')}
          groups={showGroups}
          favoriteIds={favoriteIds}
          onPlay={(g) => setPlayer({ title: g.title, files: g.files })}
          onToggleFavorite={(id) => toggleFavorite(id)}
          onMarkWatched={(id) => markWatched(id)}
        />
      )}

      {/* Recently Added Movies */}
      {movieGroups.length > 0 && (
        <CarouselRow
          title="Recently Added Movies"
          onViewAll={() => navigate('/shows/library')}
          groups={movieGroups}
          favoriteIds={favoriteIds}
          onPlay={(g) => setPlayer({ title: g.title, files: g.files })}
          onToggleFavorite={(id) => toggleFavorite(id)}
          onMarkWatched={(id) => markWatched(id)}
        />
      )}

      {/* Watchlist */}
      {data.watchlist_next.length > 0 && (
        <SimpleCarousel
          title="Up Next (Watchlist)"
          onViewAll={() => navigate('/shows/watchlist')}
        >
          {data.watchlist_next.map((item, idx) => (
            <Box key={idx} minW="160px" w="160px" flexShrink={0}>
              <MediaCard item={item} />
            </Box>
          ))}
        </SimpleCarousel>
      )}

      {/* Video Player Modal */}
      {player && (
        <VideoPlayerModal
          title={player.title}
          files={player.files}
          onClose={() => setPlayer(null)}
        />
      )}
    </VStack>
  );
};

const CarouselRow: React.FC<{
  title: string;
  onViewAll: () => void;
  groups: GroupedMedia[];
  favoriteIds: Set<number>;
  onPlay: (g: GroupedMedia) => void;
  onToggleFavorite: (id: number) => void;
  onMarkWatched: (id: number) => void;
}> = ({ title, onViewAll, groups, favoriteIds, onPlay, onToggleFavorite, onMarkWatched }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 340;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <Box className="CARROUSEL" width="100%">
      <HStack mb={4} justify="space-between">
        <Heading size="md" color="var(--heading-color)">{title}</Heading>
        <Text
          fontSize="sm"
          color="var(--icon-color)"
          cursor="pointer"
          onClick={onViewAll}
        >
          View All
        </Text>
      </HStack>
      <Box position="relative">
        <IconButton
          aria-label="Scroll left"
          size="sm"
          variant="ghost"
          borderRadius="full"
          color="var(--muted-text)"
          bg="var(--card-bg)"
          boxShadow="md"
          _hover={{ bg: 'var(--hover-bg)', color: 'var(--heading-color)' }}
          onClick={() => scroll('left')}
          position="absolute"
          left={0}
          top="50%"
          transform="translateY(-50%)"
          zIndex={10}
        >
          <ChevronLeft size={20} />
        </IconButton>

        <Box
          ref={scrollRef}
          overflowX="auto"
          px={10}
          css={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <HStack gap={4} align="stretch" minW="max-content" py={1}>
            {groups.map((group) => (
              <Box key={group.key} w="160px" flexShrink={0}>
                <LibraryCard
                  group={group}
                  watchedSet={undefined}
                  isMovieWatched={false}
                  isFavorite={favoriteIds.has(group.media_id || 0)}
                  onPlay={() => onPlay(group)}
                  onToggleFavorite={() => group.media_id && onToggleFavorite(group.media_id)}
                  onMarkWatched={() => group.media_id && onMarkWatched(group.media_id)}
                  getNextUnwatched={() => group.files[0]}
                />
              </Box>
            ))}
          </HStack>
        </Box>

        <IconButton
          aria-label="Scroll right"
          size="sm"
          variant="ghost"
          borderRadius="full"
          color="var(--muted-text)"
          bg="var(--card-bg)"
          boxShadow="md"
          _hover={{ bg: 'var(--hover-bg)', color: 'var(--heading-color)' }}
          onClick={() => scroll('right')}
          position="absolute"
          right={0}
          top="50%"
          transform="translateY(-50%)"
          zIndex={10}
        >
          <ChevronRight size={20} />
        </IconButton>
      </Box>
    </Box>
  );
};

const SimpleCarousel: React.FC<{
  title: string;
  onViewAll: () => void;
  children: React.ReactNode;
}> = ({ title, onViewAll, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 340;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <Box maxW="100%" overflow="hidden">
      <HStack mb={4} justify="space-between">
        <Heading size="md" color="var(--heading-color)">{title}</Heading>
        <Text
          fontSize="sm"
          color="var(--icon-color)"
          cursor="pointer"
          onClick={onViewAll}
        >
          View All
        </Text>
      </HStack>
      <Box position="relative" overflow="hidden">
        <IconButton
          aria-label="Scroll left"
          size="sm"
          variant="ghost"
          borderRadius="full"
          color="var(--muted-text)"
          bg="var(--card-bg)"
          boxShadow="md"
          _hover={{ bg: 'var(--hover-bg)', color: 'var(--heading-color)' }}
          onClick={() => scroll('left')}
          position="absolute"
          left={0}
          top="50%"
          transform="translateY(-50%)"
          zIndex={10}
        >
          <ChevronLeft size={20} />
        </IconButton>

        <Box
          ref={scrollRef}
          overflowX="auto"
          mx={8}
          pb={2}
          css={{
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <Flex gap={4} py={1}>
            {children}
          </Flex>
        </Box>

        <IconButton
          aria-label="Scroll right"
          size="sm"
          variant="ghost"
          borderRadius="full"
          color="var(--muted-text)"
          bg="var(--card-bg)"
          boxShadow="md"
          _hover={{ bg: 'var(--hover-bg)', color: 'var(--heading-color)' }}
          onClick={() => scroll('right')}
          position="absolute"
          right={0}
          top="50%"
          transform="translateY(-50%)"
          zIndex={10}
        >
          <ChevronRight size={20} />
        </IconButton>
      </Box>
    </Box>
  );
};

export default ShowsOverview;
