import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Button } from '@chakra-ui/react';
import { Gamepad2, Play, ArrowLeft, Star, Trash2, Download, Clock } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import GamesPlayer from './GamesPlayer';

interface GameDetail {
  id: number;
  title: string;
  platform: string;
  year?: number;
  cover_url?: string;
  file_id?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  description?: string;
  favorite?: boolean;
}

interface SaveState {
  id: number;
  game_id: number;
  slot: number;
  screenshot_url?: string;
  created_at: string;
  label?: string;
}

const GamesDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [saveStates, setSaveStates] = useState<SaveState[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loadStateId, setLoadStateId] = useState<number | undefined>(undefined);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [gameData, savesData] = await Promise.all([
        recipeAPI.request<GameDetail>(`/games/${id}`),
        recipeAPI.request<{ save_states: SaveState[] }>(`/games/${id}/save-states`),
      ]);
      setGame(gameData);
      setSaveStates(savesData.save_states);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleFavorite = async () => {
    if (!game) return;
    try {
      await recipeAPI.request(`/games/${game.id}/favorite`, { method: 'POST' });
      setGame({ ...game, favorite: !game.favorite });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSave = async (saveId: number) => {
    try {
      await recipeAPI.request(`/games/${id}/save-states/${saveId}`, { method: 'DELETE' });
      setSaveStates(prev => prev.filter(s => s.id !== saveId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadState = (saveId: number) => {
    setLoadStateId(saveId);
    setPlaying(true);
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!game) {
    return (
      <VStack p={4} gap={4}>
        <Text color="var(--muted-text)">Game not found.</Text>
        <Button size="sm" variant="ghost" onClick={() => navigate('/games/library')}>
          <ArrowLeft size={16} /> Back to Library
        </Button>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      {playing && (
        <GamesPlayer
          game={game}
          loadStateId={loadStateId}
          onClose={() => { setPlaying(false); setLoadStateId(undefined); fetchData(); }}
        />
      )}

      <HStack>
        <Button size="sm" variant="ghost" onClick={() => navigate('/games/library')}>
          <ArrowLeft size={16} />
        </Button>
        <Gamepad2 size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">{game.title}</Heading>
      </HStack>

      <Flex gap={6} direction={{ base: 'column', md: 'row' }}>
        <Box flexShrink={0} w={{ base: '100%', md: '280px' }}>
          {game.cover_url ? (
            <Image
              src={game.cover_url}
              alt={game.title}
              w="100%"
              borderRadius="lg"
              border="1px solid"
              borderColor="var(--border-color)"
            />
          ) : (
            <Box
              w="100%"
              h="380px"
              bg="var(--surface-muted)"
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="1px solid"
              borderColor="var(--border-color)"
            >
              <Gamepad2 size={64} color="var(--muted-text)" />
            </Box>
          )}

          <VStack mt={4} gap={2} align="stretch">
            <Button
              colorPalette="blue"
              size="lg"
              onClick={() => { setLoadStateId(undefined); setPlaying(true); }}
            >
              <Play size={18} /> Play
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFavorite}
              color={game.favorite ? 'yellow.400' : undefined}
            >
              <Star size={16} fill={game.favorite ? 'currentColor' : 'none'} />
              {game.favorite ? 'Favorited' : 'Add to Favorites'}
            </Button>
          </VStack>
        </Box>

        <VStack align="stretch" flex={1} gap={4}>
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <Grid templateColumns="auto 1fr" gap={3} rowGap={2}>
              <Text fontSize="sm" color="var(--muted-text)">Platform</Text>
              <Badge colorPalette="purple" w="fit-content">{game.platform}</Badge>

              {game.year && (
                <>
                  <Text fontSize="sm" color="var(--muted-text)">Year</Text>
                  <Text fontSize="sm">{game.year}</Text>
                </>
              )}
              {game.developer && (
                <>
                  <Text fontSize="sm" color="var(--muted-text)">Developer</Text>
                  <Text fontSize="sm">{game.developer}</Text>
                </>
              )}
              {game.publisher && (
                <>
                  <Text fontSize="sm" color="var(--muted-text)">Publisher</Text>
                  <Text fontSize="sm">{game.publisher}</Text>
                </>
              )}
              {game.genre && (
                <>
                  <Text fontSize="sm" color="var(--muted-text)">Genre</Text>
                  <Text fontSize="sm">{game.genre}</Text>
                </>
              )}
            </Grid>
          </Box>

          {game.description && (
            <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
              <Heading size="sm" mb={2} color="var(--heading-color)">About</Heading>
              <Text fontSize="sm" color="var(--muted-text)" lineHeight="tall">
                {game.description}
              </Text>
            </Box>
          )}

          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack mb={3} justify="space-between">
              <HStack>
                <Download size={18} />
                <Heading size="sm" color="var(--heading-color)">Save States</Heading>
              </HStack>
              <Badge colorPalette="gray">{saveStates.length}</Badge>
            </HStack>

            {saveStates.length === 0 ? (
              <Text fontSize="sm" color="var(--muted-text)">
                No save states yet. Save your progress while playing.
              </Text>
            ) : (
              <VStack align="stretch" gap={2}>
                {saveStates.map(save => (
                  <Flex
                    key={save.id}
                    p={3}
                    borderRadius="md"
                    border="1px solid"
                    borderColor="var(--border-color)"
                    bg="var(--surface-muted)"
                    align="center"
                    gap={3}
                  >
                    {save.screenshot_url ? (
                      <Image
                        src={save.screenshot_url}
                        alt={`Save ${save.slot}`}
                        w="80px"
                        h="60px"
                        objectFit="cover"
                        borderRadius="sm"
                      />
                    ) : (
                      <Box
                        w="80px"
                        h="60px"
                        bg="var(--card-bg)"
                        borderRadius="sm"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Gamepad2 size={20} color="var(--muted-text)" />
                      </Box>
                    )}
                    <VStack align="start" flex={1} gap={0}>
                      <Text fontSize="sm" fontWeight="semibold">
                        {save.label || `Slot ${save.slot}`}
                      </Text>
                      <HStack gap={1}>
                        <Clock size={12} color="var(--muted-text)" />
                        <Text fontSize="xs" color="var(--muted-text)">
                          {new Date(save.created_at).toLocaleString()}
                        </Text>
                      </HStack>
                    </VStack>
                    <HStack gap={1}>
                      <Button
                        size="xs"
                        colorPalette="blue"
                        onClick={() => handleLoadState(save.id)}
                      >
                        <Play size={12} /> Load
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => handleDeleteSave(save.id)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </HStack>
                  </Flex>
                ))}
              </VStack>
            )}
          </Box>
        </VStack>
      </Flex>
    </VStack>
  );
};

export default GamesDetail;
