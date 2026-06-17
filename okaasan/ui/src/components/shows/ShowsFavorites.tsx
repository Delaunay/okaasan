import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Heading, Text, Grid, Badge, Spinner, Flex } from '@chakra-ui/react';
import { Heart } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import MediaCard from './MediaCard';

const ShowsFavorites = () => {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Favorites — Shows & Movies';
    recipeAPI.request<any[]>('/shows/favorites')
      .then(data => setFavorites(data))
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

  if (favorites.length === 0) {
    return (
      <Box textAlign="center" py={10}>
        <Flex justify="center" color="var(--empty-text)" mb={4}><Heart size={48} /></Flex>
        <Text color="var(--muted-text)">No favorites yet.</Text>
      </Box>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <Heart size={24} color="var(--panel-red-text)" />
        <Heading size="lg" color="var(--heading-color)">Favorites</Heading>
        <Badge colorPalette="red">{favorites.length} items</Badge>
      </HStack>
      <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
        {favorites.map((item, idx) => (
          <MediaCard key={idx} item={item} />
        ))}
      </Grid>
    </VStack>
  );
};

export default ShowsFavorites;
