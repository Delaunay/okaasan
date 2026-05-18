import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Input, Button } from '@chakra-ui/react';
import { Gamepad2, Play, Search } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import GamesPlayer from './GamesPlayer';

interface Game {
  id: number;
  title: string;
  platform: string;
  year?: number;
  cover_url?: string;
  file_id?: number;
  developer?: string;
  genre?: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  NES: 'red',
  SNES: 'purple',
  N64: 'green',
  GBA: 'blue',
  GBC: 'teal',
  GB: 'gray',
  Genesis: 'orange',
  PS1: 'cyan',
  'Master System': 'red',
  'Game Gear': 'blue',
  Atari2600: 'orange',
  NDS: 'gray',
};

const GamesLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activePlatform, setActivePlatform] = useState('All');
  const [playerGame, setPlayerGame] = useState<Game | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [gamesData, platformsData] = await Promise.all([
          recipeAPI.request<{ games: Game[] }>('/games/library'),
          recipeAPI.request<{ platforms: string[] }>('/games/platforms'),
        ]);
        setGames(gamesData.games);
        setPlatforms(platformsData.platforms);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const filtered = useMemo(() => {
    let result = games;
    if (activePlatform !== 'All') {
      result = result.filter(g => g.platform === activePlatform);
    }
    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter(g =>
        g.title.toLowerCase().includes(q) ||
        (g.developer && g.developer.toLowerCase().includes(q)) ||
        (g.genre && g.genre.toLowerCase().includes(q))
      );
    }
    return result;
  }, [games, activePlatform, debounced]);

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { All: games.length };
    for (const g of games) {
      counts[g.platform] = (counts[g.platform] || 0) + 1;
    }
    return counts;
  }, [games]);

  const handlePlay = useCallback((e: React.MouseEvent, game: Game) => {
    e.stopPropagation();
    e.preventDefault();
    setPlayerGame(game);
  }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      {playerGame && (
        <GamesPlayer
          game={playerGame}
          onClose={() => setPlayerGame(null)}
        />
      )}

      <HStack>
        <Gamepad2 size={24} />
        <Heading size="lg" color="var(--heading-color)">Game Library</Heading>
        <Badge colorPalette="blue" ml={2}>{games.length} games</Badge>
      </HStack>

      <HStack gap={3} flexWrap="wrap">
        <HStack
          bg="var(--input-bg)"
          border="1px solid"
          borderColor="var(--border-color)"
          borderRadius="md"
          px={3}
          maxW="300px"
          flex="1"
        >
          <Search size={14} color="var(--muted-text)" />
          <Input
            placeholder="Search games..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="sm"
            variant="unstyled"
            py={1.5}
          />
        </HStack>
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <HStack gap={2} flexWrap="wrap">
          {['All', ...platforms].map(plat => (
            <FilterChip
              key={plat}
              label={plat}
              count={platformCounts[plat] || 0}
              active={activePlatform === plat}
              onClick={() => setActivePlatform(plat)}
            />
          ))}
        </HStack>
      </HStack>

      <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
        {filtered.map(game => (
          <Box
            key={game.id}
            borderRadius="lg"
            overflow="hidden"
            border="1px solid"
            borderColor="var(--border-color)"
            bg="var(--card-bg)"
            transition="transform 0.2s, box-shadow 0.2s"
            _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
            position="relative"
            cursor="pointer"
            onClick={() => navigate(`/games-detail/${game.id}`)}
          >
            <Box
              position="absolute"
              top={1}
              right={1}
              zIndex={2}
              onClick={(e) => handlePlay(e, game)}
            >
              <Button
                size="xs"
                variant="ghost"
                p={1}
                minW="auto"
                h="auto"
                borderRadius="full"
                bg="rgba(0,0,0,0.6)"
                color="white"
                _hover={{ bg: 'blue.500' }}
                title="Play"
              >
                <Play size={14} />
              </Button>
            </Box>

            {game.cover_url ? (
              <Image src={game.cover_url} alt={game.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
            ) : (
              <Box
                w="100%"
                h="220px"
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
              <HStack gap={2} mt={1} flexWrap="wrap">
                {game.year && <Text fontSize="xs" color="var(--muted-text)">{game.year}</Text>}
                <Badge
                  colorPalette={PLATFORM_COLORS[game.platform] || 'gray'}
                  fontSize="2xs"
                >
                  {game.platform}
                </Badge>
              </HStack>
            </Box>
          </Box>
        ))}
      </Grid>

      {filtered.length === 0 && (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {games.length === 0
              ? 'No games in library. Configure ROM folders in Settings → Retro Games.'
              : 'No games match your search.'}
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, active, onClick }) => (
  <Box
    px={3}
    py={1.5}
    borderRadius="md"
    cursor="pointer"
    fontWeight={active ? 'bold' : 'normal'}
    bg={active ? 'var(--selected-bg)' : 'transparent'}
    borderWidth="1px"
    borderColor={active ? 'var(--panel-blue-border)' : 'var(--border-color)'}
    onClick={onClick}
    transition="all 0.2s"
    _hover={{ borderColor: 'var(--panel-blue-border)' }}
  >
    <HStack gap={1}>
      <Text fontSize="sm">{label}</Text>
      <Badge colorPalette="gray" fontSize="2xs">{count}</Badge>
    </HStack>
  </Box>
);

export default GamesLibrary;
