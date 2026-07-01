import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Image, Badge, Input, Button } from '@chakra-ui/react';
import { TrendingUp, Star, Film, Tv, Compass, Search, Eye, Bookmark, CheckCircle, Calendar, Clapperboard } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import TMDBAttribution from './TMDBAttribution';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
}

type Category = 'trending' | 'popular' | 'top-rated' | 'upcoming' | 'now-playing' | 'search';
type MediaFilter = 'all' | 'movie' | 'tv';

const ShowsDiscover: React.FC = () => {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('trending');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [hideWatched, setHideWatched] = useState(true);
  const [watchedIds, setWatchedIds] = useState<Record<string, boolean>>({});
  const [watchlistIds, setWatchlistIds] = useState<Record<string, boolean>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStatus = useCallback(() => {
    recipeAPI.request<{ ids: Record<string, boolean> }>('/shows/watched-tmdb-ids')
      .then(data => setWatchedIds(data.ids || {}))
      .catch(() => {});
    recipeAPI.request<any[]>('/shows/watchlist')
      .then(items => {
        const ids: Record<string, boolean> = {};
        for (const item of items) {
          if (item.tmdb_id) ids[`${item.media_type}-${item.tmdb_id}`] = true;
        }
        setWatchlistIds(ids);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const fetchData = useCallback(async (cat: Category, media: MediaFilter, p: number, query: string, append: boolean) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      let endpoint: string;
      if (cat === 'search') {
        if (!query.trim()) { setItems([]); setLoading(false); return; }
        const mt = media === 'all' ? 'multi' : media;
        endpoint = `/shows/discover/search?q=${encodeURIComponent(query)}&media_type=${mt}`;
      } else if (cat === 'trending') {
        endpoint = `/shows/discover/trending?media_type=${media}&time_window=week&page=${p}`;
      } else if (cat === 'popular') {
        const mt = media === 'all' ? 'movie' : media;
        endpoint = `/shows/discover/popular?media_type=${mt}&page=${p}`;
      } else if (cat === 'top-rated') {
        const mt = media === 'all' ? 'movie' : media;
        endpoint = `/shows/discover/top-rated?media_type=${mt}&page=${p}`;
      } else if (cat === 'upcoming') {
        const mt = media === 'all' ? 'movie' : media;
        endpoint = `/shows/discover/upcoming?media_type=${mt}&page=${p}`;
      } else {
        const mt = media === 'all' ? 'movie' : media;
        endpoint = `/shows/discover/now-playing?media_type=${mt}&page=${p}`;
      }

      const data = await recipeAPI.request<{ results: TMDBItem[]; total_pages?: number }>(endpoint);
      const results = data.results || [];
      setHasMore(results.length >= 20 && p < (data.total_pages || 999));

      if (append) {
        setItems(prev => [...prev, ...results]);
      } else {
        setItems(results);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load');
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchData(category, mediaFilter, 1, searchQuery, false);
  }, [category, mediaFilter, fetchData]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim()) {
      setCategory('search');
      searchTimeout.current = setTimeout(() => {
        setPage(1);
        fetchData('search', mediaFilter, 1, value, false);
      }, 500);
    } else if (category === 'search') {
      setCategory('trending');
    }
  };

  const handleAddToWatchlist = async (item: TMDBItem) => {
    const mediaType = item.media_type === 'tv' ? 'show' : (item.media_type || 'movie');
    try {
      await recipeAPI.request('/shows/watchlist/add', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.id,
          media_type: mediaType,
          title: item.title || item.name,
          year: parseInt((item.release_date || item.first_air_date || '').slice(0, 4)) || undefined,
        }),
      });
      setWatchlistIds(prev => ({ ...prev, [`${mediaType}-${item.id}`]: true }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkWatched = async (item: TMDBItem) => {
    const mediaType = item.media_type === 'tv' ? 'show' : (item.media_type || 'movie');
    try {
      await recipeAPI.request('/shows/history', {
        method: 'POST',
        body: JSON.stringify({
          tmdb_id: item.id,
          media_type: mediaType,
          title: item.title || item.name,
          year: parseInt((item.release_date || item.first_air_date || '').slice(0, 4)) || undefined,
          ...(mediaType === 'show' ? { season: 1, episode: 1 } : {}),
        }),
      });
      setWatchedIds(prev => ({ ...prev, [`${mediaType}-${item.id}`]: true }));
      // If on watchlist, remove it
      if (watchlistIds[`${mediaType}-${item.id}`]) {
        // Find the media_id and remove
        const watchlistItems = await recipeAPI.request<any[]>('/shows/watchlist');
        const match = watchlistItems.find((w: any) => w.tmdb_id === item.id && w.media_type === mediaType);
        if (match) {
          await recipeAPI.request(`/shows/watchlist/${match.id}`, { method: 'DELETE' });
          setWatchlistIds(prev => {
            const copy = { ...prev };
            delete copy[`${mediaType}-${item.id}`];
            return copy;
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchData(category, mediaFilter, nextPage, searchQuery, true);
      }
    }, { threshold: 0.1 });

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, page, category, mediaFilter, searchQuery, fetchData]);

  const filteredItems = hideWatched
    ? items.filter(item => {
        const mt = item.media_type || (mediaFilter === 'tv' ? 'show' : 'movie');
        const normalizedType = mt === 'tv' ? 'show' : mt;
        return !watchedIds[`${normalizedType}-${item.id}`];
      })
    : items;

  const supportsAllFilter = category === 'trending' || category === 'search';

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <Compass size={24} />
        <Heading size="lg" color="var(--heading-color)">Discover</Heading>
        <TMDBAttribution />
      </HStack>

      {/* Search bar */}
      <HStack>
        <Box position="relative" flex={1}>
          <Box position="absolute" left={3} top="50%" transform="translateY(-50%)" color="var(--muted-text)">
            <Search size={16} />
          </Box>
          <Input
            pl={10}
            placeholder="Search movies and shows..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            bg="var(--input-bg)"
          />
        </Box>
      </HStack>

      {/* Category filters */}
      <HStack gap={2} flexWrap="wrap">
        <FilterButton label="Trending" icon={<TrendingUp size={14} />} active={category === 'trending'} onClick={() => { setCategory('trending'); setSearchQuery(''); }} />
        <FilterButton label="Popular" icon={<Star size={14} />} active={category === 'popular'} onClick={() => { setCategory('popular'); setSearchQuery(''); }} />
        <FilterButton label="Top Rated" icon={<Star size={14} />} active={category === 'top-rated'} onClick={() => { setCategory('top-rated'); setSearchQuery(''); }} />
        <FilterButton label="In Cinema" icon={<Clapperboard size={14} />} active={category === 'now-playing'} onClick={() => { setCategory('now-playing'); setSearchQuery(''); }} />
        <FilterButton label="Upcoming" icon={<Calendar size={14} />} active={category === 'upcoming'} onClick={() => { setCategory('upcoming'); setSearchQuery(''); }} />
        <Box w="1px" h="24px" bg="var(--border-color)" mx={2} />
        {supportsAllFilter && (
          <FilterButton label="All" active={mediaFilter === 'all'} onClick={() => setMediaFilter('all')} />
        )}
        <FilterButton label="Movies" icon={<Film size={14} />} active={mediaFilter === 'movie'} onClick={() => setMediaFilter('movie')} />
        <FilterButton label="Shows" icon={<Tv size={14} />} active={mediaFilter === 'tv'} onClick={() => setMediaFilter('tv')} />
        <Box w="1px" h="24px" bg="var(--border-color)" mx={2} />
        <FilterButton
          label={hideWatched ? 'Hide Watched' : 'Show All'}
          icon={<Eye size={14} />}
          active={hideWatched}
          onClick={() => setHideWatched(!hideWatched)}
        />
      </HStack>

      {error && (
        <Box p={4} bg="var(--panel-orange-bg)" border="1px solid" borderColor="var(--panel-orange-border)" borderRadius="lg">
          <Text color="var(--panel-orange-text)">{error}</Text>
        </Box>
      )}

      {loading ? (
        <Flex justify="center" py={10}>
          <Spinner size="lg" />
        </Flex>
      ) : filteredItems.length > 0 ? (
        <>
          {mediaFilter === 'all' ? (
            <Grid templateColumns="1fr 1fr" gap={6}>
              {/* Movies column */}
              <Box>
                <HStack mb={3}>
                  <Film size={16} />
                  <Text fontWeight="bold" color="var(--heading-color)">Movies</Text>
                  <Badge colorPalette="blue" fontSize="xs">
                    {filteredItems.filter(i => (i.media_type || 'movie') === 'movie').length}
                  </Badge>
                </HStack>
                <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
                  {filteredItems
                    .filter(item => (item.media_type || 'movie') === 'movie')
                    .map(item => {
                      const mt = 'movie';
                      const isWatched = watchedIds[`${mt}-${item.id}`] || false;
                      const isOnWatchlist = watchlistIds[`${mt}-${item.id}`] || false;
                      return (
                        <DiscoverCard
                          key={`${item.id}-movie`}
                          item={item}
                          isWatched={isWatched}
                          isOnWatchlist={isOnWatchlist}
                          onAddToWatchlist={() => handleAddToWatchlist(item)}
                          onMarkWatched={() => handleMarkWatched(item)}
                        />
                      );
                    })}
                </Grid>
              </Box>
              {/* Shows column */}
              <Box>
                <HStack mb={3}>
                  <Tv size={16} />
                  <Text fontWeight="bold" color="var(--heading-color)">Shows</Text>
                  <Badge colorPalette="blue" fontSize="xs">
                    {filteredItems.filter(i => i.media_type === 'tv').length}
                  </Badge>
                </HStack>
                <Grid templateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
                  {filteredItems
                    .filter(item => item.media_type === 'tv')
                    .map(item => {
                      const mt = 'show';
                      const isWatched = watchedIds[`${mt}-${item.id}`] || false;
                      const isOnWatchlist = watchlistIds[`${mt}-${item.id}`] || false;
                      return (
                        <DiscoverCard
                          key={`${item.id}-tv`}
                          item={item}
                          isWatched={isWatched}
                          isOnWatchlist={isOnWatchlist}
                          onAddToWatchlist={() => handleAddToWatchlist(item)}
                          onMarkWatched={() => handleMarkWatched(item)}
                        />
                      );
                    })}
                </Grid>
              </Box>
            </Grid>
          ) : (
            <Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap={4}>
              {filteredItems.map(item => {
                const mt = item.media_type === 'tv' ? 'show' : (item.media_type || 'movie');
                const isWatched = watchedIds[`${mt}-${item.id}`] || false;
                const isOnWatchlist = watchlistIds[`${mt}-${item.id}`] || false;
                return (
                  <DiscoverCard
                    key={`${item.id}-${item.media_type}`}
                    item={item}
                    isWatched={isWatched}
                    isOnWatchlist={isOnWatchlist}
                    onAddToWatchlist={() => handleAddToWatchlist(item)}
                    onMarkWatched={() => handleMarkWatched(item)}
                  />
                );
              })}
            </Grid>
          )}
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
      ) : !error ? (
        <Text color="var(--muted-text)">
          {category === 'search' && searchQuery ? 'No results found.' : 'No results.'}
        </Text>
      ) : null}
    </VStack>
  );
};

interface DiscoverCardProps {
  item: TMDBItem;
  isWatched: boolean;
  isOnWatchlist: boolean;
  onAddToWatchlist: () => void;
  onMarkWatched: () => void;
}

const DiscoverCard: React.FC<DiscoverCardProps> = ({ item, isWatched, isOnWatchlist, onAddToWatchlist, onMarkWatched }) => {
  const title = item.title || item.name || 'Unknown';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const poster = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null;
  const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
  const to = `/shows/detail/${mediaType}/${item.id}`;

  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      transition="transform 0.2s, box-shadow 0.2s"
      _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
      position="relative"
      opacity={isWatched ? 0.6 : 1}
    >
      {/* Icon-only action buttons overlaid on poster */}
      <Box
        position="absolute"
        top={1}
        left={1}
        zIndex={2}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Button
          size="xs"
          variant={isOnWatchlist ? 'solid' : 'ghost'}
          colorPalette={isOnWatchlist ? 'blue' : undefined}
          onClick={(e) => { e.preventDefault(); if (!isOnWatchlist && !isWatched) onAddToWatchlist(); }}
          disabled={isOnWatchlist || isWatched}
          title={isOnWatchlist ? 'On watchlist' : 'Add to watchlist'}
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg={isOnWatchlist ? undefined : 'rgba(0,0,0,0.5)'}
          color="white"
          _hover={{ bg: isOnWatchlist ? undefined : 'rgba(0,0,0,0.7)' }}
        >
          <Bookmark size={14} />
        </Button>
      </Box>
      <Box
        position="absolute"
        top={1}
        right={1}
        zIndex={2}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Button
          size="xs"
          variant={isWatched ? 'solid' : 'ghost'}
          colorPalette={isWatched ? 'green' : undefined}
          onClick={(e) => { e.preventDefault(); if (!isWatched) onMarkWatched(); }}
          disabled={isWatched}
          title={isWatched ? 'Already watched' : 'Mark as watched'}
          p={1}
          minW="auto"
          h="auto"
          borderRadius="full"
          bg={isWatched ? undefined : 'rgba(0,0,0,0.5)'}
          color="white"
          _hover={{ bg: isWatched ? undefined : 'rgba(0,0,0,0.7)' }}
        >
          <CheckCircle size={14} />
        </Button>
      </Box>

      <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
        {poster ? (
          <Image src={poster} alt={title} w="100%" h="220px" objectFit="cover" loading="lazy" />
        ) : (
          <Box w="100%" h="220px" bg="var(--surface-muted)" display="flex" alignItems="center" justifyContent="center">
            <Text color="var(--empty-text)" fontSize="sm">No Poster</Text>
          </Box>
        )}

        <Box p={3}>
          <Text fontSize="sm" fontWeight="semibold" lineClamp={2}>
            {title}
          </Text>
          <HStack gap={2} mt={1}>
            {year && <Text fontSize="xs" color="var(--muted-text)">{year}</Text>}
            {item.vote_average > 0 && (
              <Badge colorPalette="yellow" fontSize="xs">{item.vote_average.toFixed(1)}</Badge>
            )}
          </HStack>
        </Box>
      </Link>
    </Box>
  );
};

const FilterButton: React.FC<{ label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }> = ({
  label, icon, active, onClick
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
    </HStack>
  </Box>
);

export default ShowsDiscover;
