import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Image, Badge, Button } from '@chakra-ui/react';
import { Podcast, Play, ArrowLeft, Check, Clock } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import PodcastsPlayer from './PodcastsPlayer';

interface PodcastEpisode {
  id: number;
  podcast_id: number;
  podcast_title: string;
  podcast_image: string | null;
  title: string;
  description: string;
  audio_url: string;
  duration: number | null;
  published_at: string;
  played: boolean;
  play_position: number;
}

interface PodcastDetailData {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  image: string | null;
  feed_url: string;
  episodes: PodcastEpisode[];
  total_episodes: number;
  has_more: boolean;
}

const PodcastsDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PodcastDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [playerEpisode, setPlayerEpisode] = useState<PodcastEpisode | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async (pageNum: number, append: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await recipeAPI.request<PodcastDetailData>(
        `/podcasts/${id}?page=${pageNum}`
      );
      if (append && data) {
        setData({
          ...result,
          episodes: [...data.episodes, ...result.episodes],
        });
      } else {
        setData(result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [id, data]);

  useEffect(() => {
    fetchData(1, false);
  }, [id]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && data?.has_more && !loading && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(nextPage, true);
      }
    }, { threshold: 0.1 });

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [data?.has_more, loading, loadingMore, page]);

  const handleMarkPlayed = async (episodeId: number) => {
    try {
      await recipeAPI.request(`/podcasts/episodes/${episodeId}/played`, { method: 'POST' });
      setData(prev => prev ? {
        ...prev,
        episodes: prev.episodes.map(e => e.id === episodeId ? { ...e, played: true } : e),
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

  if (!data) {
    return <Text color="var(--muted-text)">Podcast not found.</Text>;
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <Button size="sm" variant="ghost" onClick={() => navigate('/podcasts/library')}>
          <ArrowLeft size={16} />
        </Button>
        <Heading size="lg" color="var(--heading-color)" lineClamp={1}>{data.title}</Heading>
      </HStack>

      <HStack gap={6} align="start" flexWrap={{ base: 'wrap', md: 'nowrap' }}>
        {data.image ? (
          <Image
            src={data.image}
            alt={data.title}
            w={{ base: '120px', md: '200px' }}
            h={{ base: '120px', md: '200px' }}
            borderRadius="lg"
            objectFit="cover"
            flexShrink={0}
          />
        ) : (
          <Box
            w={{ base: '120px', md: '200px' }}
            h={{ base: '120px', md: '200px' }}
            borderRadius="lg"
            bg="var(--surface-muted)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <Podcast size={64} color="var(--muted-text)" />
          </Box>
        )}
        <VStack align="start" gap={2} flex={1} minW={0}>
          {data.author && (
            <Text fontSize="md" color="var(--muted-text)" fontWeight="medium">{data.author}</Text>
          )}
          {data.description && (
            <Text fontSize="sm" color="var(--muted-text)" lineClamp={4}>{data.description}</Text>
          )}
          <HStack gap={2}>
            <Badge colorPalette="blue">{data.total_episodes} episodes</Badge>
            <Badge colorPalette="gray">
              {data.episodes.filter(e => !e.played).length} unplayed
            </Badge>
          </HStack>
        </VStack>
      </HStack>

      <Box h="1px" bg="var(--border-color)" />

      <Heading size="md" color="var(--heading-color)">Episodes</Heading>

      <VStack gap={2} align="stretch">
        {data.episodes.map((episode) => (
          <EpisodeRow
            key={episode.id}
            episode={episode}
            onPlay={() => setPlayerEpisode(episode)}
            onMarkPlayed={() => handleMarkPlayed(episode.id)}
          />
        ))}
      </VStack>

      {data.has_more && (
        <Box ref={sentinelRef} py={4}>
          {loadingMore && (
            <Flex justify="center">
              <Spinner size="md" />
            </Flex>
          )}
        </Box>
      )}

      {playerEpisode && (
        <PodcastsPlayer
          episode={playerEpisode}
          onClose={() => setPlayerEpisode(null)}
          onMarkPlayed={() => {
            setData(prev => prev ? {
              ...prev,
              episodes: prev.episodes.map(e => e.id === playerEpisode.id ? { ...e, played: true } : e),
            } : prev);
          }}
        />
      )}
    </VStack>
  );
};

const EpisodeRow: React.FC<{
  episode: PodcastEpisode;
  onPlay: () => void;
  onMarkPlayed: () => void;
}> = ({ episode, onPlay, onMarkPlayed }) => {
  const progress = episode.duration && episode.play_position
    ? Math.round((episode.play_position / episode.duration) * 100)
    : 0;

  const publishDate = episode.published_at
    ? new Date(episode.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Box
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="background 0.2s"
      _hover={{ bg: 'var(--hover-bg)' }}
      opacity={episode.played ? 0.7 : 1}
    >
      <HStack gap={3} align="start">
        <Box
          p={2}
          borderRadius="full"
          bg="var(--selected-bg)"
          color="var(--icon-color)"
          cursor="pointer"
          _hover={{ bg: 'blue.500', color: 'white' }}
          onClick={onPlay}
          flexShrink={0}
          mt={1}
        >
          <Play size={14} />
        </Box>
        <VStack align="start" gap={1} flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{episode.title}</Text>
          {episode.description && (
            <Text fontSize="xs" color="var(--muted-text)" lineClamp={2}>{episode.description}</Text>
          )}
          <HStack gap={2} flexWrap="wrap">
            {publishDate && (
              <Text fontSize="xs" color="var(--muted-text)">{publishDate}</Text>
            )}
            {episode.duration && (
              <HStack gap={1}>
                <Clock size={10} color="var(--muted-text)" />
                <Text fontSize="xs" color="var(--muted-text)">{formatDuration(episode.duration)}</Text>
              </HStack>
            )}
            {episode.played ? (
              <Badge colorPalette="green" fontSize="2xs">Played</Badge>
            ) : progress > 0 ? (
              <Badge colorPalette="blue" fontSize="2xs">{progress}%</Badge>
            ) : (
              <Badge colorPalette="orange" fontSize="2xs">New</Badge>
            )}
          </HStack>
          {progress > 0 && !episode.played && (
            <Box w="100%" maxW="200px" h="2px" bg="var(--border-color)" borderRadius="full">
              <Box h="100%" w={`${progress}%`} bg="blue.400" borderRadius="full" />
            </Box>
          )}
        </VStack>
        {!episode.played && (
          <Button
            size="xs"
            variant="ghost"
            onClick={onMarkPlayed}
            title="Mark as played"
            p={1}
            minW="auto"
            h="auto"
          >
            <Check size={14} />
          </Button>
        )}
      </HStack>
    </Box>
  );
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default PodcastsDetail;
