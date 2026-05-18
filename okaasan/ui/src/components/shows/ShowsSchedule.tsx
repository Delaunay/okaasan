import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Button } from '@chakra-ui/react';
import { Calendar, Play, CheckCircle, X } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';

interface EpisodeInfo {
  season: number;
  episode: number;
  name?: string;
  air_date?: string;
  overview?: string;
}

interface UpcomingItem {
  id: number;
  title: string;
  tmdb_id: number;
  poster_path: string | null;
  media_type: string;
  episode: EpisodeInfo;
}

interface ContinueItem {
  id: number;
  title: string;
  tmdb_id: number;
  poster_path: string | null;
  media_type: string;
  last_watched: { season: number; episode: number };
  next_episode: { season: number; episode: number };
  latest_aired: { season: number; episode: number };
}

interface ScheduleData {
  upcoming: UpcomingItem[];
  continue_watching: ContinueItem[];
}

function resolvePoster(path: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('uploads/')) return `/api/${path}`;
  if (path.startsWith('/uploads/')) return `/api${path}`;
  if (path.startsWith('/')) return `https://image.tmdb.org/t/p/w300${path}`;
  if (path.startsWith('http')) return path;
  return undefined;
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
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${yyyy}-${mm}-${dd}`);
  }
  return days;
}

const ShowsSchedule: React.FC = () => {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    recipeAPI.request<ScheduleData>('/shows/schedule')
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkUpcomingWatched = async (item: UpcomingItem) => {
    try {
      await recipeAPI.request('/shows/history', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          season: item.episode.season,
          episode: item.episode.episode,
        }),
      });
      // Remove from upcoming locally
      setData(prev => prev ? {
        ...prev,
        upcoming: prev.upcoming.filter(u =>
          !(u.tmdb_id === item.tmdb_id && u.episode.season === item.episode.season && u.episode.episode === item.episode.episode)
        ),
      } : prev);
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkEpisodeWatched = async (item: ContinueItem) => {
    try {
      await recipeAPI.request('/shows/history', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          season: item.next_episode.season,
          episode: item.next_episode.episode,
        }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkShowCompleted = async (item: ContinueItem) => {
    try {
      await recipeAPI.request('/shows/mark-completed', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          season: item.latest_aired.season,
          episode: item.latest_aired.episode,
        }),
      });
      // Remove from continue watching locally
      setData(prev => prev ? {
        ...prev,
        continue_watching: prev.continue_watching.filter(cw => cw.tmdb_id !== item.tmdb_id),
      } : prev);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDropShow = async (item: ContinueItem) => {
    try {
      await recipeAPI.request('/shows/mark-dropped', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
        }),
      });
      // Remove from continue watching locally
      setData(prev => prev ? {
        ...prev,
        continue_watching: prev.continue_watching.filter(cw => cw.tmdb_id !== item.tmdb_id),
      } : prev);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Text color="red.500">{error}</Text>
      </Box>
    );
  }

  const days = getNext7Days();
  const upcomingByDay: Record<string, UpcomingItem[]> = {};
  for (const day of days) upcomingByDay[day] = [];
  for (const item of data?.upcoming || []) {
    const d = item.episode.air_date;
    if (d && upcomingByDay[d]) upcomingByDay[d].push(item);
  }

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Calendar size={24} />
        <Heading size="lg" color="var(--heading-color)">Schedule</Heading>
        <TMDBAttribution />
      </HStack>

      {/* Upcoming Episodes - 1 column per day */}
      <Box>
        <HStack mb={4}>
          <Calendar size={18} />
          <Heading size="md" color="var(--heading-color)">Upcoming Episodes</Heading>
          <Badge colorPalette="blue" ml={2}>{data?.upcoming.length || 0} items</Badge>
        </HStack>
        <Grid templateColumns="repeat(8, 1fr)" gap={3} w="100%">
          {days.map(day => (
            <Box key={day}>
              <Text
                fontSize="xs"
                fontWeight="bold"
                textAlign="center"
                mb={2}
                color={day === days[0] ? 'var(--heading-color)' : 'var(--muted-text)'}
              >
                {getDayLabel(day)}
              </Text>
              <Flex flexWrap="wrap" gap={2} justifyContent="center">
                {upcomingByDay[day].length > 0 ? (
                  upcomingByDay[day].map(item => (
                    <UpcomingCard
                      key={`${item.tmdb_id}-${item.episode.season}-${item.episode.episode}`}
                      item={item}
                      isToday={day === days[0]}
                      onMarkWatched={() => handleMarkUpcomingWatched(item)}
                    />
                  ))
                ) : (
                  <Box
                    borderRadius="lg"
                    border="1px dashed"
                    borderColor="var(--border-color)"
                    h="220px"
                    w="100%"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text fontSize="xs" color="var(--muted-text)">—</Text>
                  </Box>
                )}
              </Flex>
            </Box>
          ))}
        </Grid>
      </Box>

      {/* Continue Watching */}
      <Box>
        <HStack mb={4}>
          <Play size={18} />
          <Heading size="md" color="var(--heading-color)">Continue Watching</Heading>
          <Badge colorPalette="blue" ml={2}>{data?.continue_watching.length || 0} items</Badge>
        </HStack>
        {data?.continue_watching && data.continue_watching.length > 0 ? (
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.continue_watching.map((item) => (
              <ContinueCard
                key={`continue-${item.tmdb_id}`}
                item={item}
                onMarkWatched={() => handleMarkEpisodeWatched(item)}
                onMarkCompleted={() => handleMarkShowCompleted(item)}
                onDrop={() => handleDropShow(item)}
              />
            ))}
          </Grid>
        ) : (
          <Text color="var(--muted-text)" fontSize="sm">You're all caught up!</Text>
        )}
      </Box>
    </VStack>
  );
};

const UpcomingCard: React.FC<{ item: UpcomingItem; isToday: boolean; onMarkWatched: () => void }> = ({ item, isToday, onMarkWatched }) => {
  const poster = resolvePoster(item.poster_path);
  const to = `/shows-detail/tv/${item.tmdb_id}`;

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      w="164px"
      position="relative"
    >
      {isToday && (
        <Box
          position="absolute"
          top={1}
          right={1}
          zIndex={2}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Button
            size="xs"
            variant="ghost"
            onClick={(e) => { e.preventDefault(); onMarkWatched(); }}
            title="Mark as watched"
            p={1}
            minW="auto"
            h="auto"
            borderRadius="full"
            bg="rgba(0,0,0,0.5)"
            color="white"
            _hover={{ bg: 'rgba(0,0,0,0.7)' }}
          >
            <CheckCircle size={14} />
          </Button>
        </Box>
      )}
      <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
        {poster ? (
          <Image src={poster} alt={item.title} w="164px" h="220px" objectFit="cover" loading="lazy" />
        ) : (
          <Box w="164px" h="220px" bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center">
            <Text color="var(--empty-text)" fontSize="sm">No Poster</Text>
          </Box>
        )}
        <Box p={3}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{item.title}</Text>
          <Text fontSize="xs" color="var(--muted-text)" mt={1}>
            S{String(item.episode.season).padStart(2, '0')}E{String(item.episode.episode).padStart(2, '0')}
            {item.episode.name && ` — ${item.episode.name}`}
          </Text>
        </Box>
      </Link>
    </Box>
  );
};

interface ContinueCardProps {
  item: ContinueItem;
  onMarkWatched: () => void;
  onMarkCompleted: () => void;
  onDrop: () => void;
}

const ContinueCard: React.FC<ContinueCardProps> = ({ item, onMarkWatched, onMarkCompleted, onDrop }) => {
  const poster = resolvePoster(item.poster_path);
  const to = `/shows-detail/tv/${item.tmdb_id}`;

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      position="relative"
    >
      {/* Top-right: mark next episode watched */}
      <Box position="absolute" top={1} right={1} zIndex={2} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Button
          size="xs"
          variant="ghost"
          onClick={(e) => { e.preventDefault(); onMarkWatched(); }}
          title="Mark next episode as watched"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg="rgba(0,0,0,0.5)"
          color="white"
          _hover={{ bg: 'rgba(0,0,0,0.7)' }}
        >
          <CheckCircle size={14} />
        </Button>
      </Box>
      {/* Top-left: mark show completed */}
      <Box position="absolute" top={1} left={1} zIndex={2} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Button
          size="xs"
          variant="ghost"
          onClick={(e) => { e.preventDefault(); onMarkCompleted(); }}
          title="Watched all — mark show as completed"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg="rgba(0,0,0,0.5)"
          color="white"
          _hover={{ bg: 'rgba(0,0,0,0.7)' }}
        >
          <CheckCircle size={12} /><CheckCircle size={12} />
        </Button>
      </Box>
      {/* Bottom-right on poster: drop show */}
      <Box position="absolute" bottom={1} right={1} zIndex={2} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Button
          size="xs"
          variant="ghost"
          onClick={(e) => { e.preventDefault(); onDrop(); }}
          title="Drop — not going to watch anymore"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg="rgba(0,0,0,0.5)"
          color="white"
          _hover={{ bg: 'rgba(200,0,0,0.7)' }}
        >
          <X size={14} />
        </Button>
      </Box>

      <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
        {poster ? (
          <Image src={poster} alt={item.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
        ) : (
          <Box w="100%" h="220px" bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center">
            <Text color="var(--empty-text)" fontSize="sm">No Poster</Text>
          </Box>
        )}
        <Box p={3}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{item.title}</Text>
          <Text fontSize="xs" color="var(--muted-text)" mt={1}>
            Next: S{String(item.next_episode.season).padStart(2, '0')}E{String(item.next_episode.episode).padStart(2, '0')}
          </Text>
        </Box>
      </Link>
    </Box>
  );
};

export default ShowsSchedule;
