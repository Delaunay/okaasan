import { useState, useEffect } from 'react';
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
import { recipeAPI, imagePath } from '../services/api';
import type { RecipeData } from '../services/type';

// Component filter states
type ComponentFilter = 'all' | 'components' | 'dishes';

const RecipeList = () => {
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<RecipeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>('dishes');
  const [tagFilter, setTagFilter] = useState<string>('');
  const navigate = useNavigate();
  const isStatic = recipeAPI.isStaticMode();

  useEffect(() => {
    fetchRecipes();
    document.title = 'All Recipes';
  }, []);

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

    setFilteredRecipes(filtered);
  }, [recipes, componentFilter, tagFilter]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedRecipes = await recipeAPI.getRecipes();
      setRecipes(fetchedRecipes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recipes');
      console.error('Failed to fetch recipes:', err);
    } finally {
      setLoading(false);
    }
  };

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
            </Flex>
          </Box>

          <Box textAlign="center" py={10}>
            <Text fontSize="lg" color="gray.600" mb={4}>
              No recipes match your current filters.
            </Text>
            <Button
              onClick={() => {
                setComponentFilter('all');
                setTagFilter('');
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
                {filteredRecipes.length} of {recipes.length}
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
                <Box flex="1">
                  <Input
                    placeholder="Filter"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    bg="bg"
                  />
                </Box>
              </Flex>
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
                      bg="gray.100"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text color="gray.500" fontSize="sm" textAlign="center">
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
      </VStack>
    </Box>
  );
};

export default RecipeList;