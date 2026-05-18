import React, { useEffect, useState } from 'react';
import { Box, VStack, HStack, Text, Button, Input, Spinner } from '@chakra-ui/react';
import { ListMusic, Plus, X } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface PlaylistSummary {
  id: number;
  name: string;
  item_count: number;
}

interface AddToPlaylistPopupProps {
  trackId: number;
  onClose: () => void;
}

const AddToPlaylistPopup: React.FC<AddToPlaylistPopupProps> = ({ trackId, onClose }) => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    recipeAPI.request<PlaylistSummary[]>('/music/playlists')
      .then(setPlaylists)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const addToPlaylist = async (playlistId: number) => {
    setAdding(playlistId);
    try {
      await recipeAPI.request(`/music/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId }),
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    setAdding(-1);
    try {
      const pl = await recipeAPI.request<PlaylistSummary>('/music/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      await recipeAPI.request(`/music/playlists/${pl.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId }),
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Box
      position="fixed"
      top={0} left={0} right={0} bottom={0}
      bg="blackAlpha.500"
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={onClose}
    >
      <Box
        bg="var(--card-bg)"
        border="1px solid"
        borderColor="var(--border-color)"
        borderRadius="lg"
        boxShadow="xl"
        p={4}
        w="320px"
        maxH="400px"
        onClick={e => e.stopPropagation()}
      >
        <HStack justify="space-between" mb={3}>
          <HStack>
            <ListMusic size={16} color="var(--icon-color)" />
            <Text fontWeight="bold" fontSize="sm">Add to Playlist</Text>
          </HStack>
          <Button size="xs" variant="ghost" onClick={onClose} p={0} minW="auto">
            <X size={14} />
          </Button>
        </HStack>

        {/* Create new */}
        <HStack gap={2} mb={3}>
          <Input
            placeholder="New playlist..."
            size="xs"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAndAdd()}
          />
          <Button size="xs" onClick={createAndAdd} disabled={!newName.trim() || adding === -1}>
            <Plus size={12} />
          </Button>
        </HStack>

        {/* Existing playlists */}
        {loading ? (
          <Flex justify="center" py={4}><Spinner size="sm" /></Flex>
        ) : playlists.length === 0 ? (
          <Text fontSize="xs" color="var(--muted-text)" textAlign="center" py={2}>
            No playlists yet. Create one above!
          </Text>
        ) : (
          <VStack align="stretch" gap={1} maxH="220px" overflowY="auto">
            {playlists.map(pl => (
              <HStack
                key={pl.id}
                px={2} py={1.5}
                borderRadius="md"
                _hover={{ bg: 'var(--hover-bg)' }}
                cursor="pointer"
                onClick={() => addToPlaylist(pl.id)}
                opacity={adding === pl.id ? 0.5 : 1}
              >
                <ListMusic size={14} color="var(--muted-text)" />
                <Text fontSize="sm" flex={1} lineClamp={1}>{pl.name}</Text>
                <Text fontSize="2xs" color="var(--muted-text)">{pl.item_count}</Text>
              </HStack>
            ))}
          </VStack>
        )}
      </Box>
    </Box>
  );
};

// Inline Flex used above needs importing
const Flex = ({ children, ...props }: any) => (
  <Box display="flex" {...props}>{children}</Box>
);

export default AddToPlaylistPopup;
