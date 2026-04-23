import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Text } from '@chakra-ui/react';
import Recipe from './Recipe';
import { recipeAPI } from '../services/api';
import type { RecipeData } from '../services/type';

const CreateRecipe = () => {
  const navigate = useNavigate();
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStatic = recipeAPI.isStaticMode();

  // Redirect to recipes list if in static mode
  useEffect(() => {
    if (isStatic) {
      navigate('/recipes');
    } else {
      document.title = 'Create Recipe';
    }
  }, [isStatic, navigate]);

  const handleSaveRecipe = async (recipe: RecipeData) => {
    if (isStatic) return; // Prevent saving in static mode

    try {
      setLoading(true);
      setError(null);

      const savedRecipe = await recipeAPI.createRecipe(recipe);

      // Navigate to the newly created recipe
      navigate(`/recipes/${savedRecipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recipe');
      console.error('Failed to create recipe:', err);
    } finally {
      setLoading(false);
    }
  };

  // Show static mode notice while redirecting
  if (isStatic) {
    return (
      <Box py={6} textAlign="center">
        <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400" mb={4} maxW="2xl" mx="auto">
          <Text fontWeight="medium" color="blue.800" mb={2}>
            📖 Static Mode
          </Text>
          <Text fontSize="sm" color="blue.700">
            Creating new recipes is not available in the static version. Redirecting you to the recipes list...
          </Text>
        </Box>
        <Button onClick={() => navigate('/recipes')} colorScheme="blue">
          Go to Recipes
        </Button>
      </Box>
    );
  }

  return (
    <Box py={6}>
      <Button mb={4} onClick={() => navigate('/recipes')} variant="outline">
        ← Back to Recipes
      </Button>

      <Box mb={4}>
        <Text fontSize="3xl" fontWeight="bold" mb={2}>
          Create New Recipe
        </Text>
        <Text fontSize="lg" color="gray.600">
          Fill in the details below to create your new recipe
        </Text>
      </Box>

      {error && (
        <Box p={4} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400" mb={4}>
          <Text fontWeight="medium" color="red.800" mb={1}>Error</Text>
          <Text fontSize="sm" color="red.700">{error}</Text>
        </Box>
      )}

      <Recipe
        isAuthorized={true}
        onSave={handleSaveRecipe}
      />
    </Box>
  );
};

export default CreateRecipe;