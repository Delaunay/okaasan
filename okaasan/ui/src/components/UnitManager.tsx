import React, { useState, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Heading,
    Spinner,
    SimpleGrid,
    Button,
    Input,
    Badge
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';
import type { UnitsUsedInRecipes, Ingredient } from '../services/type';

const UnitManager: React.FC = () => {
    const [unitsData, setUnitsData] = useState<UnitsUsedInRecipes | null>(null);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        from_unit: '',
        to_unit: '',
        conversion_factor: '',
        ingredient_id: '',
        category: 'custom'
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                const [unitsResponse, ingredientsResponse] = await Promise.all([
                    recipeAPI.getUnitsUsedInRecipes(),
                    recipeAPI.getIngredients()
                ]);

                setUnitsData(unitsResponse);
                setIngredients(ingredientsResponse);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch units data');
                console.error('Failed to fetch units data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleCreateConversion = async () => {
        try {
            setCreating(true);
            setError(null);

            const conversionData = {
                from_unit: formData.from_unit,
                to_unit: formData.to_unit,
                conversion_factor: parseFloat(formData.conversion_factor),
                category: formData.category,
                ingredient_id: formData.ingredient_id ? parseInt(formData.ingredient_id) : undefined
            };

            await recipeAPI.createUnitConversion(conversionData);

            setSuccessMessage(`Successfully created conversion from ${formData.from_unit} to ${formData.to_unit}`);

            // Reset form
            setFormData({
                from_unit: '',
                to_unit: '',
                conversion_factor: '',
                ingredient_id: '',
                category: 'custom'
            });

            setShowCreateForm(false);

            // Clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create conversion');
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <Box textAlign="center" py={10}>
                <Spinner size="xl" />
                <Text mt={4}>Loading units data...</Text>
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
            </Box>
        );
    }

    if (!unitsData) {
        return (
            <Box textAlign="center" py={10}>
                <Text fontSize="lg" color="gray.600">No units data available</Text>
            </Box>
        );
    }

    // Get all unique units for the form dropdowns
    const allUnits = Array.from(new Set([
        ...unitsData.all_available_units,
        ...unitsData.units_in_recipes
    ])).sort();

    return (
        <Box py={6}>
            <VStack gap={6} align="stretch" maxW="6xl" mx="auto">
                {/* Header */}
                <Box>
                    <HStack justify="space-between" align="center" mb={4}>
                        <Box>
                            <Heading size="lg" mb={2}>Unit Management</Heading>
                            <Text color="gray.600">
                                Manage units used across your recipes and create custom conversions
                            </Text>
                        </Box>
                        <Button
                            colorScheme="blue"
                            onClick={() => setShowCreateForm(!showCreateForm)}
                        >
                            {showCreateForm ? 'Hide Form' : 'Add Conversion'}
                        </Button>
                    </HStack>
                </Box>

                {/* Success Message */}
                {successMessage && (
                    <Box p={4} bg="green.50" borderRadius="md" borderLeft="4px solid" borderColor="green.400">
                        <Text fontWeight="medium" color="green.800">{successMessage}</Text>
                    </Box>
                )}

                {/* Create Conversion Form */}
                {showCreateForm && (
                    <Box p={6} bg="blue.50" borderRadius="lg" borderLeft="4px solid" borderColor="blue.400">
                        <Heading size="md" mb={4}>Create Unit Conversion</Heading>
                        <VStack gap={4} align="stretch">
                            <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
                                <Box>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>From Unit *</Text>
                                    <select
                                        value={formData.from_unit}
                                        onChange={(e) => setFormData({ ...formData, from_unit: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            backgroundColor: 'var(--chakra-colors-bg)',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="">Select source unit</option>
                                        {allUnits.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </Box>

                                <Box>
                                    <Text fontSize="sm" fontWeight="medium" mb={1}>To Unit *</Text>
                                    <select
                                        value={formData.to_unit}
                                        onChange={(e) => setFormData({ ...formData, to_unit: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            backgroundColor: 'var(--chakra-colors-bg)',
                                            fontSize: '14px'
                                        }}
                                    >
                                        <option value="">Select target unit</option>
                                        {allUnits.map(unit => (
                                            <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                    </select>
                                </Box>
                            </SimpleGrid>

                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={1}>Conversion Factor *</Text>
                                <Input
                                    type="number"
                                    step="any"
                                    value={formData.conversion_factor}
                                    onChange={(e) => setFormData({ ...formData, conversion_factor: e.target.value })}
                                    placeholder="e.g., 1000 (1 kg = 1000 g)"
                                    bg="bg"
                                />
                                <Text fontSize="xs" color="blue.600" mt={1}>
                                    How many {formData.to_unit || '[target unit]'} equal 1 {formData.from_unit || '[source unit]'}
                                </Text>
                            </Box>

                            <Box>
                                <Text fontSize="sm" fontWeight="medium" mb={1}>Ingredient (Optional)</Text>
                                <select
                                    value={formData.ingredient_id}
                                    onChange={(e) => setFormData({ ...formData, ingredient_id: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--chakra-colors-border)',
                                        backgroundColor: 'var(--chakra-colors-bg)',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="">General (applies to all ingredients)</option>
                                    {ingredients.map(ingredient => (
                                        <option key={ingredient.id} value={ingredient.id!.toString()}>
                                            {ingredient.name}
                                        </option>
                                    ))}
                                </select>
                                <Text fontSize="xs" color="blue.600" mt={1}>
                                    Leave empty for general conversions that apply to all ingredients
                                </Text>
                            </Box>

                            <HStack justify="flex-end" pt={2}>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowCreateForm(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    colorScheme="blue"
                                    onClick={handleCreateConversion}
                                    loading={creating}
                                    disabled={!formData.from_unit || !formData.to_unit || !formData.conversion_factor}
                                >
                                    Create Conversion
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                )}

                {/* Summary Stats */}
                <SimpleGrid columns={{ base: 1, md: 3 }} gap={6}>
                    <Box p={6} bg="blue.50" borderRadius="lg" borderLeft="4px solid" borderColor="blue.400">
                        <Text fontSize="2xl" fontWeight="bold" color="blue.800">
                            {unitsData.units_in_recipes.length}
                        </Text>
                        <Text fontSize="sm" color="blue.700">Units Used in Recipes</Text>
                    </Box>

                    <Box p={6} bg="green.50" borderRadius="lg" borderLeft="4px solid" borderColor="green.400">
                        <Text fontSize="2xl" fontWeight="bold" color="green.800">
                            {unitsData.all_available_units.length}
                        </Text>
                        <Text fontSize="sm" color="green.700">Total Available Units</Text>
                    </Box>

                    <Box p={6} bg="purple.50" borderRadius="lg" borderLeft="4px solid" borderColor="purple.400">
                        <Text fontSize="2xl" fontWeight="bold" color="purple.800">
                            {unitsData.total_recipe_ingredients}
                        </Text>
                        <Text fontSize="sm" color="purple.700">Recipe Ingredients</Text>
                    </Box>
                </SimpleGrid>

                {/* Units Used in Recipes */}
                <Box p={6} bg="gray.50" borderRadius="lg">
                    <Heading size="md" mb={4}>Units Currently Used in Recipes</Heading>
                    <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} gap={3}>
                        {unitsData.units_in_recipes.map(unit => (
                            <Box key={unit} p={3} bg="bg" borderRadius="md" shadow="sm">
                                <HStack justify="space-between">
                                    <Text fontWeight="medium">{unit}</Text>
                                    <Badge colorScheme="blue" variant="subtle">
                                        {unitsData.unit_usage_count[unit]}
                                    </Badge>
                                </HStack>
                            </Box>
                        ))}
                    </SimpleGrid>
                    {unitsData.units_in_recipes.length === 0 && (
                        <Text color="gray.500" textAlign="center" py={4}>
                            No units found in recipes
                        </Text>
                    )}
                </Box>

                {/* All Available Units */}
                <Box p={6} bg="orange.50" borderRadius="lg">
                    <Heading size="md" mb={4}>All Available Units (from conversions)</Heading>
                    <SimpleGrid columns={{ base: 3, md: 6, lg: 8 }} gap={2}>
                        {unitsData.all_available_units.map(unit => (
                            <Box key={unit} p={2} bg="bg" borderRadius="md" shadow="sm" textAlign="center">
                                <Text fontSize="sm" fontWeight="medium">{unit}</Text>
                            </Box>
                        ))}
                    </SimpleGrid>
                    {unitsData.all_available_units.length === 0 && (
                        <Text color="gray.500" textAlign="center" py={4}>
                            No conversion units found
                        </Text>
                    )}
                </Box>
            </VStack>
        </Box>
    );
};

export default UnitManager;