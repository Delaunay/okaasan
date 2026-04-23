import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Spinner, Text, Button, VStack, HStack, SimpleGrid, GridItem, Input, Textarea, Badge, IconButton } from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { Ingredient, ConversionMatrix } from '../services/type';
import ConversionMatrixComponent from './ConversionMatrix';
import IngredientUnitsManager from './IngredientUnitsManager';
import IngredientCompositionManager from './IngredientCompositionManager';

const IngredientDetail = () => {
  const { identifier } = useParams<{ identifier?: string }>();
  const navigate = useNavigate();
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [editedIngredient, setEditedIngredient] = useState<Ingredient | null>(null);
  const [conversionMatrix, setConversionMatrix] = useState<ConversionMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // USDA search state
  const [usdaSearchQuery, setUsdaSearchQuery] = useState('');
  const [usdaSuggestions, setUsdaSuggestions] = useState<Array<{ fdc_id: number, description: string, data_type: string }>>([]);
  const [showUsdaSuggestions, setShowUsdaSuggestions] = useState(false);
  const [isUsdaLoading, setIsUsdaLoading] = useState(false);
  const [isUsdaFocused, setIsUsdaFocused] = useState(false);
  const usdaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchIngredient = async () => {
      try {
        setLoading(true);
        setError(null);

        let fetchedIngredient: Ingredient;

        if (identifier && !isNaN(Number(identifier))) {
          // Fetch by ID if identifier is a number
          fetchedIngredient = await recipeAPI.getIngredient(Number(identifier));
        } else if (identifier) {
          // Fetch by name if identifier is a string
          fetchedIngredient = await recipeAPI.getIngredientByName(identifier);
        } else {
          throw new Error('Invalid ingredient identifier');
        }

        setIngredient(fetchedIngredient);
        setEditedIngredient(fetchedIngredient);

        // Fetch conversion matrix if we have an ingredient ID and density
        if (fetchedIngredient.id && fetchedIngredient.density) {
          try {
            setMatrixLoading(true);
            setMatrixError(null);
            const matrix = await recipeAPI.getIngredientConversionMatrix(fetchedIngredient.id);
            setConversionMatrix(matrix);
          } catch (matrixErr) {
            setMatrixError(matrixErr instanceof Error ? matrixErr.message : 'Failed to fetch conversion matrix');
            console.error('Failed to fetch conversion matrix:', matrixErr);
          } finally {
            setMatrixLoading(false);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch ingredient');
        console.error('Failed to fetch ingredient:', err);
      } finally {
        setLoading(false);
      }
    };

    if (identifier) {
      fetchIngredient();
    }
  }, [identifier]);

  const handleEdit = () => {
    setIsEditMode(true);
    setEditedIngredient(ingredient);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    setEditedIngredient(ingredient);
  };

  const handleSave = async () => {
    if (!editedIngredient || !editedIngredient.id) return;

    try {
      setIsSaving(true);
      setSaveMessage(null);
      const updated = await recipeAPI.updateIngredient(editedIngredient.id, editedIngredient);
      setIngredient(updated);
      setEditedIngredient(updated);
      setIsEditMode(false);
      setSaveMessage({ type: 'success', text: 'Ingredient updated successfully' });
      setTimeout(() => setSaveMessage(null), 5000);
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update ingredient'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (field: keyof Ingredient, value: any) => {
    if (!editedIngredient) return;
    setEditedIngredient({ ...editedIngredient, [field]: value });
  };

  const handleUnitChange = (unitType: string, value: string) => {
    if (!editedIngredient) return;
    setEditedIngredient({
      ...editedIngredient,
      unit: {
        ...editedIngredient.unit,
        [unitType]: value,
      },
    });
  };

  const handleExtensionValueChange = (key: string, value: string) => {
    if (!editedIngredient) return;
    const extension = editedIngredient.extension || {};
    setEditedIngredient({
      ...editedIngredient,
      extension: {
        ...extension,
        [key]: value,
      },
    });
  };

  const handleExtensionKeyChange = (oldKey: string, newKey: string) => {
    if (!editedIngredient || oldKey === newKey) return;
    const extension = { ...(editedIngredient.extension || {}) };
    const value = extension[oldKey];
    delete extension[oldKey];
    extension[newKey] = value;
    setEditedIngredient({
      ...editedIngredient,
      extension: extension,
    });
  };

  const handleExtensionDelete = (key: string) => {
    if (!editedIngredient) return;
    const extension = { ...(editedIngredient.extension || {}) };
    delete extension[key];
    setEditedIngredient({
      ...editedIngredient,
      extension: Object.keys(extension).length > 0 ? extension : undefined,
    });
  };

  const handleExtensionAdd = () => {
    if (!editedIngredient) return;
    const extension = editedIngredient.extension || {};
    let i = 1;
    let newKey = `property_${i}`;
    while (extension[newKey]) {
      i++;
      newKey = `property_${i}`;
    }
    setEditedIngredient({
      ...editedIngredient,
      extension: {
        ...extension,
        [newKey]: '',
      },
    });
  };

  // USDA search effect
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (isUsdaFocused && usdaSearchQuery.length >= 2) {
        setIsUsdaLoading(true);
        try {
          const results = await recipeAPI.searchUsdaFoods(usdaSearchQuery);
          setUsdaSuggestions(results);
          setShowUsdaSuggestions(true);
        } catch (error) {
          console.error('Error searching USDA foods:', error);
          setUsdaSuggestions([]);
        } finally {
          setIsUsdaLoading(false);
        }
      } else {
        setUsdaSuggestions([]);
        setShowUsdaSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [usdaSearchQuery, isUsdaFocused]);

  const handleUsdaSelect = (fdcId: number) => {
    setUsdaSearchQuery('');
    setShowUsdaSuggestions(false);
    handleFieldChange('fdc_id', fdcId);
  };

  const handleUsdaClear = () => {
    setUsdaSearchQuery('');
    handleFieldChange('fdc_id', null);
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Loading ingredient...</Text>
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
        <Button onClick={() => navigate('/ingredients')} colorScheme="blue">
          Back to Ingredients
        </Button>
      </Box>
    );
  }

  if (!ingredient) {
    return (
      <Box textAlign="center" py={10}>
        <Text fontSize="lg" color="gray.600" mb={4}>
          Ingredient not found
        </Text>
        <Button onClick={() => navigate('/ingredients')} colorScheme="blue">
          Back to Ingredients
        </Button>
      </Box>
    );
  }

  const displayIngredient = isEditMode ? editedIngredient : ingredient;

  return (
    <Box py={6}>
      <VStack align="stretch" mb={4} gap={2}>
        <HStack justify="space-between">
          <Button onClick={() => navigate('/ingredients')} variant="outline">
            ← Back to Ingredients
          </Button>
          <HStack>
            {!isEditMode ? (
              <Button onClick={handleEdit} colorScheme="blue">
                Edit
              </Button>
            ) : (
              <>
                <Button onClick={handleCancel} variant="outline" disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} colorScheme="green" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
          </HStack>
        </HStack>
        {saveMessage && (
          <Box
            p={3}
            bg={saveMessage.type === 'success' ? 'green.50' : 'red.50'}
            borderRadius="md"
            borderLeft="4px solid"
            borderColor={saveMessage.type === 'success' ? 'green.400' : 'red.400'}
          >
            <Text
              fontSize="sm"
              color={saveMessage.type === 'success' ? 'green.700' : 'red.700'}
            >
              {saveMessage.text}
            </Text>
          </Box>
        )}
      </VStack>

      <VStack gap={6} align="stretch" maxW="4xl" mx="auto">
        {/* Header */}
        <Box>
          {isEditMode ? (
            <Input
              fontSize="4xl"
              fontWeight="bold"
              mb={2}
              value={editedIngredient?.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              size="lg"
            />
          ) : (
            <Text fontSize="4xl" fontWeight="bold" mb={2}>
              {ingredient.name}
            </Text>
          )}
          <HStack gap={4} fontSize="sm" color="gray.500">
            <Text>ID: {ingredient.id}</Text>
            <Text>•</Text>
            <Text>Ingredient Details</Text>
          </HStack>
        </Box>

        {/* Properties */}
        <Box p={6} bg="blue.50" borderRadius="lg" borderLeft="4px solid" borderColor="blue.400">
          <Text fontSize="lg" fontWeight="semibold" mb={2} color="blue.800">
            Description
          </Text>
          {isEditMode ? (
            <Textarea
              value={editedIngredient?.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Enter description..."
              minH="100px"
            />
          ) : (
            <Text color="blue.700" lineHeight="1.6" fontSize="md">
              {displayIngredient?.description || 'No description'}
            </Text>
          )}
        </Box>

        {/* USDA Food Mapping */}
        {isEditMode && (
          <Box p={6} bg="orange.50" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
            <Text fontSize="lg" fontWeight="semibold" mb={3} color="orange.800">
              USDA Food Mapping
            </Text>
            <VStack align="stretch" gap={2}>
              <Box position="relative">
                <HStack gap={2}>
                  <Input
                    ref={usdaInputRef}
                    value={usdaSearchQuery}
                    onChange={(e) => setUsdaSearchQuery(e.target.value)}
                    onFocus={() => {
                      setIsUsdaFocused(true);
                      // Pre-fill with ingredient name if no search query
                      if (!usdaSearchQuery && editedIngredient?.name) {
                        setUsdaSearchQuery(editedIngredient.name);
                      }
                    }}
                    onBlur={() => {
                      setIsUsdaFocused(false);
                      setTimeout(() => setShowUsdaSuggestions(false), 150);
                    }}
                    placeholder="Search USDA foods..."
                    size="md"
                    flex={1}
                  />
                  {isUsdaLoading && (
                    <Spinner size="sm" />
                  )}
                  {editedIngredient?.fdc_id && (
                    <HStack gap={1}>
                      <Badge colorScheme="orange" fontSize="sm">
                        FDC: {editedIngredient.fdc_id}
                      </Badge>
                      <IconButton
                        size="sm"
                        aria-label="Clear USDA food"
                        onClick={handleUsdaClear}
                        variant="ghost"
                        colorScheme="red"
                      >
                        ✕
                      </IconButton>
                    </HStack>
                  )}
                </HStack>

                {showUsdaSuggestions && usdaSuggestions.length > 0 && (
                  <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    bg="bg"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    shadow="md"
                    zIndex={1000}
                    maxH="200px"
                    overflowY="auto"
                    mt={1}
                  >
                    {usdaSuggestions.map((food, index) => (
                      <Box
                        key={food.fdc_id}
                        p={2}
                        cursor="pointer"
                        _hover={{ bg: "gray.100" }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleUsdaSelect(food.fdc_id);
                        }}
                        borderBottom={index < usdaSuggestions.length - 1 ? "1px solid" : "none"}
                        borderColor="gray.100"
                      >
                        <VStack align="start" gap={0}>
                          <Text fontSize="sm">{food.description}</Text>
                          <HStack gap={2}>
                            <Badge colorScheme="orange" fontSize="xs">
                              {food.fdc_id}
                            </Badge>
                            <Text fontSize="xs" color="gray.500">
                              {food.data_type?.replace('_', ' ')}
                            </Text>
                          </HStack>
                        </VStack>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
              <Text fontSize="xs" color="orange.700">
                Link this ingredient to USDA FoodData Central for automatic nutritional information
              </Text>
            </VStack>
          </Box>
        )}

        {!isEditMode && displayIngredient?.fdc_id && (
          <Box p={4} bg="orange.50" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
            <HStack justify="space-between">
              <Text fontSize="sm" fontWeight="medium" color="orange.800">
                USDA Food Mapping
              </Text>
              <Badge colorScheme="orange" fontSize="sm">
                FDC ID: {displayIngredient.fdc_id}
              </Badge>
            </HStack>
          </Box>
        )}

        {/* Properties Grid */}
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
          {/* Nutritional Information */}
          <GridItem rowSpan={{ base: 1, md: 3 }}>
            <Box borderRadius="lg" borderColor="green.400">
              {/* Ingredient Composition Manager */}
              {ingredient?.id && (
                <IngredientCompositionManager
                  ingredientId={ingredient.id}
                  fdcId={ingredient.fdc_id}
                />
              )}
            </Box>
          </GridItem>

          <Box p={6} bg="purple.50" borderRadius="lg" borderLeft="4px solid" borderColor="purple.400">
            {/* Description */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4} color="purple.800">
                Properties
              </Text>
              <VStack align="stretch" gap={3}>
                {/* Density */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Density (g/ml):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editedIngredient?.density || ''}
                      onChange={(e) => handleFieldChange('density', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.density ? `${displayIngredient.density} g/ml` : 'Not specified'}
                    </Text>
                  )}
                </HStack>

                {/* Calories */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Calories (per 100g):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.1"
                      value={editedIngredient?.calories || ''}
                      onChange={(e) => handleFieldChange('calories', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.calories ? `${displayIngredient.calories} kcal` : 'Not specified'}
                    </Text>
                  )}
                </HStack>

                {/* Item Average Weight */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Avg Item Weight (g):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.1"
                      value={editedIngredient?.item_avg_weight || ''}
                      onChange={(e) => handleFieldChange('item_avg_weight', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.item_avg_weight ? `${displayIngredient.item_avg_weight} g` : 'Not specified'}
                    </Text>
                  )}
                </HStack>

                {/* Price Low */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Price (Low):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editedIngredient?.price_low || ''}
                      onChange={(e) => handleFieldChange('price_low', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.price_low ? `$${displayIngredient.price_low}` : 'Not specified'}
                    </Text>
                  )}
                </HStack>

                {/* Price Medium */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Price (Medium):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editedIngredient?.price_medium || ''}
                      onChange={(e) => handleFieldChange('price_medium', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.price_medium ? `$${displayIngredient.price_medium}` : 'Not specified'}
                    </Text>
                  )}
                </HStack>

                {/* Price High */}
                <HStack justify="space-between">
                  <Text fontSize="sm" color="purple.700" fontWeight="medium">
                    Price (High):
                  </Text>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={editedIngredient?.price_high || ''}
                      onChange={(e) => handleFieldChange('price_high', parseFloat(e.target.value) || null)}
                      size="sm"
                      w="150px"
                    />
                  ) : (
                    <Text fontSize="md" fontWeight="bold" color="purple.800">
                      {displayIngredient?.price_high ? `$${displayIngredient.price_high}` : 'Not specified'}
                    </Text>
                  )}
                </HStack>
              </VStack>
            </Box>
          </Box>

          {/* Custom Properties (Extension) */}
          {(isEditMode || (displayIngredient?.extension && Object.keys(displayIngredient.extension).length > 0)) && (
            <Box p={6} bg="teal.50" borderRadius="lg" borderLeft="4px solid" borderColor="teal.400">
              <HStack justify="space-between" mb={4}>
                <Text fontSize="lg" fontWeight="semibold" color="teal.800">
                  Custom Properties
                </Text>
                {isEditMode && (
                  <Button size="sm" colorScheme="teal" onClick={handleExtensionAdd}>
                    + Add Property
                  </Button>
                )}
              </HStack>

              {displayIngredient?.extension && Object.keys(displayIngredient.extension).length > 0 ? (
                <VStack align="stretch" gap={3}>
                  {Object.entries(displayIngredient.extension).map(([key, value]) => (
                    <HStack key={key} justify="space-between">
                      {isEditMode ? (
                        <>
                          <Input
                            defaultValue={key}
                            onBlur={(e) => {
                              const newKey = e.target.value.trim();
                              if (newKey && newKey !== key) {
                                handleExtensionKeyChange(key, newKey);
                              } else if (!newKey) {
                                // Reset to original if empty
                                e.target.value = key;
                              }
                            }}
                            placeholder="Property name"
                            size="sm"
                            flex="1"
                          />
                          <Input
                            value={String(value || '')}
                            onChange={(e) => handleExtensionValueChange(key, e.target.value)}
                            placeholder="Value"
                            size="sm"
                            flex="2"
                          />
                          <Button
                            size="sm"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleExtensionDelete(key)}
                          >
                            ×
                          </Button>
                        </>
                      ) : (
                        <>
                          <Text fontSize="sm" color="teal.700" fontWeight="medium">
                            {key}:
                          </Text>
                          <Text fontSize="md" color="teal.800">
                            {String(value)}
                          </Text>
                        </>
                      )}
                    </HStack>
                  ))}
                </VStack>
              ) : (
                <Text fontSize="sm" color="teal.600" fontStyle="italic">
                  No custom properties yet. Click "Add Property" to create one.
                </Text>
              )}
            </Box>
          )}

          <Box>


            {/* Unit Systems */}
            {(isEditMode || displayIngredient?.unit) && (
              <Box p={6} bg="orange.50" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
                <Text fontSize="lg" fontWeight="semibold" mb={4} color="orange.800">
                  Unit Systems
                </Text>
                <SimpleGrid columns={{ base: 1, md: 1 }} gap={4}>
                  {/* Metric */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      Metric:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.metric || ''}
                        onChange={(e) => handleUnitChange('metric', e.target.value)}
                        size="sm"
                        w="150px"
                        placeholder="e.g., kg, L"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.metric || 'Not specified'}
                      </Text>
                    )}
                  </HStack>

                  {/* US Customary */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      US Customary:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.us_customary || ''}
                        onChange={(e) => handleUnitChange('us_customary', e.target.value)}
                        size="sm"
                        w="150px"
                        placeholder="e.g., cup, oz"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.us_customary || 'Not specified'}
                      </Text>
                    )}
                  </HStack>

                  {/* US Legal */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      US Legal:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.us_legal || ''}
                        onChange={(e) => handleUnitChange('us_legal', e.target.value)}
                        size="sm"
                        w="150px"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.us_legal || 'Not specified'}
                      </Text>
                    )}
                  </HStack>

                  {/* Canada */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      Canada:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.canada || ''}
                        onChange={(e) => handleUnitChange('canada', e.target.value)}
                        size="sm"
                        w="150px"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.canada || 'Not specified'}
                      </Text>
                    )}
                  </HStack>

                  {/* Australia */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      Australia:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.australia || ''}
                        onChange={(e) => handleUnitChange('australia', e.target.value)}
                        size="sm"
                        w="150px"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.australia || 'Not specified'}
                      </Text>
                    )}
                  </HStack>

                  {/* UK */}
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="orange.700" fontWeight="medium">
                      UK:
                    </Text>
                    {isEditMode ? (
                      <Input
                        value={editedIngredient?.unit?.uk || ''}
                        onChange={(e) => handleUnitChange('uk', e.target.value)}
                        size="sm"
                        w="150px"
                      />
                    ) : (
                      <Text fontSize="md" color="orange.800">
                        {displayIngredient?.unit?.uk || 'Not specified'}
                      </Text>
                    )}
                  </HStack>
                </SimpleGrid>
              </Box>
            )}
          </Box>
        </SimpleGrid>


        {/* Conversion Matrix */}
        {ingredient?.density && (
          <ConversionMatrixComponent
            matrix={conversionMatrix}
            loading={matrixLoading}
            error={matrixError}
          />
        )}

        {/* Ingredient Units Manager */}
        {ingredient?.id && (
          <IngredientUnitsManager ingredientId={ingredient.id} />
        )}


        {/* Actions */}
        <Box pt={4} borderTop="1px solid" borderColor="gray.200">
          <HStack gap={3}>
            <Button onClick={() => navigate('/ingredients')} variant="outline">
              Back to All Ingredients
            </Button>
            {ingredient.id && (
              <Button
                onClick={() => navigate(`/conversions?ingredient=${ingredient.id}`)}
                colorScheme="orange"
                variant="outline"
              >
                View Unit Conversions
              </Button>
            )}
            <Button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              colorScheme="blue"
              variant="outline"
            >
              Copy Link
            </Button>
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default IngredientDetail;