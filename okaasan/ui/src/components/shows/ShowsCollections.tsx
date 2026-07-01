import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner,
  Badge, Button, Input,
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderOpen, Library, Film, Tv, Heart } from 'lucide-react';
import { recipeAPI, isStaticMode } from '../../services/api';
import MediaCard from './MediaCard';
import TMDBAttribution from './TMDBAttribution';

interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

interface CollectionDetail {
  id: string;
  name: string;
  description: string;
  items: any[];
  created_at: string;
  updated_at: string;
}

interface TraktCollection {
  shows: any[];
  movies: any[];
  total_shows: number;
  total_movies: number;
}

const ShowsCollections: React.FC = () => {
  const { collectionId } = useParams<{ collectionId?: string }>();
  const navigate = useNavigate();

  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [traktCollection, setTraktCollection] = useState<TraktCollection | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<CollectionDetail | null>(null);
  const [traktTab, setTraktTab] = useState<'movies' | 'shows'>('movies');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [cols, trakt, favs] = await Promise.all([
        recipeAPI.request<CollectionSummary[]>('/shows/collections'),
        recipeAPI.request<TraktCollection>('/shows/collection'),
        recipeAPI.request<any[]>('/shows/favorites'),
      ]);
      setCollections(cols);
      setTraktCollection(trakt);
      setFavorites(favs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!collectionId || loading) return;
    if (collectionId === 'owned' || collectionId === 'favorites') return;

    recipeAPI.request<CollectionDetail>(`/shows/collections/${collectionId}`)
      .then(setSelectedCollection)
      .catch(() => setSelectedCollection(null));
  }, [collectionId, loading]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await recipeAPI.request('/shows/collections', {
        method: 'POST',
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      setNewName('');
      setNewDesc('');
      setCreating(false);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await recipeAPI.request(`/shows/collections/${id}`, { method: 'DELETE' });
      if (collectionId === id) navigate('/shows/collections');
      fetchData();
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

  // Detail view for a user-created collection
  if (collectionId && collectionId !== 'owned' && collectionId !== 'favorites') {
    if (!selectedCollection) {
      return (
        <VStack p={4} gap={4}>
          <Text color="var(--muted-text)">Collection not found.</Text>
          <Button size="sm" variant="ghost" onClick={() => navigate('/shows/collections')}>Back</Button>
        </VStack>
      );
    }
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/shows/collections')}>
            Back
          </Button>
          <Heading size="md" color="var(--heading-color)">{selectedCollection.name}</Heading>
          <Badge>{selectedCollection.items.length} items</Badge>
        </HStack>
        {selectedCollection.description && <Text color="var(--muted-text)">{selectedCollection.description}</Text>}
        {selectedCollection.items.length > 0 ? (
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {selectedCollection.items.map((item, idx) => (
              <MediaCard key={idx} item={item} />
            ))}
          </Grid>
        ) : (
          <Text color="var(--muted-text)">This collection is empty.</Text>
        )}
      </VStack>
    );
  }

  // Trakt owned collection view
  if (collectionId === 'owned' && traktCollection) {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack justify="space-between">
          <HStack>
            <Button size="sm" variant="ghost" onClick={() => navigate('/shows/collections')}>
              Back
            </Button>
            <Library size={20} />
            <Heading size="md" color="var(--heading-color)">My Collection</Heading>
          </HStack>
          <HStack gap={2}>
            <Badge colorPalette="blue">{traktCollection.total_movies} movies</Badge>
            <Badge colorPalette="green">{traktCollection.total_shows} shows</Badge>
          </HStack>
        </HStack>

        <HStack gap={2}>
          <TabButton label="Movies" icon={<Film size={14} />} active={traktTab === 'movies'} onClick={() => setTraktTab('movies')} />
          <TabButton label="Shows" icon={<Tv size={14} />} active={traktTab === 'shows'} onClick={() => setTraktTab('shows')} />
        </HStack>

        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {traktTab === 'movies'
            ? traktCollection.movies.map((item, idx) => <MediaCard key={idx} item={item} />)
            : traktCollection.shows.map((item, idx) => <MediaCard key={idx} item={{ ...item, type: 'show' }} />)
          }
        </Grid>
      </VStack>
    );
  }

  // Favorites view
  if (collectionId === 'favorites') {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/shows/collections')}>
            Back
          </Button>
          <Heart size={20} color="var(--panel-red-text)" />
          <Heading size="md" color="var(--heading-color)">Favorites</Heading>
          <Badge colorPalette="red">{favorites.length} items</Badge>
        </HStack>
        <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
          {favorites.map((item, idx) => (
            <MediaCard key={idx} item={item} />
          ))}
        </Grid>
      </VStack>
    );
  }

  // Main list view
  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack>
          <FolderOpen size={24} />
          <Heading size="lg" color="var(--heading-color)">Collections</Heading>
        </HStack>
        <HStack gap={2}>
          <TMDBAttribution />
          {!isStaticMode() && (
            <Button size="sm" colorPalette="blue" onClick={() => setCreating(true)}>
              <Plus size={16} /> New Collection
            </Button>
          )}
        </HStack>
      </HStack>

      {creating && (
        <Box p={4} border="1px solid" borderColor="var(--border-color)" borderRadius="lg" bg="var(--card-bg)">
          <VStack gap={3} align="stretch">
            <Input
              placeholder="Collection name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              bg="var(--input-bg)"
            />
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              bg="var(--input-bg)"
            />
            <HStack>
              <Button size="sm" colorPalette="blue" onClick={handleCreate}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </HStack>
          </VStack>
        </Box>
      )}

      {/* Trakt Collection (owned media) */}
      {traktCollection && (traktCollection.total_movies > 0 || traktCollection.total_shows > 0) && (
        <Box
          p={4}
          border="1px solid"
          borderColor="var(--panel-blue-border)"
          borderRadius="lg"
          cursor="pointer"
          onClick={() => navigate('/shows/collections/owned')}
          _hover={{ boxShadow: 'sm' }}
          transition="all 0.2s"
          bg="var(--panel-blue-bg)"
        >
          <HStack justify="space-between">
            <HStack>
              <Library size={20} color="var(--panel-blue-text)" />
              <Heading size="sm" color="var(--panel-blue-heading)">My Collection</Heading>
            </HStack>
            <HStack gap={2}>
              <Badge colorPalette="blue">{traktCollection.total_movies} movies</Badge>
              <Badge colorPalette="green">{traktCollection.total_shows} shows</Badge>
            </HStack>
          </HStack>
          <Text fontSize="sm" color="var(--panel-blue-text)" mt={2}>Media you own — imported from Trakt</Text>
        </Box>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <Box
          p={4}
          border="1px solid"
          borderColor="var(--panel-red-border)"
          borderRadius="lg"
          cursor="pointer"
          onClick={() => navigate('/shows/collections/favorites')}
          _hover={{ boxShadow: 'sm' }}
          transition="all 0.2s"
          bg="var(--panel-red-bg)"
        >
          <HStack justify="space-between">
            <HStack>
              <Heart size={20} color="var(--panel-red-text)" />
              <Heading size="sm" color="var(--panel-red-heading)">Favorites</Heading>
            </HStack>
            <Badge colorPalette="red">{favorites.length} items</Badge>
          </HStack>
          <Text fontSize="sm" color="var(--panel-red-text)" mt={2}>Your all-time favorites</Text>
        </Box>
      )}

      {/* User-created playlists */}
      {collections.length > 0 && (
        <Grid templateColumns="repeat(auto-fill, minmax(250px, 1fr))" gap={4}>
          {collections.map(col => (
            <Box
              key={col.id}
              p={4}
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
              bg="var(--card-bg)"
              cursor="pointer"
              onClick={() => navigate(`/shows/collections/${col.id}`)}
              _hover={{ borderColor: 'var(--panel-blue-border)', boxShadow: 'sm' }}
              transition="all 0.2s"
            >
              <HStack justify="space-between" mb={2}>
                <Heading size="sm" color="var(--heading-color)">{col.name}</Heading>
                {!isStaticMode() && (
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={(e) => { e.stopPropagation(); handleDelete(col.id); }}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </HStack>
              {col.description && (
                <Text fontSize="sm" color="var(--muted-text)" mb={2} lineClamp={2}>{col.description}</Text>
              )}
              <Badge colorPalette="gray">{col.item_count} items</Badge>
            </Box>
          ))}
        </Grid>
      )}

      {!traktCollection && collections.length === 0 && favorites.length === 0 && (
        <Box textAlign="center" py={10}>
          <Flex justify="center" color="var(--empty-text)"><FolderOpen size={48} /></Flex>
          <Text color="var(--muted-text)" mt={4}>No collections yet. Create one to organize your shows and movies.</Text>
        </Box>
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

export default ShowsCollections;
