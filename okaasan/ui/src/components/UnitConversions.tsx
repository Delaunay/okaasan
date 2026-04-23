import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  Flex,
  Badge,
  IconButton,
  Input,
  SimpleGrid,
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { UnitConversion, Ingredient } from '../services/type';

// Simple icon components
const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

const AddIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const CancelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

// Custom toast-like notification
const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
  // Simple alert for now - could be replaced with a better notification system
  alert(`${type.toUpperCase()}: ${message}`);
};

interface UnitConversionsProps {
  isAuthorized?: boolean;
}

const UnitConversions = ({ isAuthorized = false }: UnitConversionsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterIngredient, setFilterIngredient] = useState('all');
  const isStatic = recipeAPI.isStaticMode();

  // Form state for creating/editing conversions
  const [formData, setFormData] = useState<Partial<UnitConversion>>({
    from_unit: '',
    to_unit: '',
    conversion_factor: 1,
    category: 'custom',
    ingredient_id: undefined,
  });

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  // Set ingredient filter from URL parameter
  useEffect(() => {
    const ingredientId = searchParams.get('ingredient');
    if (ingredientId && ingredientId !== 'null') {
      setFilterIngredient(ingredientId);
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [conversionsData, ingredientsData] = await Promise.all([
        recipeAPI.getUnitConversions(),
        recipeAPI.getIngredients()
      ]);
      setConversions(conversionsData);
      setIngredients(ingredientsData);
    } catch (err) {
      setError('Failed to load unit conversions');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (isStatic) return; // Prevent creating in static mode

    try {
      if (!formData.from_unit || !formData.to_unit || !formData.conversion_factor) {
        showNotification('Please fill in all required fields', 'error');
        return;
      }

      const newConversion = await recipeAPI.createUnitConversion({
        from_unit: formData.from_unit!,
        to_unit: formData.to_unit!,
        conversion_factor: formData.conversion_factor!,
        category: formData.category || 'custom',
        ingredient_id: formData.ingredient_id || undefined,
      });

      setConversions(prev => [...prev, newConversion]);
      setShowCreateForm(false);
      resetFormData();

      showNotification('Unit conversion created successfully');
    } catch (err) {
      showNotification('Failed to create unit conversion', 'error');
      console.error('Error creating conversion:', err);
    }
  };

  const handleUpdate = async (id: number, updatedData: Partial<UnitConversion>) => {
    if (isStatic) return; // Prevent updating in static mode

    try {
      const updatedConversion = await recipeAPI.updateUnitConversion(id, updatedData);
      setConversions(prev => prev.map(conv => conv.id === id ? updatedConversion : conv));
      setEditingId(null);

      showNotification('Unit conversion updated successfully');
    } catch (err) {
      showNotification('Failed to update unit conversion', 'error');
      console.error('Error updating conversion:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (isStatic) return; // Prevent deleting in static mode

    if (!window.confirm('Are you sure you want to delete this unit conversion?')) {
      return;
    }

    try {
      await recipeAPI.deleteUnitConversion(id);
      setConversions(prev => prev.filter(conv => conv.id !== id));

      showNotification('Unit conversion deleted successfully');
    } catch (err) {
      showNotification('Failed to delete unit conversion', 'error');
      console.error('Error deleting conversion:', err);
    }
  };

  const resetFormData = () => {
    setFormData({
      from_unit: '',
      to_unit: '',
      conversion_factor: 1,
      category: 'custom',
      ingredient_id: undefined,
    });
  };

  const startEdit = (conversion: UnitConversion) => {
    setEditingId(conversion.id!);
    setFormData(conversion);
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetFormData();
  };

  const saveEdit = async () => {
    if (editingId) {
      await handleUpdate(editingId, formData);
    }
  };

  // Get ingredient name by ID
  const getIngredientName = (ingredientId?: number) => {
    if (!ingredientId) return 'General';
    const ingredient = ingredients.find(ing => ing.id === ingredientId);
    return ingredient ? ingredient.name : `Unknown (ID: ${ingredientId})`;
  };

  // Get unique categories and ingredients for filtering
  const uniqueCategories = [...new Set(conversions.map(conv => conv.category))];
  const usedIngredientIds = [...new Set(conversions.map(conv => conv.ingredient_id).filter(Boolean))];

  // Include the currently selected ingredient in the dropdown even if it doesn't have conversions yet
  const availableIngredientIds = [...usedIngredientIds];
  const selectedIngredientId = parseInt(filterIngredient);
  if (!isNaN(selectedIngredientId) && !availableIngredientIds.includes(selectedIngredientId)) {
    availableIngredientIds.push(selectedIngredientId);
  }

  // Filter conversions based on search and filters
  const filteredConversions = conversions.filter(conversion => {
    const matchesSearch = !searchTerm ||
      conversion.from_unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conversion.to_unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getIngredientName(conversion.ingredient_id).toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = filterCategory === 'all' || conversion.category === filterCategory;

    const matchesIngredient = filterIngredient === 'all' ||
      (filterIngredient === 'general' && !conversion.ingredient_id) ||
      conversion.ingredient_id?.toString() === filterIngredient;

    return matchesSearch && matchesCategory && matchesIngredient;
  });

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Loading unit conversions...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4} bg="red.100" borderRadius="md" borderLeft="4px solid" borderColor="red.500">
        <Text color="red.800" fontWeight="medium">⚠️ {error}</Text>
      </Box>
    );
  }

  return (
    <Box maxW="6xl" mx="auto" p={6}>
      <VStack gap={6} align="stretch">
        {/* Static Mode Notice */}
        {isStatic && (
          <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontWeight="medium" color="blue.800" mb={1}>
              📖 Unit Conversions Reference
            </Text>
            <Text fontSize="sm" color="blue.700">
              You're viewing the unit conversions database in read-only mode. Creating or editing conversions is not available in this version.
            </Text>
          </Box>
        )}

        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
          <Box>
            <Text fontSize="2xl" fontWeight="bold">Unit Conversions</Text>
            <Text color="gray.600">
              {isStatic
                ? 'Browse unit conversion factors used in recipes'
                : 'Manage unit conversion factors for recipes'
              }
            </Text>
            {filterIngredient !== 'all' && filterIngredient !== 'general' && (
              <Text fontSize="sm" color="orange.600" mt={1}>
                Showing conversions for: <strong>{getIngredientName(parseInt(filterIngredient))}</strong>
              </Text>
            )}
          </Box>
          {isAuthorized && !isStatic && (
            <Button
              colorScheme="blue"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <AddIcon />
              <Text ml={2}>{showCreateForm ? 'Cancel' : 'Add Conversion'}</Text>
            </Button>
          )}
        </Flex>

        {/* Create Form */}
        {showCreateForm && !isStatic && (
          <Box p={4} bg="gray.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontWeight="medium" mb={4}>Add New Unit Conversion</Text>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1}>From Unit</Text>
                <Input
                  value={formData.from_unit || ''}
                  onChange={(e) => setFormData({ ...formData, from_unit: e.target.value })}
                  placeholder="e.g., cup"
                />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1}>To Unit</Text>
                <Input
                  value={formData.to_unit || ''}
                  onChange={(e) => setFormData({ ...formData, to_unit: e.target.value })}
                  placeholder="e.g., ml"
                />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1}>Conversion Factor</Text>
                <Input
                  type="number"
                  step="0.000001"
                  value={formData.conversion_factor || ''}
                  onChange={(e) => setFormData({ ...formData, conversion_factor: parseFloat(e.target.value) || 1 })}
                  placeholder="1.0"
                />
                <Text fontSize="xs" color="gray.600" mt={1}>
                  How many {formData.to_unit || 'to-units'} equal 1 {formData.from_unit || 'from-unit'}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1}>Category</Text>
                <Input
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="custom"
                />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={1}>Specific Ingredient (Optional)</Text>
                <select
                  value={formData.ingredient_id?.toString() || ''}
                  onChange={(e) => setFormData({ ...formData, ingredient_id: e.target.value ? parseInt(e.target.value) : undefined })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--chakra-colors-border)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: 'var(--chakra-colors-bg)',
                  }}
                >
                  <option value="">General (applies to all ingredients)</option>
                  {ingredients.map(ingredient => (
                    <option key={ingredient.id} value={ingredient.id!.toString()}>
                      {ingredient.name}
                    </option>
                  ))}
                </select>
                <Text fontSize="xs" color="gray.600" mt={1}>
                  Leave empty for general conversions that apply to all ingredients
                </Text>
              </Box>
            </SimpleGrid>
            <Box mt={3} p={3} bg="blue.50" borderRadius="md" borderLeft="2px solid" borderColor="blue.400">
              <Text fontSize="sm" color="blue.700">
                <strong>Note:</strong> The system will automatically detect if this is a volume or mass conversion based on the unit types you enter.
              </Text>
            </Box>
            <HStack gap={2} mt={4}>
              <Button colorScheme="blue" onClick={handleCreate}>
                Create Conversion
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </HStack>
          </Box>
        )}

        {/* Filters */}
        <Flex gap={4} wrap="wrap" align="center">
          <Box>
            <Input
              placeholder="Search conversions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              width="250px"
            />
          </Box>
          <Box>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                padding: '8px',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: '4px',
                fontSize: '14px',
                width: '150px'
              }}
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </Box>
          <Box>
            <select
              value={filterIngredient}
              onChange={(e) => {
                const newValue = e.target.value;
                setFilterIngredient(newValue);
                // Update URL parameter
                const newSearchParams = new URLSearchParams(searchParams);
                if (newValue === 'all') {
                  newSearchParams.delete('ingredient');
                } else {
                  newSearchParams.set('ingredient', newValue);
                }
                setSearchParams(newSearchParams);
              }}
              style={{
                padding: '8px',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: '4px',
                fontSize: '14px',
                width: '200px'
              }}
            >
              <option value="all">All Ingredients</option>
              <option value="general">General (No specific ingredient)</option>
              {availableIngredientIds.map(ingredientId => (
                <option key={ingredientId} value={ingredientId!.toString()}>
                  {getIngredientName(ingredientId)}
                </option>
              ))}
            </select>
          </Box>
          <Text fontSize="sm" color="gray.600">
            {filteredConversions.length} of {conversions.length} conversions
          </Text>
        </Flex>

        {/* Conversions Grid */}
        <VStack gap={3} align="stretch">
          {/* Header */}
          <SimpleGrid columns={{ base: 1, md: (isAuthorized && !isStatic) ? 7 : 6 }} gap={4} p={3} bg="gray.100" borderRadius="md" fontWeight="semibold" fontSize="sm">
            <Text>From Unit</Text>
            <Text>To Unit</Text>
            <Text>Conversion Factor</Text>
            <Text>Type</Text>
            <Text>Category</Text>
            <Text>Ingredient</Text>
            {isAuthorized && !isStatic && <Text>Actions</Text>}
          </SimpleGrid>

          {/* Conversions */}
          {filteredConversions.map((conversion) => (
            <SimpleGrid key={conversion.id} columns={{ base: 1, md: (isAuthorized && !isStatic) ? 7 : 6 }} gap={4} p={3} borderRadius="md" border="1px solid" borderColor="gray.200" alignItems="center">
              <Box>
                {editingId === conversion.id && !isStatic ? (
                  <Input
                    value={formData.from_unit || ''}
                    onChange={(e) => setFormData({ ...formData, from_unit: e.target.value })}
                    size="sm"
                  />
                ) : (
                  <Badge colorScheme="blue" variant="subtle">{conversion.from_unit}</Badge>
                )}
              </Box>
              <Box>
                {editingId === conversion.id && !isStatic ? (
                  <Input
                    value={formData.to_unit || ''}
                    onChange={(e) => setFormData({ ...formData, to_unit: e.target.value })}
                    size="sm"
                  />
                ) : (
                  <Badge colorScheme="green" variant="subtle">{conversion.to_unit}</Badge>
                )}
              </Box>
              <Box>
                {editingId === conversion.id && !isStatic ? (
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.conversion_factor || ''}
                    onChange={(e) => setFormData({ ...formData, conversion_factor: parseFloat(e.target.value) || 0 })}
                    size="sm"
                  />
                ) : (
                  <Text fontFamily="mono">{conversion.conversion_factor.toFixed(6)}</Text>
                )}
              </Box>
              <Box>
                <Badge
                  colorScheme={conversion.is_volume ? "blue" : "orange"}
                  variant="solid"
                  fontSize="xs"
                >
                  {conversion.is_volume ? "Volume" : "Mass"}
                </Badge>
              </Box>
              <Box>
                {editingId === conversion.id && !isStatic ? (
                  <Input
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    size="sm"
                  />
                ) : (
                  <Badge variant="outline">{conversion.category}</Badge>
                )}
              </Box>
              <Box>
                {editingId === conversion.id && !isStatic ? (
                  <select
                    value={formData.ingredient_id?.toString() || ''}
                    onChange={(e) => setFormData({ ...formData, ingredient_id: e.target.value ? parseInt(e.target.value) : undefined })}
                    style={{
                      width: '100%',
                      padding: '4px 8px',
                      border: '1px solid var(--chakra-colors-border)',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">General (No specific ingredient)</option>
                    {ingredients.map(ingredient => (
                      <option key={ingredient.id} value={ingredient.id!.toString()}>
                        {ingredient.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Text>{getIngredientName(conversion.ingredient_id)}</Text>
                )}
              </Box>
              {isAuthorized && !isStatic && (
                <HStack gap={1}>
                  {editingId === conversion.id ? (
                    <>
                      <IconButton
                        aria-label="Save"
                        size="sm"
                        colorScheme="green"
                        onClick={saveEdit}
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton
                        aria-label="Cancel"
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                      >
                        <CancelIcon />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        aria-label="Edit"
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(conversion)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        aria-label="Delete"
                        size="sm"
                        colorScheme="red"
                        variant="outline"
                        onClick={() => handleDelete(conversion.id!)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
                </HStack>
              )}
            </SimpleGrid>
          ))}
        </VStack>

        {filteredConversions.length === 0 && (
          <Box textAlign="center" py={10}>
            <Text color="gray.500">No unit conversions found matching your criteria.</Text>
          </Box>
        )}

        {/* Usage Information */}
        <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
          <Text fontWeight="medium" color="blue.800" mb={2}>How Unit Conversions Work:</Text>
          <VStack align="start" gap={1} fontSize="sm" color="blue.700">
            <Text>• <strong>Conversion Factor:</strong> Multiply the "from" unit by this number to get the "to" unit</Text>
            <Text>• <strong>Example:</strong> 1 cup = 236.588 ml, so conversion factor from cup to ml is 236.588</Text>
            <Text>• <strong>Type:</strong> Shows whether the conversion is for Volume units (blue) or Mass units (orange)</Text>
            <Text>• <strong>General conversions:</strong> Apply to all ingredients (e.g., ml to liter)</Text>
            <Text>• <strong>Ingredient-specific:</strong> Apply only to specific ingredients (e.g., flour density conversions)</Text>
            <Text>• <strong>Categories:</strong> Help organize conversions (e.g., "volume", "mass", "custom")</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default UnitConversions;