import React, { useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Star, Clock, Play } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface Game {
  id: number;
  title: string;
  platform: string;
  year?: number;
  cover_url?: string;
  file_id?: number;
}

interface OverviewData {
  recently_played: Game[];
  favorites: Game[];
  stats: {
    total_games: number;
    total_platforms: number;
    total_play_time_minutes: number;
  };
}

const GamesOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.request<OverviewData>('/games/overview')
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
      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Gamepad2 size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Retro Games</Heading>
        </HStack>
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            No games data available. Add ROMs in Settings → Retro Games to get started.
          </Text>
        </Flex>
      </VStack>
    );
  }

  const stats = data.stats || { total_games: 0, total_platforms: 0, total_play_time_minutes: 0 };

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Gamepad2 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Retro Games</Heading>
      </HStack>

      <Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={4}>
        <StatCard icon={<Gamepad2 size={18} />} label="Games" value={stats.total_games} />
        <StatCard icon={<Play size={18} />} label="Platforms" value={stats.total_platforms} />
        <StatCard
          icon={<Clock size={18} />}
          label="Play Time"
          value={Math.round(stats.total_play_time_minutes / 60)}
          suffix="hrs"
        />
      </Grid>

      {data.recently_played.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <HStack>
              <Clock size={20} />
              <Heading size="md" color="var(--heading-color)">Recently Played</Heading>
            </HStack>
            <Text
              fontSize="sm"
              color="var(--icon-color)"
              cursor="pointer"
              onClick={() => navigate('/games/library')}
            >
              View All
            </Text>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.recently_played.map((game) => (
              <GameCard key={game.id} game={game} onClick={() => navigate(`/games/detail/${game.id}`)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.favorites.length > 0 && (
        <Box>
          <HStack mb={4} justify="space-between">
            <HStack>
              <Star size={20} />
              <Heading size="md" color="var(--heading-color)">Favorites</Heading>
            </HStack>
          </HStack>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {data.favorites.map((game) => (
              <GameCard key={game.id} game={game} onClick={() => navigate(`/games/detail/${game.id}`)} />
            ))}
          </Grid>
        </Box>
      )}

      {data.recently_played.length === 0 && data.favorites.length === 0 && (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            No games played yet. Head to the Library to start playing!
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}> = ({ icon, label, value, suffix }) => (
  <Box
    p={4}
    borderRadius="lg"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    textAlign="center"
  >
    <Flex justify="center" mb={2} color="var(--icon-color)">{icon}</Flex>
    <Text fontSize="2xl" fontWeight="bold">
      {value.toLocaleString()}{suffix ? ` ${suffix}` : ''}
    </Text>
    <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
  </Box>
);

const GameCard: React.FC<{ game: Game; onClick: () => void }> = ({ game, onClick }) => (
  <Box
    borderRadius="lg"
    overflow="hidden"
    border="1px solid"
    borderColor="var(--border-color)"
    bg="var(--card-bg)"
    cursor="pointer"
    transition="transform 0.2s, box-shadow 0.2s"
    _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
    onClick={onClick}
  >
    {game.cover_url ? (
      <Image src={game.cover_url} alt={game.title} w="100%" h="200px" objectFit="cover" loading="lazy" />
    ) : (
      <Box
        w="100%"
        h="200px"
        bg="var(--surface-muted)"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Gamepad2 size={48} color="var(--muted-text)" />
      </Box>
    )}
    <Box p={3}>
      <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{game.title}</Text>
      <HStack gap={2} mt={1}>
        {game.year && <Text fontSize="xs" color="var(--muted-text)">{game.year}</Text>}
        <Badge colorPalette="purple" fontSize="2xs">{game.platform}</Badge>
      </HStack>
    </Box>
  </Box>
);

export default GamesOverview;
