import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image } from '@chakra-ui/react';
import { Film, Tv, Eye } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';

interface SeenItem {
  id: number;
  title: string;
  year?: number;
  media_type: string;
  poster_path?: string;
  tmdb_id?: number;
  progress: number | null;
  episodes_watched?: number;
  episodes_total?: number | null;
}

const ShowsSeen = () => {
  const [items, setItems] = useState<SeenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'show' | 'movie'>('all');

  useEffect(() => {
    document.title = 'Seen — Shows & Movies';
    recipeAPI.request<SeenItem[]>('/shows/seen')
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(i => i.media_type === filter);
  }, [items, filter]);

  const showCount = items.filter(i => i.media_type === 'show').length;
  const movieCount = items.filter(i => i.media_type === 'movie').length;

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="xl" color="orange.500" />
      </Flex>
    );
  }

  return (
    <VStack gap={5} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap">
        <HStack>
          <Eye size={24} />
          <Heading size="lg" color="var(--heading-color)">Seen</Heading>
          <Badge colorPalette="gray">{items.length} titles</Badge>
        </HStack>
        <HStack gap={2}>
          <Badge
            cursor="pointer"
            colorPalette={filter === 'all' ? 'blue' : 'gray'}
            variant={filter === 'all' ? 'solid' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All ({items.length})
          </Badge>
          <Badge
            cursor="pointer"
            colorPalette={filter === 'show' ? 'purple' : 'gray'}
            variant={filter === 'show' ? 'solid' : 'outline'}
            onClick={() => setFilter('show')}
          >
            <Tv size={12} /> Shows ({showCount})
          </Badge>
          <Badge
            cursor="pointer"
            colorPalette={filter === 'movie' ? 'green' : 'gray'}
            variant={filter === 'movie' ? 'solid' : 'outline'}
            onClick={() => setFilter('movie')}
          >
            <Film size={12} /> Movies ({movieCount})
          </Badge>
        </HStack>
      </HStack>

      <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
        {filtered.map(item => (
          <Link key={item.id} to={`/shows/detail/${item.media_type === 'show' ? 'tv' : 'movie'}/${item.tmdb_id}`}>
            <SeenCard item={item} />
          </Link>
        ))}
      </Grid>
    </VStack>
  );
};

function SeenCard({ item }: { item: SeenItem }) {
  const poster = resolveMediaUrl(item.poster_path);
  const progressPct = item.progress != null ? Math.round(item.progress * 100) : null;

  return (
    <Box
      borderRadius="md"
      overflow="hidden"
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      transition="all 0.15s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
    >
      <Box position="relative" width="100%" paddingBottom="150%" overflow="hidden">
        {poster ? (
          <Image
            src={poster}
            alt={item.title}
            position="absolute"
            top="0"
            left="0"
            width="100%"
            height="100%"
            objectFit="cover"
          />
        ) : (
          <Flex
            position="absolute"
            top="0"
            left="0"
            width="100%"
            height="100%"
            bg="var(--surface-muted)"
            align="center"
            justify="center"
          >
            {item.media_type === 'show' ? <Tv size={32} color="var(--empty-text)" /> : <Film size={32} color="var(--empty-text)" />}
          </Flex>
        )}

        {/* Progress bar at bottom of poster */}
        {item.media_type === 'show' && progressPct != null && progressPct < 100 && (
          <Box position="absolute" bottom="0" left="0" right="0" height="4px" bg="blackAlpha.400">
            <Box height="100%" width={`${progressPct}%`} bg="green.400" borderRadius="0 2px 0 0" />
          </Box>
        )}
      </Box>

      <Box p={2}>
        <Text fontSize="xs" fontWeight="600" lineClamp={2} color="var(--heading-color)">
          {item.title}
        </Text>
        <HStack gap={1} mt={1}>
          {item.year && <Text fontSize="xs" color="var(--muted-text)">{item.year}</Text>}
          {item.media_type === 'show' && item.episodes_watched != null && (
            <Text fontSize="xs" color="var(--muted-text)">
              · {item.episodes_watched}{item.episodes_total ? `/${item.episodes_total}` : ''} ep
            </Text>
          )}
        </HStack>
      </Box>
    </Box>
  );
}

export default ShowsSeen;
