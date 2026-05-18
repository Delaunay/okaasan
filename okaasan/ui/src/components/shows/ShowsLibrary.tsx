import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Image, Input, Button } from '@chakra-ui/react';
import { HardDrive, Film, Tv, Play, Filter } from 'lucide-react';
import { recipeAPI, resolveMediaUrl } from '../../services/api';
import VideoPlayerModal from './VideoPlayerModal';

interface LibraryFile {
  id: number;
  media_id: number | null;
  media_type: string;
  tmdb_id: number | null;
  title: string | null;
  db_title: string | null;
  season: number | null;
  episode: number | null;
  file_path: string;
  file_size: number | null;
  container: string | null;
  matched: boolean;
  poster_path: string | null;
  year: number | null;
}

interface GroupedMedia {
  key: string;
  title: string;
  media_type: string;
  tmdb_id: number | null;
  media_id: number | null;
  matched: boolean;
  poster_path: string | null;
  year: number | null;
  files: LibraryFile[];
}

interface AllFilesResponse {
  files: LibraryFile[];
  watched: Record<number, [number, number][]>;
}

type MatchFilter = 'all' | 'matched' | 'unmatched';
type TypeFilter = 'all' | 'shows' | 'movies';

function resolvePoster(posterPath: string | null | undefined): string | undefined {
  return resolveMediaUrl(posterPath);
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

const ShowsLibrary: React.FC = () => {
  const [allFiles, setAllFiles] = useState<LibraryFile[]>([]);
  const [watchedMap, setWatchedMap] = useState<Record<number, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [player, setPlayer] = useState<{
    fileId: number;
    title: string;
    episodeLabel?: string;
    allFiles: LibraryFile[];
    fileIndex: number;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recipeAPI.request<AllFilesResponse>('/shows/library/all-files');
      setAllFiles(data.files);
      const wm: Record<number, Set<string>> = {};
      for (const [mid, eps] of Object.entries(data.watched)) {
        wm[Number(mid)] = new Set(eps.map(([s, e]) => `${s}-${e}`));
      }
      setWatchedMap(wm);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const playFile = useCallback((file: LibraryFile, groupFiles: LibraryFile[], title: string) => {
    const idx = groupFiles.indexOf(file);
    const epLabel = file.season != null && file.episode != null
      ? `S${String(file.season).padStart(2, '0')}E${String(file.episode).padStart(2, '0')}`
      : undefined;
    setPlayer({ fileId: file.id, title, episodeLabel: epLabel, allFiles: groupFiles, fileIndex: idx });
  }, []);

  const playNext = useCallback(() => {
    if (!player) return;
    const nextIdx = player.fileIndex + 1;
    if (nextIdx < player.allFiles.length) {
      const next = player.allFiles[nextIdx];
      const epLabel = next.season != null && next.episode != null
        ? `S${String(next.season).padStart(2, '0')}E${String(next.episode).padStart(2, '0')}`
        : undefined;
      setPlayer({ ...player, fileId: next.id, episodeLabel: epLabel, fileIndex: nextIdx });
    }
  }, [player]);

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
          streamUrl={`/api/shows/library/stream/${player.fileId}`}
          title={player.title}
          episodeLabel={player.episodeLabel}
          onClose={() => setPlayer(null)}
          onNext={player.fileIndex < player.allFiles.length - 1 ? playNext : undefined}
          hasNext={player.fileIndex < player.allFiles.length - 1}
        />
      )}

      <HStack>
        <HardDrive size={24} />
        <Heading size="lg" color="var(--heading-color)">Library</Heading>
        <Badge colorPalette="blue" ml={2}>{grouped.length} items</Badge>
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
                onPlay={(file) => playFile(file, g.files, g.title)}
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
                onPlay={(file) => playFile(file, g.files, g.title)}
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

const LibraryCard: React.FC<{
  group: GroupedMedia;
  watchedSet?: Set<string>;
  onPlay: (file: LibraryFile) => void;
  getNextUnwatched: () => LibraryFile;
}> = ({ group, watchedSet, onPlay, getNextUnwatched }) => {
  const episodeCount = group.files.length;
  const totalSize = group.files.reduce((sum, f) => sum + (f.file_size || 0), 0);
  const poster = resolvePoster(group.poster_path);
  const isShow = group.media_type !== 'movie';

  const watchedCount = isShow && watchedSet
    ? group.files.filter(f => f.season != null && f.episode != null && watchedSet.has(`${f.season}-${f.episode}`)).length
    : 0;

  const detailHref = group.tmdb_id
    ? `/shows-detail/${group.media_type === 'movie' ? 'movie' : 'tv'}/${group.tmdb_id}`
    : undefined;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = isShow ? getNextUnwatched() : group.files[0];
    onPlay(file);
  };

  const nextFile = isShow ? getNextUnwatched() : null;
  const nextLabel = nextFile && nextFile.season != null && nextFile.episode != null
    ? `S${String(nextFile.season).padStart(2, '0')}E${String(nextFile.episode).padStart(2, '0')}`
    : null;

  const card = (
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
      {/* Play button — top right */}
      <Box
        position="absolute"
        top={1}
        right={1}
        zIndex={2}
        onClick={handlePlay}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Button
          size="xs"
          variant="ghost"
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg="rgba(0,0,0,0.6)"
          color="white"
          _hover={{ bg: 'blue.500' }}
          title={nextLabel ? `Play ${nextLabel}` : 'Play'}
        >
          <Play size={14} />
        </Button>
      </Box>

      {/* Unmatched badge — top left */}
      {!group.matched && (
        <Box position="absolute" top={1} left={1} zIndex={2}>
          <Badge colorPalette="orange" fontSize="2xs" bg="rgba(0,0,0,0.6)" color="orange.300">
            Unmatched
          </Badge>
        </Box>
      )}

      <Box as={detailHref ? Link : 'div'} {...(detailHref ? { to: detailHref } : {})} style={{ textDecoration: 'none', color: 'inherit' }}>
        {poster ? (
          <Image src={poster} alt={group.title} w="100%" h="220px" objectFit="cover" loading="lazy" />
        ) : (
          <Box
            w="100%"
            h="220px"
            bg="var(--surface-muted)"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {isShow ? <Tv size={48} color="var(--muted-text)" /> : <Film size={48} color="var(--muted-text)" />}
          </Box>
        )}

        <Box p={3}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>{group.title}</Text>
          <HStack gap={2} mt={1} flexWrap="wrap">
            {group.year && <Text fontSize="xs" color="var(--muted-text)">{group.year}</Text>}
            {isShow && (
              <Badge colorPalette="gray" fontSize="2xs">{watchedCount}/{episodeCount} eps</Badge>
            )}
            <Text fontSize="xs" color="var(--muted-text)">{formatSize(totalSize)}</Text>
          </HStack>
          {isShow && nextLabel && (
            <Text fontSize="xs" color="blue.400" mt={1}>Next: {nextLabel}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );

  return card;
};

export default ShowsLibrary;
