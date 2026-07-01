import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Heading, Text, Grid, Badge, Spinner, Flex } from '@chakra-ui/react';
import { Heart, Library, Film, Tv } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import MediaCard from './MediaCard';

interface TraktCollection {
  shows: any[];
  movies: any[];
  total_shows: number;
  total_movies: number;
}

const ShowsFavorites = () => {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [traktCollection, setTraktCollection] = useState<TraktCollection | null>(null);
  const [collectionTab, setCollectionTab] = useState<'movies' | 'shows'>('movies');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Favorites — Shows & Movies';
    Promise.all([
      recipeAPI.request<any[]>('/shows/favorites'),
      recipeAPI.request<TraktCollection>('/shows/collection'),
    ])
      .then(([favs, trakt]) => {
        setFavorites(favs);
        setTraktCollection(trakt);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="xl" color="orange.500" />
      </Flex>
    );
  }

  const hasCollection = traktCollection && (traktCollection.total_movies > 0 || traktCollection.total_shows > 0);
  const collectionItems = traktCollection
    ? (collectionTab === 'movies' ? traktCollection.movies : traktCollection.shows)
    : [];

  return (
    <VStack gap={6} align="stretch" p={4}>
      {/* Favorites section */}
      <HStack>
        <Heart size={24} color="var(--panel-red-text)" />
        <Heading size="lg" color="var(--heading-color)">Favorites</Heading>
        <Badge colorPalette="red">{favorites.length} items</Badge>
      </HStack>

      {favorites.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Flex justify="center" color="var(--empty-text)" mb={4}><Heart size={48} /></Flex>
          <Text color="var(--muted-text)">No favorites yet.</Text>
        </Box>
      ) : (
        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {favorites.map((item, idx) => (
            <MediaCard key={idx} item={item} />
          ))}
        </Grid>
      )}

      {/* My Collection section */}
      {hasCollection && (
        <>
          <Box borderTop="1px solid" borderColor="var(--border-color)" pt={6}>
            <HStack justify="space-between" mb={4}>
              <HStack>
                <Library size={24} color="var(--panel-blue-text)" />
                <Heading size="lg" color="var(--heading-color)">My Collection</Heading>
              </HStack>
              <HStack gap={2}>
                <Badge colorPalette="blue">{traktCollection!.total_movies} movies</Badge>
                <Badge colorPalette="green">{traktCollection!.total_shows} shows</Badge>
              </HStack>
            </HStack>

            <HStack gap={2} mb={4}>
              <TabButton label="Movies" icon={<Film size={14} />} active={collectionTab === 'movies'} onClick={() => setCollectionTab('movies')} />
              <TabButton label="Shows" icon={<Tv size={14} />} active={collectionTab === 'shows'} onClick={() => setCollectionTab('shows')} />
            </HStack>

            <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
              {collectionItems.map((item, idx) => (
                <MediaCard key={idx} item={collectionTab === 'shows' ? { ...item, type: 'show' } : item} />
              ))}
            </Grid>
          </Box>
        </>
      )}
    </VStack>
  );
};

const TabButton: React.FC<{ label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }> = ({
  label, icon, active, onClick
}) => (
  <Box
    px={4}
    py={2}
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
      {icon}
      <Text fontSize="sm">{label}</Text>
    </HStack>
  </Box>
);

export default ShowsFavorites;
