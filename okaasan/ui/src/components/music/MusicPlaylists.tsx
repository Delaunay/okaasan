import React, { useEffect, useState, useCallback } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button, Input } from '@chakra-ui/react';
import { ListMusic, Play, Plus, Trash2, Music, X, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { recipeAPI, resolveMediaUrl, isStaticMode } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';

interface PlaylistSummary {
  id: number;
  name: string;
  is_public: boolean;
  item_count: number;
  created_at: string;
}

interface PlaylistItem {
  id: number;
  playlist_id: number;
  track_id: number;
  position: number;
  track: {
    id: number;
    title: string;
    artist: string;
    album: string;
    duration_ms: number;
    cover_path: string | null;
    track_number: number | null;
    has_local_file?: boolean;
    spotify_id?: string;
  };
}

interface PlaylistDetail {
  id: number;
  name: string;
  item_count: number;
  items: PlaylistItem[];
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function spotifyTrackUrl(spotifyId: string): string {
  const id = spotifyId.includes(':') ? spotifyId.split(':').pop()! : spotifyId;
  return `https://open.spotify.com/track/${id}`;
}

const MusicPlaylists: React.FC = () => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const { play, playAlbum } = useMusicPlayer();

  const fetchPlaylists = useCallback(async () => {
    try {
      const data = await recipeAPI.request<PlaylistSummary[]>('/music/playlists');
      setPlaylists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlaylists(); }, [fetchPlaylists]);

  const openPlaylist = async (id: number) => {
    try {
      const data = await recipeAPI.request<PlaylistDetail>(`/music/playlists/${id}`);
      setSelectedPlaylist(data);
    } catch (e) {
      console.error(e);
    }
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await recipeAPI.request('/music/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      fetchPlaylists();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const deletePlaylist = async (id: number) => {
    try {
      await recipeAPI.request(`/music/playlists/${id}`, { method: 'DELETE' });
      if (selectedPlaylist?.id === id) setSelectedPlaylist(null);
      fetchPlaylists();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleVisibility = async (id: number, currentlyPublic: boolean) => {
    try {
      await recipeAPI.request(`/music/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !currentlyPublic }),
      });
      fetchPlaylists();
    } catch (e) {
      console.error(e);
    }
  };

  const removeItem = async (playlistId: number, itemId: number) => {
    try {
      await recipeAPI.request(`/music/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' });
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(prev => prev ? {
          ...prev,
          items: prev.items.filter(i => i.id !== itemId),
          item_count: prev.item_count - 1,
        } : null);
      }
      fetchPlaylists();
    } catch (e) {
      console.error(e);
    }
  };

  const playAll = () => {
    if (!selectedPlaylist || selectedPlaylist.items.length === 0) return;
    const tracks: MusicTrack[] = selectedPlaylist.items
      .filter(item => item.track.has_local_file !== false)
      .map(item => ({
        id: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album,
        album_id: null,
        duration: (item.track.duration_ms || 0) / 1000,
        track_number: item.track.track_number,
        cover_path: item.track.cover_path,
        has_local_file: item.track.has_local_file,
      }));
    playAlbum(tracks);
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  // Playlist detail view
  if (selectedPlaylist) {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => setSelectedPlaylist(null)}>
            ← Back
          </Button>
          <Heading size="lg" color="var(--heading-color)">{selectedPlaylist.name}</Heading>
          <Badge colorPalette="blue">{selectedPlaylist.items.length} tracks</Badge>
          {(() => {
            const spotifyCount = selectedPlaylist.items.filter(i => i.track.spotify_id).length;
            return spotifyCount > 0 ? (
              <Badge colorPalette="green" variant="subtle">
                {spotifyCount} on Spotify
              </Badge>
            ) : null;
          })()}
        </HStack>

        {selectedPlaylist.items.length > 0 && (
          <Button size="sm" variant="outline" onClick={playAll} w="fit-content">
            <Play size={14} />
            <Text ml={1}>Play All</Text>
          </Button>
        )}

        {selectedPlaylist.items.length === 0 ? (
          <Flex justify="center" py={12} direction="column" align="center" gap={3}>
            <ListMusic size={48} color="var(--muted-text)" />
            <Text color="var(--muted-text)">This playlist is empty.</Text>
            <Text fontSize="sm" color="var(--muted-text)">
              Add tracks from the Library or use the + button on the player.
            </Text>
          </Flex>
        ) : (
          <VStack align="stretch" gap={1}>
            {selectedPlaylist.items.map((item, idx) => (
              <HStack
                key={item.id}
                p={2}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="md"
                _hover={{ borderColor: 'var(--icon-color)', bg: 'var(--hover-bg)' }}
                gap={3}
              >
                <Text fontSize="xs" color="var(--muted-text)" w="24px" textAlign="right">{idx + 1}</Text>
                {item.track.has_local_file !== false ? (
                  <Button
                    size="xs" variant="ghost" p={0} minW="auto" h="auto"
                    onClick={() => play({
                      id: item.track.id,
                      title: item.track.title,
                      artist: item.track.artist,
                      album: item.track.album,
                      album_id: null,
                      duration: (item.track.duration_ms || 0) / 1000,
                      track_number: item.track.track_number,
                      cover_path: item.track.cover_path,
                      has_local_file: item.track.has_local_file,
                    })}
                  >
                    <Play size={12} />
                  </Button>
                ) : (
                  <Box w="24px" />
                )}
                {item.track.cover_path ? (
                  <Box as="img" src={resolveCover(item.track.cover_path)} w="32px" h="32px" borderRadius="sm" objectFit="cover" flexShrink={0} />
                ) : (
                  <Box w="32px" h="32px" bg="var(--surface-muted)" borderRadius="sm" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                    <Music size={12} color="var(--muted-text)" />
                  </Box>
                )}
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>{item.track.title}</Text>
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>
                    {item.track.artist}{item.track.album ? ` — ${item.track.album}` : ''}
                  </Text>
                </Box>
                <Text fontSize="2xs" color="var(--muted-text)">{formatDuration(item.track.duration_ms || 0)}</Text>
                {item.track.spotify_id && (
                  <Button
                    size="xs" variant="ghost" p={0} minW="auto" h="auto"
                    asChild
                    title="Open on Spotify"
                  >
                    <a
                      href={spotifyTrackUrl(item.track.spotify_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={12} color="#1DB954" />
                    </a>
                  </Button>
                )}
                {!isStaticMode() && (
                  <Button
                    size="xs" variant="ghost" p={0} minW="auto" h="auto"
                    onClick={() => removeItem(selectedPlaylist.id, item.id)}
                    title="Remove from playlist"
                  >
                    <X size={12} />
                  </Button>
                )}
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    );
  }

  // Playlist list view
  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <ListMusic size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Playlists</Heading>
      </HStack>

      {!isStaticMode() && (
        <HStack gap={2}>
          <Input
            placeholder="New playlist name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            size="sm"
            maxW="300px"
            onKeyDown={e => e.key === 'Enter' && createPlaylist()}
          />
          <Button size="sm" onClick={createPlaylist} disabled={!newName.trim() || creating}>
            <Plus size={14} />
            <Text ml={1}>Create</Text>
          </Button>
        </HStack>
      )}

      {playlists.length === 0 ? (
        <Flex justify="center" py={12} direction="column" align="center" gap={3}>
          <ListMusic size={48} color="var(--muted-text)" />
          <Text color="var(--muted-text)">No playlists yet. Create one above!</Text>
        </Flex>
      ) : (
        <Grid templateColumns="repeat(auto-fill, minmax(240px, 1fr))" gap={4}>
          {playlists.map(pl => (
            <Box
              key={pl.id}
              p={4}
              bg="var(--card-bg)"
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
              cursor="pointer"
              opacity={pl.is_public ? 1 : 0.6}
              _hover={{ borderColor: 'var(--icon-color)', transform: 'translateY(-1px)' }}
              transition="all 0.2s"
              onClick={() => openPlaylist(pl.id)}
            >
              <HStack justify="space-between" mb={2}>
                <HStack>
                  <ListMusic size={18} color="var(--icon-color)" />
                  <Text fontWeight="bold" lineClamp={1}>{pl.name}</Text>
                  {!pl.is_public && (
                    <EyeOff size={14} color="var(--muted-text)" />
                  )}
                </HStack>
                {!isStaticMode() && (
                  <HStack gap={1}>
                    <Button
                      size="xs" variant="ghost" p={0} minW="auto" h="auto"
                      onClick={(e) => { e.stopPropagation(); toggleVisibility(pl.id, pl.is_public); }}
                      title={pl.is_public ? 'Make private' : 'Make public'}
                      color="var(--muted-text)"
                      _hover={{ color: 'var(--icon-color)' }}
                    >
                      {pl.is_public ? <Eye size={14} /> : <EyeOff size={14} />}
                    </Button>
                    <Button
                      size="xs" variant="ghost" p={0} minW="auto" h="auto"
                      onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }}
                      title="Delete playlist"
                      color="var(--muted-text)"
                      _hover={{ color: 'red.500' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </HStack>
                )}
              </HStack>
              <Text fontSize="sm" color="var(--muted-text)">
                {pl.item_count} {pl.item_count === 1 ? 'track' : 'tracks'}
              </Text>
            </Box>
          ))}
        </Grid>
      )}
    </VStack>
  );
};

export default MusicPlaylists;
