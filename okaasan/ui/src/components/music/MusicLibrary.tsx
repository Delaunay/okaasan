import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Input, Button } from '@chakra-ui/react';
import { Music, Disc3, Users, Play, Plus, Shuffle, ListPlus } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import { useMusicPlayer, type MusicTrack } from './MusicPlayerContext';
import AddToPlaylistPopup from './AddToPlaylistPopup';

type GroupBy = 'artist' | 'album';

interface MusicGroup {
  name: string;
  subtitle: string;
  cover_path: string | null;
  track_count: number;
  tracks: MusicTrack[];
}

interface LibraryPage {
  groups: MusicGroup[];
  total_groups: number;
  total_tracks: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

function resolveCover(coverPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(coverPath);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MusicLibrary: React.FC = () => {
  const [groups, setGroups] = useState<MusicGroup[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('artist');
  const [playlistTrackId, setPlaylistTrackId] = useState<number | null>(null);
  const { play, addToQueue, playAlbum, shuffleAll } = useMusicPlayer();
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(async (pageNum: number, reset: boolean) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        per_page: '30',
        group_by: groupBy,
      });
      if (debounced) params.set('q', debounced);
      const data = await recipeAPI.request<LibraryPage>(`/music/library?${params}`);
      if (reset) {
        setGroups(data.groups);
      } else {
        setGroups(prev => [...prev, ...data.groups]);
      }
      setTotalGroups(data.total_groups);
      setTotalTracks(data.total_tracks);
      setHasMore(data.has_more);
      setPage(pageNum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [groupBy, debounced]);

  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          fetchPage(page + 1, false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page, fetchPage]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <HStack>
          <Music size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Music Library</Heading>
          <Badge colorPalette="blue" ml={2}>{totalTracks} tracks</Badge>
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
        <Badge colorPalette="gray" fontSize="xs">{totalGroups} {groupBy === 'artist' ? 'artists' : 'albums'}</Badge>
      </HStack>

      {groups.length === 0 && !loading ? (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {debounced ? 'No results match your search.' : 'No music found. Configure your library folders in Settings.'}
          </Text>
        </Flex>
      ) : (
        <VStack align="stretch" gap={4}>
          {groups.map((group, idx) => (
            <GroupCard
              key={`${group.name}-${idx}`}
              group={group}
              groupBy={groupBy}
              onPlay={play}
              onQueue={addToQueue}
              onPlayAll={() => playAlbum(group.tracks)}
              onAddToPlaylist={(trackId) => setPlaylistTrackId(trackId)}
            />
          ))}
        </VStack>
      )}

      {/* Infinite scroll trigger */}
      <div ref={loaderRef} style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loadingMore && <Spinner size="sm" />}
        {!hasMore && groups.length > 0 && (
          <Text fontSize="xs" color="var(--muted-text)">All {totalGroups} {groupBy === 'artist' ? 'artists' : 'albums'} loaded</Text>
        )}
      </div>

      {playlistTrackId !== null && (
        <AddToPlaylistPopup trackId={playlistTrackId} onClose={() => setPlaylistTrackId(null)} />
      )}
    </VStack>
  );
};

interface GroupCardProps {
  group: MusicGroup;
  groupBy: GroupBy;
  onPlay: (track: MusicTrack) => void;
  onQueue: (track: MusicTrack) => void;
  onPlayAll: () => void;
  onAddToPlaylist: (trackId: number) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, groupBy, onPlay, onQueue, onPlayAll, onAddToPlaylist }) => {
  const [expanded, setExpanded] = useState(false);
  const cover = resolveCover(group.cover_path);
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
        {group.tracks.some(t => t.has_local_file !== false) && (
          <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); onPlayAll(); }} title="Play all">
            <Play size={14} />
          </Button>
        )}
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
              {track.has_local_file !== false ? (
                <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => onPlay(track)}>
                  <Play size={12} />
                </Button>
              ) : (
                <Box w="24px" />
              )}
              <Box flex={1} minW={0}>
                <Text fontSize="sm" lineClamp={1} color={track.has_local_file === false ? 'var(--muted-text)' : undefined}>{track.title}</Text>
                {groupBy === 'artist' && track.album && (
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.album}</Text>
                )}
                {groupBy === 'album' && track.artist && (
                  <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{track.artist}</Text>
                )}
              </Box>
              <Text fontSize="2xs" color="var(--muted-text)">{formatDuration(track.duration)}</Text>
              {track.has_local_file !== false && (
                <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => onQueue(track)} title="Add to queue">
                  <Plus size={12} />
                </Button>
              )}
              <Button size="xs" variant="ghost" p={0} minW="auto" h="auto" onClick={() => onAddToPlaylist(track.id)} title="Add to playlist">
                <ListPlus size={12} />
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
