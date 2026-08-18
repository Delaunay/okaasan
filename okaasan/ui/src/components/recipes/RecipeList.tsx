import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  VStack,
  Text,
  Button,
  Spinner,
  HStack,
  Heading,
  SimpleGrid,
  Image,
  Badge,
  Input,
  Flex,
} from '@chakra-ui/react';
import { recipeAPI, imagePath } from '../../services/api';
import type { RecipeData } from '../../services/type';

// Component filter states
type ComponentFilter = 'all' | 'components' | 'dishes';

// Max total (prep + cook) time in minutes, or 'all' for no cap
type TimeFilter = 'all' | 30 | 60 | 90;

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  hellofresh: 'HelloFresh',
};

const sourceDisplayName = (source: string) =>
  SOURCE_DISPLAY_NAMES[source] ?? (source.charAt(0).toUpperCase() + source.slice(1));

const FilterChip = ({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) => (
  <Box
    as="button"
    onClick={onClick}
    px={3}
    py={1.5}
    borderRadius="md"
    fontWeight={active ? 'bold' : 'normal'}
    bg={active ? 'blue.500' : 'bg'}
    color={active ? 'white' : undefined}
    borderWidth="1px"
    borderColor={active ? 'blue.500' : 'gray.300'}
    fontSize="sm"
    cursor="pointer"
    _hover={{ borderColor: 'blue.400' }}
  >
    {label}
    {typeof count === 'number' && ` (${count})`}
  </Box>
);

// Recipes are fetched a page at a time (server-side pagination when a source
// filter narrows things down) so switching to "All"/"HelloFresh" on a catalog
// with thousands of rows doesn't stall the initial load.
const PAGE_SIZE = 100;

const RecipeList = () => {
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<RecipeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>('dishes');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  // Default to 'local' so the page loads fast even once thousands of scraped
  // recipes exist — switching to 'all'/'hellofresh' fetches those on demand.
  const [sourceFilter, setSourceFilter] = useState<string>('local');
  const [sourceCounts, setSourceCounts] = useState<Record<string, number> | null>(null);
  const navigate = useNavigate();
  const isStatic = recipeAPI.isStaticMode();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Source filter chip counts: server-reported totals when available (live mode),
  // falling back to counting whatever's currently loaded (static mode).
  const sourceOptions = useMemo(() => {
    if (sourceCounts) {
      const localCount = sourceCounts['local'] || 0;
      const sources = Object.entries(sourceCounts).filter(([key]) => key !== 'local');
      sources.sort((a, b) => b[1] - a[1]);
      const total = Object.values(sourceCounts).reduce((sum, n) => sum + n, 0);
      return { localCount, sources, total };
    }
    const counts = new Map<string, number>();
    let localCount = 0;
    for (const recipe of recipes) {
      if (recipe.source) {
        counts.set(recipe.source, (counts.get(recipe.source) || 0) + 1);
      } else {
        localCount += 1;
      }
    }
    return {
      localCount,
      sources: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]),
      total: recipes.length,
    };
  }, [recipes, sourceCounts]);

  const fetchRecipes = async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
    }

    try {
      if (isStatic) {
        // Static builds ship one pre-baked JSON file — nothing to paginate server-side.
        const all = await recipeAPI.getRecipes();
        setRecipes(all);
        setHasMore(false);
        return;
      }

      const offset = reset ? 0 : recipes.length;
      const page = await recipeAPI.getRecipes({
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        limit: PAGE_SIZE,
        offset,
      });
      setRecipes(prev => (reset ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recipes');
      console.error('Failed to fetch recipes:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    document.title = 'All Recipes';
    if (!isStatic) {
      recipeAPI.getRecipeSourceCounts()
        .then(rows => {
          const counts: Record<string, number> = {};
          for (const row of rows) counts[row.source ?? 'local'] = row.count;
          setSourceCounts(counts);
        })
        .catch(() => { /* counts are a nice-to-have, ignore failures */ });
    }
  }, []);

  // (Re)load the first page whenever the server-side filter changes.
  // Runs on mount too, which is our initial fetch.
  useEffect(() => {
    fetchRecipes(true);
  }, [sourceFilter]);

  // Infinite scroll: fetch the next page once the sentinel below the grid is visible.
  useEffect(() => {
    if (isStatic || !hasMore) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchRecipes(false);
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, recipes.length, sourceFilter]);

  useEffect(() => {
    if (!loading && recipes.length > 0) {
      restoreScrollPosition()
    }
  },
    [loading, recipes.length]
  )

  // Filter recipes whenever filters or recipes change
  useEffect(() => {
    let filtered = [...recipes];

    // Apply component filter
    if (componentFilter === 'components') {
      filtered = filtered.filter(recipe => recipe.component === true);
    } else if (componentFilter === 'dishes') {
      filtered = filtered.filter(recipe => recipe.component !== true);
    }

    // Apply tag filter
    if (tagFilter.trim()) {
      const searchTerm = tagFilter.toLowerCase().trim();
      filtered = filtered.filter(recipe => {
        // Search in categories
        const categoryMatch = recipe.categories?.some(category =>
          category.name.toLowerCase().includes(searchTerm)
        ) || false;

        // Also search in title and description for broader matching
        const titleMatch = recipe.title.toLowerCase().includes(searchTerm);
        const descriptionMatch = recipe.description?.toLowerCase().includes(searchTerm) || false;

        return categoryMatch || titleMatch || descriptionMatch;
      });
    }

    // Apply time-to-make filter (prep + cook time)
    if (timeFilter !== 'all') {
      filtered = filtered.filter(recipe => {
        const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
        return totalTime > 0 && totalTime <= timeFilter;
      });
    }

    // Apply source filter (server already filtered by source in live mode —
    // this is what actually does the filtering in static mode)
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(recipe =>
        sourceFilter === 'local' ? !recipe.source : recipe.source === sourceFilter
      );
    }

    // Stable sort: recipes with images first, preserve relative order within each group
    filtered.sort((a, b) => {
      const aHasImage = (a.images && a.images.length > 0) ? 0 : 1;
      const bHasImage = (b.images && b.images.length > 0) ? 0 : 1;
      return aHasImage - bHasImage;
    });

    setFilteredRecipes(filtered);
  }, [recipes, componentFilter, tagFilter, timeFilter, sourceFilter]);

  const handleComponentFilterChange = () => {
    if (componentFilter === 'all') {
      setComponentFilter('dishes');
    } else if (componentFilter === 'dishes') {
      setComponentFilter('components');
    } else {
      setComponentFilter('all');
    }
  };

  const getComponentFilterLabel = () => {
    switch (componentFilter) {
      case 'all': return 'All Recipes';
      case 'dishes': return 'Full Dishes Only';
      case 'components': return 'Components Only';
      default: return 'All Recipes';
    }
  };



  const renderFilterBar = () => (
    <Flex gap={6} wrap="wrap" align="center">
      <Box>
        <HStack>
          <Box
            as="button"
            onClick={handleComponentFilterChange}
            display="flex"
            alignItems="center"
            gap={2}
            p={2}
            borderRadius="md"
            bg="bg"
            _hover={{ bg: "gray.100" }}
            cursor="pointer"
          >
            <Box
              w={4}
              h={4}
              border="2px solid"
              borderColor={componentFilter === 'components' ? "blue.500" : "gray.300"}
              borderRadius="sm"
              bg={componentFilter === 'components' ? "blue.500" : "bg"}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {componentFilter === 'components' && (
                <Box w={2} h={2} bg="bg" borderRadius="xs" />
              )}
              {componentFilter === 'all' && (
                <Box w={2} h={1} bg="gray.600" />
              )}
            </Box>
            <Text fontSize="sm">{getComponentFilterLabel()}</Text>
          </Box>
        </HStack>
      </Box>

      <Box flex="1" minW="200px">
        <Input
          placeholder="Filter by tags, title, or description..."
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          bg="bg"
        />
      </Box>

      <Box>
        <Text fontSize="xs" color="gray.500" mb={1}>Time to make</Text>
        <HStack gap={2} flexWrap="wrap">
          <FilterChip label="Any time" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')} />
          <FilterChip label="Under 30 min" active={timeFilter === 30} onClick={() => setTimeFilter(30)} />
          <FilterChip label="Under 60 min" active={timeFilter === 60} onClick={() => setTimeFilter(60)} />
          <FilterChip label="Under 90 min" active={timeFilter === 90} onClick={() => setTimeFilter(90)} />
        </HStack>
      </Box>

      <Box>
        <Text fontSize="xs" color="gray.500" mb={1}>Source</Text>
        <HStack gap={2} flexWrap="wrap">
          <FilterChip label="All" active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')} count={sourceOptions.total} />
          {sourceOptions.localCount > 0 && (
            <FilterChip
              label="Local"
              active={sourceFilter === 'local'}
              onClick={() => setSourceFilter('local')}
              count={sourceOptions.localCount}
            />
          )}
          {sourceOptions.sources.map(([source, count]) => (
            <FilterChip
              key={source}
              label={sourceDisplayName(source)}
              active={sourceFilter === source}
              onClick={() => setSourceFilter(source)}
              count={count}
            />
          ))}
        </HStack>
      </Box>
    </Flex>
  );

  const restoreScrollPosition = () => {
    const saved = sessionStorage.getItem(`scroll_recipe`);
    let coord = { x: 0, y: 0 };

    if (saved) {
      coord = JSON.parse(saved)
    }
    window.scrollTo(coord.x, coord.y);
  }



  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Loading recipes...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box py={6}>
        <Box p={4} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400" mb={4}>
          <Text fontWeight="medium" color="red.800" mb={1}>Error</Text>
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
        <Button onClick={fetchRecipes} colorScheme="blue">
          Try Again
        </Button>
      </Box>
    );
  }

  if (recipes.length === 0) {
    return (
      <Box textAlign="center" py={10}>
        <Text fontSize="lg" color="gray.600" mb={4}>
          {isStatic ? 'No recipes available in this static version.' : 'No recipes found. Create your first recipe!'}
        </Text>
        {!isStatic && (
          <Button colorScheme="blue" onClick={() => navigate('/create')}>
            Create Recipe
          </Button>
        )}
      </Box>
    );
  }

  if (filteredRecipes.length === 0 && recipes.length > 0) {
    return (
      <Box py={6}>
        <VStack gap={6} align="stretch">
          {/* Filter Controls */}
          <Box p={4} bg="bg" borderRadius="md">
            <Text fontSize="lg" fontWeight="semibold" mb={3}>Filters</Text>
            {renderFilterBar()}
          </Box>

          <Box textAlign="center" py={10}>
            <Text fontSize="lg" color="gray.600" mb={4}>
              No recipes match your current filters.
            </Text>
            <Button
              onClick={() => {
                setComponentFilter('all');
                setTagFilter('');
                setTimeFilter('all');
                setSourceFilter('all');
              }}
              colorScheme="blue"
              variant="outline"
            >
              Clear Filters
            </Button>
          </Box>
        </VStack>
      </Box>
    );
  }

  return (
    <Box py={6}>
      <VStack gap={6} align="stretch">
        {/* Static Mode Notice */}
        {isStatic && (
          <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontWeight="medium" color="blue.800" mb={1}>
              📖 Static Recipe Collection
            </Text>
            <Text fontSize="sm" color="blue.700">
              You're viewing a read-only collection of recipes. Creating new recipes is not available in this version.
            </Text>
          </Box>
        )}

        <Box>
          <HStack justify="space-between" width="100%">
            <HStack width="100%">
              <Text fontSize="3xl" fontWeight="bold" mb={2}>
                Recipes

              </Text>
              <Text fontSize="lg" color="gray.600">
                {filteredRecipes.length} of {recipes.length} loaded
                {hasMore && !isStatic ? ' · scroll for more' : ''}
              </Text>
            </HStack>
            {!isStatic && (
              <Button colorScheme="blue" onClick={() => navigate('/create')}>
                Create New Recipe
              </Button>
            )}
          </HStack>

          <HStack justify="space-between" width="100%">
            {/* Filter Controls */}
            <Box bg="bg" borderRadius="md" width="100%">
              {renderFilterBar()}
            </Box>
          </HStack>
        </Box>

        <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5, '2xl': 6 }} gap={4}>
          {filteredRecipes.map((recipe) => (
            <RouterLink
              to={`/recipes/${recipe.id}`}
              onClick={() => {
                // Save scroll position before navigating
                sessionStorage.setItem('scroll_recipe', JSON.stringify({ x: window.scrollX, y: window.scrollY }));
              }}
            >
              <Box
                key={recipe.id}
                borderWidth="1px"
                borderRadius="lg"
                overflow="hidden"
                bg="bg"
                shadow="sm"
                _hover={{
                  shadow: "lg",
                  transform: "translateY(-2px)",
                  transition: "all 0.2s"
                }}
                cursor="pointer"
                transition="all 0.2s"
                maxW="100%"
                h="100%"
              >
                {/* Recipe Image - Square */}
                <Box position="relative" width="100%" paddingBottom="100%" overflow="hidden">
                  {recipe.images && recipe.images.length > 0 ? (
                    <Image
                      src={imagePath(recipe.images[0])}
                      alt={recipe.title}
                      position="absolute"
                      top="0"
                      left="0"
                      width="100%"
                      height="100%"
                      objectFit="cover"
                    />
                  ) : (
                    <Box
                      position="absolute"
                      top="0"
                      left="0"
                      width="100%"
                      height="100%"
                      bg="var(--surface-muted)"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color="var(--empty-text)" fontSize="sm" textAlign="center">
                        No image
                      </Text>
                    </Box>
                  )}
                </Box>

                {/* Recipe Details */}
                <Box p={4}>
                  <VStack align="stretch" gap={3}>
                    {/* Recipe Title */}
                    <Heading size="md">
                      {recipe.title}
                    </Heading>

                    {/* Recipe Description */}
                    {recipe.description && (
                      <Text fontSize="sm" color="gray.600" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {recipe.description}
                      </Text>
                    )}

                    {/* Recipe Stats */}
                    <HStack gap={3} fontSize="sm" color="gray.500" flexWrap="wrap">
                      {recipe.prep_time && (
                        <Badge colorScheme="blue" variant="subtle">
                          Prep: {recipe.prep_time}min
                        </Badge>
                      )}
                      {recipe.cook_time && (
                        <Badge colorScheme="green" variant="subtle">
                          Cook: {recipe.cook_time}min
                        </Badge>
                      )}
                      {recipe.servings && (
                        <Badge colorScheme="purple" variant="subtle">
                          Serves: {recipe.servings}
                        </Badge>
                      )}
                    </HStack>

                    {/* Categories */}
                    {recipe.categories && recipe.categories.length > 0 && (
                      <HStack gap={2} flexWrap="wrap">
                        {recipe.categories.slice(0, 3).map((category) => (
                          <Badge key={category.id} colorScheme="gray" variant="outline" fontSize="xs">
                            {category.name}
                          </Badge>
                        ))}
                        {recipe.categories.length > 3 && (
                          <Badge colorScheme="gray" variant="outline" fontSize="xs">
                            +{recipe.categories.length - 3} more
                          </Badge>
                        )}
                      </HStack>
                    )}
                  </VStack>
                </Box>
              </Box>
            </RouterLink>
          ))}
        </SimpleGrid>

        {!isStatic && hasMore && (
          <Box ref={loadMoreRef} textAlign="center" py={4}>
            <Spinner size="md" />
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default RecipeList;