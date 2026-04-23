import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Spinner, Text, Button } from '@chakra-ui/react';
import Recipe from './Recipe';
import { recipeAPI } from '../services/api';
import type { RecipeData } from '../services/type';

const RecipeDetail = () => {
  const { identifier } = useParams<{ identifier?: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        setLoading(true);
        setError(null);

        let fetchedRecipe: RecipeData;

        if (identifier && !isNaN(Number(identifier))) {
          // Fetch by ID if identifier is a number
          fetchedRecipe = await recipeAPI.getRecipe(Number(identifier));
        } else if (identifier) {
          // Fetch by name if identifier is a string
          fetchedRecipe = await recipeAPI.getRecipeByName(identifier);
        } else {
          throw new Error('Invalid recipe identifier');
        }

        setRecipe(fetchedRecipe);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch recipe');
        console.error('Failed to fetch recipe:', err);
      } finally {
        setLoading(false);
      }
    };

    if (identifier) {
      fetchRecipe();
    }
  }, [identifier]);

  const handleSaveRecipe = async (updatedRecipe: RecipeData) => {
    try {
      setLoading(true);
      setError(null);

      if (updatedRecipe.id) {
        const savedRecipe = await recipeAPI.updateRecipe(updatedRecipe.id, updatedRecipe);
        setRecipe(savedRecipe);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
      console.error('Failed to save recipe:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    if (!window.confirm('Are you sure you want to delete this recipe?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await recipeAPI.deleteRecipe(recipeId);

      // Navigate back to recipes list after deletion
      navigate('/recipes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete recipe');
      console.error('Failed to delete recipe:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Loading recipe...</Text>
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
        <Button onClick={() => navigate('/recipes')} colorScheme="blue">
          Back to Recipes
        </Button>
      </Box>
    );
  }

  if (!recipe) {
    return (
      <Box textAlign="center" py={10}>
        <Text fontSize="lg" color="gray.600" mb={4}>
          Recipe not found
        </Text>
        <Button onClick={() => navigate('/recipes')} colorScheme="blue">
          Back to Recipes
        </Button>
      </Box>
    );
  }

  return (
    <Box py={6}>
      <Button mb={4} onClick={() => navigate('/recipes')} variant="outline">
        ← Back to Recipes
      </Button>

      <Recipe
        initialRecipe={recipe}
        isAuthorized={true}
        onSave={handleSaveRecipe}
        onDelete={handleDeleteRecipe}
      />
    </Box>
  );
};

export default RecipeDetail;