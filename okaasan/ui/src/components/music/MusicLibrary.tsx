import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Input, Button } from '@chakra-ui/react';
import { Music, Disc3, Users, ListMusic, Play, Plus, Shuffle } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';

type GroupBy = 'artist' | 'album';

interface Album {
  id: number;
  name: string;
  artist: string;
  year: number | null;
  cover_path: string | null;
  track_count: number;
}

interface Artist {
  id: number;
  name: string;
  album_count: number;
  track_count: number;
  cover_path: string | null;
}

interface MusicLibraryData {
  albums: Album[];
  artists: Artist[];
  tracks: MusicTrack[];
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined;
  if (coverPath.startsWith('/uploads/') || coverPath.startsWith('uploads/')) {
    return `/api/${coverPath.replace(/^\//, '')}`;
  }
  if (coverPath.startsWith('/')) return `/api${coverPath}`;
  if (coverPath.startsWith('http')) return coverPath;
  return `/api/${coverPath}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MusicLibrary: React.FC = () => {
  const [data, setData] = useState<MusicLibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('artist');
  const { play, addToQueue, playAlbum, shuffleAll } = useMusicPlayer();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    recipeAPI.request<MusicLibraryData>('/music/library')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    if (!data) return [];
    const q = debounced.toLowerCase();
    const tracks = data.tracks.filter(t =>
      !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.album || '').toLowerCase().includes(q)
    );

    if (groupBy === 'artist') {
      const map = new Map<string, MusicTrack[]>();
      for (const t of tracks) {
        const key = t.artist || 'Unknown Artist';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, items]) => ({
          name,
          tracks: items.sort((a, b) => (a.album || '').localeCompare(b.album || '') || (a.track_number || 0) - (b.track_number || 0)),
          cover: items.find(t => t.cover_path)?.cover_path || null,
          subtitle: `${new Set(items.map(t => t.album).filter(Boolean)).size} albums · ${items.length} tracks`,
        }));
    } else {
      const map = new Map<string, MusicTrack[]>();
      for (const t of tracks) {
        const key = t.album || 'Unknown Album';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, items]) => ({
          name,
          tracks: items.sort((a, b) => (a.track_number || 0) - (b.track_number || 0)),
          cover: items.find(t => t.cover_path)?.cover_path || null,
          subtitle: `${items[0]?.artist || 'Various'} · ${items.length} tracks`,
        }));
    }
  }, [data, debounced, groupBy]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!data) {
    return (
      <Flex justify="center" align="center" minH="200px" direction="column" gap={3}>
        <Music size={48} color="var(--muted-text)" />
        <Text color="var(--muted-text)">
          No music found. Configure your library folders in Settings.
        </Text>
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <HStack>
          <Music size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Music Library</Heading>
          <Badge colorPalette="blue" ml={2}>{data.tracks.length} tracks</Badge>
        </HStack>
        <Button size="sm" variant="outline" onClick={shuffleAll}>
          <Shuffle size={14} />
          <Text ml={1}>Shuffle All</Text>
        </Button>
      </HStack>

      <HStack gap={3} flexWrap="wrap">
        <Input
          placeholder="Search music..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxW="300px"
          size="sm"
        />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <Text fontSize="sm" color="var(--muted-text)">Group by:</Text>
        <HStack gap={1} bg="var(--surface-muted)" p={1} borderRadius="md">
          <Button
            size="xs"
            variant={groupBy === 'artist' ? 'solid' : 'ghost'}
            colorPalette={groupBy === 'artist' ? 'blue' : 'gray'}
            onClick={() => setGroupBy('artist')}
          >
            <Users size={12} />
            <Text ml={1}>Artist</Text>
          </Button>
          <Button
            size="xs"
            variant={groupBy === 'album' ? 'solid' : 'ghost'}
            colorPalette={groupBy === 'album' ? 'blue' : 'gray'}
            onClick={() => setGroupBy('album')}
          >
            <Disc3 size={12} />
            <Text ml={1}>Album</Text>
          </Button>
        </HStack>
        <Badge colorPalette="gray" fontSize="xs">{grouped.length} {groupBy === 'artist' ? 'artists' : 'albums'}</Badge>
      </HStack>

      {grouped.length === 0 ? (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">No results match your search.</Text>
        </Flex>
      ) : (
        <VStack align="stretch" gap={4}>
          {grouped.map(group => (
            <GroupCard
              key={group.name}
              group={group}
              groupBy={groupBy}
              onPlay={play}
              onQueue={addToQueue}
              onPlayAll={() => playAlbum(group.tracks)}
            />
          ))}
        </VStack>
      )}
    </VStack>
  );
};

interface GroupCardProps {
  group: {
    name: string;
    tracks: MusicTrack[];
    cover: string | null;
    subtitle: string;
  };
  groupBy: GroupBy;
  onPlay: (track: MusicTrack) => void;
  onQueue: (track: MusicTrack) => void;
  onPlayAll: () => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, groupBy, onPlay, onQueue, onPlayAll }) => {
  const [expanded, setExpanded] = useState(false);
  const cover = resolveCover(group.cover);
  const displayTracks = expanded ? group.tracks : group.tracks.slice(0, 5);

  return (
    <Box
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      overflow="hidden"
    >
      {/* Group header */}
      <HStack
        p={3}
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
        _hover={{ bg: 'var(--hover-bg)' }}
        gap={3}
      >
        {cover ? (
          <Box as="img" src={cover} w="48px" h="48px" borderRadius={groupBy === 'artist' ? 'full' : 'md'} objectFit="cover" flexShrink={0} />
        ) : (
          <Box
            w="48px" h="48px" borderRadius={groupBy === 'artist' ? 'full' : 'md'}
            bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center" flexShrink={0}
          >
            {groupBy === 'artist' ? <Users size={20} color="var(--muted-text)" /> : <Disc3 size={20} color="var(--muted-text)" />}
          </Box>
        )}
        <Box flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="bold" lineClamp={1}>{group.name}</Text>
          <Text fontSize="xs" color="var(--muted-text)">{group.subtitle}</Text>
        </Box>
        <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); onPlayAll(); }} title="Play all">
          <Play size={14} />
        </Button>
        <Text fontSize="xs" color="var(--muted-text)">{expanded ? '▲' : '▼'}</Text>
      </HStack>

      {/* Track list */}
      {(expanded || group.tracks.length <= 5) && (
        <VStack align="stretch" gap={0} px={2} pb={2}>
          {displayTracks.map((track, idx) => (
            <HStack
              key={track.id}
              px={2} py={1.5}
              borderRadius="md"
              _hover={{ bg: 'var(--hover-bg)' }}
              gap={2}
            >
              <Text fontSize="2xs" color="var(--muted-text)" w="20px" textAlign="right" flexShrink={0}>
                {track.track_number || idx + 1}
              </Text>
              <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => onPlay(track)}>
                <Play size={12} />
              </Button>
              <Box flex={1} minW={0}>
                <Text fontSize="sm" lineClamp={1}>{track.title}</Text>
                {groupBy === 'artist' && track.album && (
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.album}</Text>
                )}
                {groupBy === 'album' && track.artist && (
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.artist}</Text>
                )}
              </Box>
              <Text fontSize="2xs" color="var(--muted-text)">{formatDuration(track.duration)}</Text>
              <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => onQueue(track)} title="Add to queue">
                <Plus size={12} />
              </Button>
            </HStack>
          ))}
          {!expanded && group.tracks.length > 5 && (
            <Button size="xs" variant="ghost" onClick={() => setExpanded(true)} w="100%">
              <Text fontSize="xs" color="var(--muted-text)">Show all {group.tracks.length} tracks</Text>
            </Button>
          )}
        </VStack>
      )}
    </Box>
  );
};

export default MusicLibrary;
