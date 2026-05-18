import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Image, Badge } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Podcast, Play, Clock, Headphones } from 'lucide-react';
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

interface OverviewData {
  new_episodes: PodcastEpisode[];
  continue_listening: PodcastEpisode[];
  stats: {
    subscriptions: number;
    total_episodes: number;
    unplayed: number;
  };
}

const PodcastsOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerEpisode, setPlayerEpisode] = useState<PodcastEpisode | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/podcasts/overview')
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
    return <Text color="var(--muted-text)">Failed to load podcasts data.</Text>;
  }

  const stats = data.stats || { subscriptions: 0, total_episodes: 0, unplayed: 0 };

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Podcast size={24} />
        <Heading size="lg" color="var(--heading-color)">Podcasts</Heading>
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Podcast size={18} />} label="Subscriptions" value={stats.subscriptions} />
        <StatCard icon={<Headphones size={18} />} label="Episodes" value={stats.total_episodes} />
        <StatCard icon={<Clock size={18} />} label="Unplayed" value={stats.unplayed} />
      </Grid>

      {data.continue_listening.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">Continue Listening</Heading>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={4}>
            {data.continue_listening.map((ep) => (
              <EpisodeCard key={ep.id} episode={ep} onPlay={() => setPlayerEpisode(ep)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.new_episodes.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <Heading size="md" color="var(--heading-color)">New Episodes</Heading>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/podcasts-library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={4}>
            {data.new_episodes.slice(0, 12).map((ep) => (
              <EpisodeCard key={ep.id} episode={ep} onPlay={() => setPlayerEpisode(ep)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.new_episodes.length === 0 && data.continue_listening.length === 0 && (
        <Flex justify="center" py={12}>
          <VStack gap={3}>
            <Podcast size={48} color="var(--muted-text)" />
            <Text color="var(--muted-text)">
              No podcasts yet. Head to the Library to subscribe to some podcasts.
            </Text>
          </VStack>
        </Flex>
      )}

      {playerEpisode && (
        <PodcastsPlayer
          episode={playerEpisode}
          onClose={() => setPlayerEpisode(null)}
          onMarkPlayed={() => {
            setData(prev => prev ? {
              ...prev,
              new_episodes: prev.new_episodes.map(e => e.id === playerEpisode.id ? { ...e, played: true } : e),
              continue_listening: prev.continue_listening.filter(e => e.id !== playerEpisode.id),
            } : prev);
          }}
        />
      )}
    </VStack>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
  <Box
    p={4}
    borderRadius="lg"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">{value.toLocaleString()}</Text>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
  </Box>
);

const EpisodeCard: React.FC<{ episode: PodcastEpisode; onPlay: () => void }> = ({ episode, onPlay }) => {
  const progress = episode.duration && episode.play_position
    ? Math.round((episode.play_position / episode.duration) * 100)
    : 0;

  return (
    <Box
      borderRadius="lg"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      overflow="hidden"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      cursor="pointer"
      onClick={onPlay}
    >
      <HStack gap={3} p={3} align="start">
        {episode.podcast_image ? (
          <Image
            src={episode.podcast_image}
            alt={episode.podcast_title}
            w="60px"
            h="60px"
            borderRadius="md"
            objectFit="cover"
            flexShrink={0}
          />
        ) : (
          <Box
            w="60px"
            h="60px"
            borderRadius="md"
            bg="var(--surface-muted)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <Podcast size={24} color="var(--muted-text)" />
          </Box>
        )}
        <VStack align="start" gap={1} flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{episode.title}</Text>
          <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>{episode.podcast_title}</Text>
          <HStack gap={2}>
            {episode.duration && (
              <Text fontSize="xs" color="var(--muted-text)">
                {formatDuration(episode.duration)}
              </Text>
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
            <Box w="100%" h="2px" bg="var(--border-color)" borderRadius="full" mt={1}>
              <Box h="100%" w={`${progress}%`} bg="blue.400" borderRadius="full" />
            </Box>
          )}
        </VStack>
        <Box
          p={2}
          borderRadius="full"
          bg="var(--selected-bg)"
          color="var(--icon-color)"
          _hover={{ bg: 'blue.500', color: 'white' }}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
          flexShrink={0}
          alignSelf="center"
        >
          <Play size={16} />
        </Box>
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

export default PodcastsOverview;
