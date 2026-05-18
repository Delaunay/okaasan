import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Button, Input, Badge } from '@chakra-ui/react';
import { Film, Tv, Search, Trash2, Heart, Layers } from 'lucide-react';
import { recipeAPI, isStaticMode } from '../../services/api';
import MediaCard from './MediaCard';
import TMDBAttribution from './TMDBAttribution';

interface HistoryPage {
  items: any[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

const PER_PAGE = 48;

function getInitialParams() {
  const hash = window.location.hash;
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIdx + 1));
}

const ShowsHistory: React.FC = () => {
  const initialParams = useRef(getInitialParams());
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(() => parseInt(initialParams.current.get('page') || '1', 10));
  const [filter, setFilter] = useState<string | null>(initialParams.current.get('type') || null);
  const [searchQuery, setSearchQuery] = useState(initialParams.current.get('q') || '');
  const [groupByShow, setGroupByShow] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const maxPageLoaded = useRef(0);

  const updateURL = useCallback((p: number, mediaType: string | null, q: string) => {
    const params = new URLSearchParams();
    if (p > 1) params.set('page', String(p));
    if (mediaType) params.set('type', mediaType);
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    const base = window.location.hash.split('?')[0];
    const newHash = qs ? `${base}?${qs}` : base;
    window.history.replaceState(null, '', newHash);
  }, []);

  const fetchPage = useCallback(async (p: number, mediaType: string | null, query: string, append: boolean) => {
    if (p === 1 && !append) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) });
      if (mediaType) params.set('media_type', mediaType);
      if (query.trim()) params.set('q', query.trim());
      const result = await recipeAPI.request<HistoryPage>(`/shows/history?${params}`);
      setTotal(result.total);
      setHasMore(p < result.total_pages);

      if (append) {
        setItems(prev => [...prev, ...result.items]);
      } else {
        setItems(result.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Load favorites
  useEffect(() => {
    recipeAPI.request<{ ids: number[] }>('/shows/favorites/ids')
      .then(res => setFavoriteIds(new Set(res.ids)))
      .catch(() => {});
  }, []);

  // Initial load and reset on filter/search change
  useEffect(() => {
    setPage(1);
    maxPageLoaded.current = 1;
    setHasMore(true);
    fetchPage(1, filter, searchQuery, false);
    updateURL(1, filter, searchQuery);
  }, [filter, fetchPage, updateURL]);

  // Handle search with debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      maxPageLoaded.current = 1;
      setHasMore(true);
      fetchPage(1, filter, value, false);
      updateURL(1, filter, value);
    }, 500);
  };

  const handleDelete = async (watchHistoryId: number) => {
    try {
      await recipeAPI.request(`/shows/history/${watchHistoryId}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.watch_history_id !== watchHistoryId));
      setTotal(prev => prev - 1);
    } catch (e) {
      console.error(e);
    }
  };

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

  const displayItems = useMemo(() => {
    if (!groupByShow) return items;
    const grouped = new Map<string, any>();
    for (const item of items) {
      const key = item.media_id ? String(item.media_id) : `${item.watch_history_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...item, episode_count: 1, episodes_list: [item] });
      } else {
        const g = grouped.get(key)!;
        g.episode_count += 1;
        g.episodes_list.push(item);
      }
    }
    return Array.from(grouped.values());
  }, [items, groupByShow]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        maxPageLoaded.current = nextPage;
        fetchPage(nextPage, filter, searchQuery, true);
        updateURL(nextPage, filter, searchQuery);
      }
    }, { threshold: 0.1 });

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, page, filter, searchQuery, fetchPage, updateURL]);

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Heading size="lg" color="var(--heading-color)">Watch History</Heading>
        <HStack gap={2} flexWrap="wrap">
          <TMDBAttribution />
          <FilterButton label="All" active={!filter} onClick={() => setFilter(null)} />
          <FilterButton label="Shows" icon={<Tv size={14} />} active={filter === 'show'} onClick={() => setFilter('show')} />
          <FilterButton label="Movies" icon={<Film size={14} />} active={filter === 'movie'} onClick={() => setFilter('movie')} />
          <Button
            size="sm"
            variant={groupByShow ? 'solid' : 'outline'}
            colorPalette={groupByShow ? 'purple' : undefined}
            onClick={() => setGroupByShow(!groupByShow)}
            title="Group episodes by show"
          >
            <Layers size={14} />
            <Text ml={1}>Group</Text>
          </Button>
        </HStack>
      </HStack>

      {/* Search bar */}
      <HStack>
        <Box position="relative" flex={1}>
          <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" color="var(--muted-text)">
            <Search size={16} />
          </Box>
          <Input
            pl={10}
            placeholder="Search watch history..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            bg="var(--input-bg)"
          />
        </Box>
      </HStack>

      {loading ? (
        <Flex justify="center" py={10}>
          <Spinner size="lg" />
        </Flex>
      ) : displayItems.length > 0 ? (
        <>
          <Text fontSize="sm" color="var(--muted-text)">
            {total.toLocaleString()} items total{groupByShow ? ` (${displayItems.length} grouped)` : ''}
          </Text>
          <Grid templateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={4}>
            {displayItems.map((item, idx) => (
              <HistoryItem
                key={`${item.watch_history_id || item.id || idx}-${idx}`}
                item={item}
                grouped={groupByShow}
                isFavorite={item.media_id ? favoriteIds.has(item.media_id) : false}
                onToggleFavorite={item.media_id ? () => toggleFavorite(item.media_id) : undefined}
                onDelete={item.watch_history_id && !groupByShow ? () => handleDelete(item.watch_history_id) : undefined}
              />
            ))}
          </Grid>
          {hasMore && (
            <Box ref={sentinelRef} py={4}>
              {loadingMore && (
                <Flex justify="center">
                  <Spinner size="md" />
                </Flex>
              )}
            </Box>
          )}
        </>
      ) : (
        <Text color="var(--muted-text)">
          {searchQuery ? 'No results found.' : 'No history data available.'}
        </Text>
      )}
    </VStack>
  );
};

