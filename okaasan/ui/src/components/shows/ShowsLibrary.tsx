import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Input, Button } from '@chakra-ui/react';
import { HardDrive, Film, Tv, RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import VideoPlayerModal from './VideoPlayerModal';
import LibraryCard from './LibraryCard';
import type { LibraryFile, GroupedMedia } from './LibraryCard';

interface AllFilesResponse {
  files: LibraryFile[];
  watched: Record<number, [number, number][]>;
  watched_movies: number[];
}

type MatchFilter = 'all' | 'matched' | 'unmatched';
type TypeFilter = 'all' | 'shows' | 'movies';

const ShowsLibrary: React.FC = () => {
  const [allFiles, setAllFiles] = useState<LibraryFile[]>([]);
  const [watchedMap, setWatchedMap] = useState<Record<number, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [player, setPlayer] = useState<{
    title: string;
    files: LibraryFile[];
  } | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [watchedMovieIds, setWatchedMovieIds] = useState<Set<number>>(new Set());
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [data, favData] = await Promise.all([
        recipeAPI.request<AllFilesResponse>('/shows/library/all-files'),
        recipeAPI.request<{ ids: number[] }>('/shows/favorites/ids'),
      ]);
      setAllFiles(data.files);
      const wm: Record<number, Set<string>> = {};
      for (const [mid, eps] of Object.entries(data.watched)) {
        wm[Number(mid)] = new Set(eps.map(([s, e]) => `${s}-${e}`));
      }
      setWatchedMap(wm);
      setWatchedMovieIds(new Set(data.watched_movies || []));
      setFavoriteIds(new Set(favData.ids));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(true); }, [fetchData]);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedMedia>();
    for (const f of allFiles) {
      const key = f.matched && f.tmdb_id
        ? `${f.media_type}-${f.tmdb_id}`
        : `unmatched-${(f.title || f.file_path).toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: f.db_title || f.title || f.file_path.split('/').pop() || 'Unknown',
          media_type: f.media_type,
          tmdb_id: f.tmdb_id,
          media_id: f.media_id,
          matched: f.matched,
          poster_path: f.poster_path,
          year: f.year,
          files: [],
        });
      }
      const g = map.get(key)!;
      g.files.push(f);
      if (!g.poster_path && f.poster_path) g.poster_path = f.poster_path;
    }
    for (const g of map.values()) {
      g.files.sort((a, b) => {
        if (a.season !== b.season) return (a.season ?? 0) - (b.season ?? 0);
        return (a.episode ?? 0) - (b.episode ?? 0);
      });
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.title.localeCompare(b.title));
    return arr;
  }, [allFiles]);

  const filtered = useMemo(() => {
    let result = grouped;
    if (matchFilter === 'matched') result = result.filter(g => g.matched);
    else if (matchFilter === 'unmatched') result = result.filter(g => !g.matched);
    if (typeFilter === 'shows') result = result.filter(g => g.media_type === 'show' || g.media_type === 'anime');
    else if (typeFilter === 'movies') result = result.filter(g => g.media_type === 'movie');
    if (debounced) {
      const q = debounced.toLowerCase();
      result = result.filter(g => g.title.toLowerCase().includes(q));
    }
    return result;
  }, [grouped, debounced, matchFilter, typeFilter]);

  const shows = filtered.filter(g => g.media_type === 'show' || g.media_type === 'anime');
  const movies = filtered.filter(g => g.media_type === 'movie');
  const matchedCount = grouped.filter(g => g.matched).length;
  const unmatchedCount = grouped.filter(g => !g.matched).length;
  const showsCount = grouped.filter(g => g.media_type === 'show' || g.media_type === 'anime').length;
  const moviesCount = grouped.filter(g => g.media_type === 'movie').length;

  const getNextUnwatched = useCallback((group: GroupedMedia): LibraryFile => {
    if (!group.media_id || !watchedMap[group.media_id]) return group.files[0];
    const watched = watchedMap[group.media_id];
    const next = group.files.find(f =>
      f.season != null && f.episode != null && !watched.has(`${f.season}-${f.episode}`)
    );
    return next || group.files[0];
  }, [watchedMap]);

  const openPlayer = useCallback((groupFiles: LibraryFile[], title: string) => {
    setPlayer({ title, files: groupFiles });
  }, []);

  const toggleFavorite = useCallback(async (mediaId: number) => {
    try {
      const res = await recipeAPI.request<{ favorited: boolean }>('/shows/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
      });
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (res.favorited) next.add(mediaId);
        else next.delete(mediaId);
        return next;
      });
    } catch (e) { console.error(e); }
  }, []);

  const markWatched = useCallback(async (group: GroupedMedia) => {
    const mediaId = group.media_id;
    if (!mediaId) return;

    const isShow = group.media_type !== 'movie';
    if (isShow) {
      // Find next unwatched episode
      const watched = watchedMap[mediaId] || new Set<string>();
      const next = group.files.find(f =>
        f.season != null && f.episode != null && !watched.has(`${f.season}-${f.episode}`)
      );
      if (!next || next.season == null || next.episode == null) return;

      // Optimistic update
      setWatchedMap(prev => {
        const updated = { ...prev };
        const set = new Set(updated[mediaId] || []);
        set.add(`${next.season}-${next.episode}`);
        updated[mediaId] = set;
        return updated;
      });

      try {
        await recipeAPI.request('/shows/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_id: mediaId, season: next.season, episode: next.episode }),
        });
      } catch (e) { console.error(e); }
    } else {
      // Movie: mark as watched
      setWatchedMovieIds(prev => new Set([...prev, mediaId]));
      try {
        await recipeAPI.request('/shows/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_id: mediaId }),
        });
      } catch (e) { console.error(e); }
    }
  }, [watchedMap]);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    try {
      await recipeAPI.request('/shows/library/scan', { method: 'POST' });
      await fetchData();
    } catch (e) { console.error(e); }
    finally { setScanning(false); }
  }, [fetchData]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      {player && (
        <VideoPlayerModal
          title={player.title}
          files={player.files}
          onClose={() => setPlayer(null)}
        />
      )}

      <HStack justify="space-between">
        <HStack>
          <HardDrive size={24} />
          <Heading size="lg" color="var(--heading-color)">Library</Heading>
          <Badge colorPalette="blue" ml={2}>{grouped.length} items</Badge>
        </HStack>
        <Button
          size="sm"
          variant="outline"
          onClick={triggerScan}
          disabled={scanning}
        >
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          <Text ml={1}>{scanning ? 'Scanning...' : 'Scan'}</Text>
        </Button>
      </HStack>

      {/* Search + Filters */}
      <HStack gap={3} flexWrap="wrap">
        <Input
          placeholder="Search library..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxW="300px"
          size="sm"
        />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={grouped.length} active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} icon={<HardDrive size={13} />} />
        <FilterChip label="Shows" count={showsCount} active={typeFilter === 'shows'} onClick={() => setTypeFilter('shows')} icon={<Tv size={13} />} />
        <FilterChip label="Movies" count={moviesCount} active={typeFilter === 'movies'} onClick={() => setTypeFilter('movies')} icon={<Film size={13} />} />
        <Box borderRight="1px solid" borderColor="var(--border-color)" h="24px" />
        <FilterChip label="All" count={grouped.length} active={matchFilter === 'all'} onClick={() => setMatchFilter('all')} />
        <FilterChip label="Matched" count={matchedCount} active={matchFilter === 'matched'} onClick={() => setMatchFilter('matched')} />
        <FilterChip label="Unmatched" count={unmatchedCount} active={matchFilter === 'unmatched'} onClick={() => setMatchFilter('unmatched')} />
      </HStack>

      {/* Shows */}
      {shows.length > 0 && typeFilter !== 'movies' && (
        <Box>
          {typeFilter === 'all' && (
            <HStack mb={3}>
              <Tv size={20} />
              <Heading size="md" color="var(--heading-color)">Shows</Heading>
              <Badge colorPalette="gray">{shows.length} items</Badge>
            </HStack>
          )}
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {shows.map(g => (
              <LibraryCard
                key={g.key}
                group={g}
                watchedSet={g.media_id ? watchedMap[g.media_id] : undefined}
                isFavorite={g.media_id ? favoriteIds.has(g.media_id) : false}
                onPlay={() => openPlayer(g.files, g.title)}
                onToggleFavorite={() => g.media_id && toggleFavorite(g.media_id)}
                onMarkWatched={() => markWatched(g)}
                getNextUnwatched={() => getNextUnwatched(g)}
              />
            ))}
          </Grid>
        </Box>
      )}

      {/* Movies */}
      {movies.length > 0 && typeFilter !== 'shows' && (
        <Box>
          {typeFilter === 'all' && (
            <HStack mb={3}>
              <Film size={20} />
              <Heading size="md" color="var(--heading-color)">Movies</Heading>
              <Badge colorPalette="gray">{movies.length} items</Badge>
            </HStack>
          )}
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {movies.map(g => (
              <LibraryCard
                key={g.key}
                group={g}
                isMovieWatched={g.media_id ? watchedMovieIds.has(g.media_id) : false}
                isFavorite={g.media_id ? favoriteIds.has(g.media_id) : false}
                onPlay={() => openPlayer(g.files, g.title)}
                onToggleFavorite={() => g.media_id && toggleFavorite(g.media_id)}
                onMarkWatched={() => markWatched(g)}
                getNextUnwatched={() => g.files[0]}
              />
            ))}
          </Grid>
        </Box>
      )}

      {filtered.length === 0 && (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">
            {allFiles.length === 0
              ? 'No files in library. Configure folders in Settings → Media Library.'
              : 'No results match your search.'}
          </Text>
        </Flex>
      )}
    </VStack>
  );
};

const FilterChip: React.FC<{ label: string; count: number; active: boolean; onClick: () => void; icon?: React.ReactNode }> = ({
  label, count, active, onClick, icon,
}) => (
  <Box
    px={3}
    py={1.5}
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
      <Badge colorPalette="gray" fontSize="2xs">{count}</Badge>
    </HStack>
  </Box>
);

export default ShowsLibrary;
