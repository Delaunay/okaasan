import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Button } from '@chakra-ui/react';
import { Bookmark, CheckCircle } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';

const ShowsWatchlist: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = useCallback(() => {
    setLoading(true);
    recipeAPI.request<any[]>('/shows/watchlist')
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const handleMarkWatched = async (item: any) => {
    try {
      await recipeAPI.request('/shows/history', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          media_type: item.media_type,
          title: item.title,
          year: item.year,
        }),
      });
      // Remove from watchlist since it's now watched
      await recipeAPI.request(`/shows/watchlist/${item.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== item.id));
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

  const shows = items.filter(i => i.media_type === 'show');
  const movies = items.filter(i => i.media_type === 'movie');

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Bookmark size={24} />
        <Heading size="lg" color="var(--heading-color)">Watchlist</Heading>
        <Badge colorPalette="blue" ml={2}>{items.length} items</Badge>
        <TMDBAttribution />
      </HStack>

      {shows.length > 0 && (
        <Box>
          <Heading size="sm" mb={4} color="var(--heading-color)">Shows ({shows.length})</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap={4}>
            {shows.map((item) => (
              <WatchlistCard key={item.id} item={item} onMarkWatched={() => handleMarkWatched(item)} />
            ))}
          </Grid>
        </Box>
      )}

      {movies.length > 0 && (
        <Box>
          <Heading size="sm" mb={4} color="var(--heading-color)">Movies ({movies.length})</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap={4}>
            {movies.map((item) => (
              <WatchlistCard key={item.id} item={item} onMarkWatched={() => handleMarkWatched(item)} />
            ))}
          </Grid>
        </Box>
      )}

      {items.length === 0 && (
        <Text color="var(--muted-text)">Your watchlist is empty.</Text>
      )}
    </VStack>
  );
};

const WatchlistCard: React.FC<{ item: any; onMarkWatched: () => void }> = ({ item, onMarkWatched }) => {
  const title = item.title || 'Unknown';
  const year = item.year;
  const posterPath = item.poster_path;
  const mediaType = item.media_type === 'show' ? 'tv' : 'movie';
  const to = item.tmdb_id ? `/shows-detail/${mediaType}/${item.tmdb_id}` : undefined;

  let posterUrl: string | null = null;
  if (posterPath) {
    if (posterPath.startsWith('http')) {
      posterUrl = posterPath;
    } else if (posterPath.startsWith('uploads/')) {
      posterUrl = `/api/${posterPath}`;
    } else if (posterPath.startsWith('/')) {
      posterUrl = `https://image.tmdb.org/t/p/w300${posterPath}`;
    }
  }

  const content = (
    <>
      {posterUrl ? (
        <Image src={posterUrl} alt={title} w="100%" h="220px" objectFit="cover" loading="lazy" />
      ) : (
        <Box w="100%" h="220px" bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center">
          <Text color="var(--empty-text)" fontSize="sm">No Poster</Text>
        </Box>
      )}

      <Box p={3}>
        <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>
          {title}
        </Text>
        {year && <Text fontSize="xs" color="var(--muted-text)" mt={1}>{year}</Text>}
      </Box>
    </>
  );

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
      {/* Icon-only watched button on top-right */}
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
          title="Mark as watched and remove from watchlist"
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

      {to ? (
        <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
          {content}
        </Link>
      ) : content}
    </Box>
  );
};

export default ShowsWatchlist;