const HistoryItem: React.FC<{
  item: any;
  grouped?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
}> = ({ item, grouped, isFavorite, onToggleFavorite, onDelete }) => {
  return (
    <Box>
      <Box position="relative" overflow="hidden" borderRadius="lg">
        {/* Favorite heart — top left, always visible */}
        {onToggleFavorite && !isStaticMode() && (
          <Button
            position="absolute"
            top={1}
            left={1}
            zIndex={3}
            size="xs"
            variant="ghost"
            p={1}
            minW="auto"
            h="auto"
            borderRadius="full"
            bg={isFavorite ? 'rgba(239,68,68,0.8)' : 'rgba(0,0,0,0.5)'}
            color="white"
            _hover={{ bg: isFavorite ? 'red.600' : 'red.500' }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(); }}
          >
            <Heart size={14} fill={isFavorite ? 'white' : 'none'} />
          </Button>
        )}
        {/* Delete — bottom right (only in non-grouped mode) */}
        {onDelete && !isStaticMode() && (
          <Button
            position="absolute"
            bottom={1}
            right={1}
            zIndex={2}
            size="xs"
            variant="ghost"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            title="Remove from history"
            p={1}
            minW="auto"
            h="auto"
            borderRadius="full"
            bg="rgba(0,0,0,0.5)"
            color="white"
            _hover={{ bg: 'rgba(200,0,0,0.7)' }}
          >
            <Trash2 size={14} />
          </Button>
        )}
        {/* Episode count badge when grouped */}
        {grouped && item.episode_count > 1 && (
          <Badge
            position="absolute"
            top={1}
            right={1}
            zIndex={2}
            colorPalette="blue"
            fontSize="2xs"
            bg="rgba(0,0,0,0.7)"
            color="white"
          >
            {item.episode_count} eps watched
          </Badge>
        )}
        <MediaCard item={item} />
      </Box>
      {/* Episode info below card */}
      {grouped && item.episode_count > 1 ? (
        <Text fontSize="xs" color="var(--muted-text)" mt={1} px={1} lineClamp={1}>
          Last: S{item.season}E{item.episode}
        </Text>
      ) : item.season != null && item.episode != null ? (
        <Text fontSize="xs" color="var(--muted-text)" mt={1} px={1}>
          S{item.season}E{item.episode}
        </Text>
      ) : null}
    </Box>
  );
};

const FilterButton: React.FC<{ label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }> = ({
  label, icon, active, onClick
}) => (
  <Button
    size="sm"
    variant={active ? 'solid' : 'outline'}
    colorPalette={active ? 'blue' : undefined}
    onClick={onClick}
  >
    {icon && <Box mr={1}>{icon}</Box>}
    {label}
  </Button>
);

export default ShowsHistory;
