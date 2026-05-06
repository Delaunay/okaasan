import React, { useState, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Heading,
    Spinner,
    Button,
    Input,
    Badge,
    SimpleGrid
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import type { IngredientUnitsUsed } from '../../services/type';

interface IngredientUnitsManagerProps {
    ingredientId: number;
}

const IngredientUnitsManager: React.FC<IngredientUnitsManagerProps> = ({ ingredientId }) => {
    const [unitsData, setUnitsData] = useState<IngredientUnitsUsed | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeConversion, setActiveConversion] = useState<string | null>(null);
    const [conversionData, setConversionData] = useState({
        to_unit: '',
        conversion_factor: ''
    });
    const [creating, setCreating] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchUnitsData = async () => {
            try {
                setLoading(true);
                setError(null);

                const data = await recipeAPI.getIngredientUnitsUsed(ingredientId);
                setUnitsData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch units data');
                console.error('Failed to fetch units data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchUnitsData();
    }, [ingredientId]);

    const handleCreateConversion = async (fromUnit: string) => {
        try {
            setCreating(true);
            setError(null);

            const conversionPayload = {
                from_unit: fromUnit,
                to_unit: conversionData.to_unit,
                conversion_factor: parseFloat(conversionData.conversion_factor),
                category: 'ingredient',
                ingredient_id: ingredientId
            };

            await recipeAPI.createUnitConversion(conversionPayload);

            setSuccessMessage(`Created conversion: 1 ${fromUnit} = ${conversionData.conversion_factor} ${conversionData.to_unit}`);

            // Reset form
            setConversionData({ to_unit: '', conversion_factor: '' });
            setActiveConversion(null);

            // Refresh data to show new conversion
            const refreshedData = await recipeAPI.getIngredientUnitsUsed(ingredientId);
            setUnitsData(refreshedData);

            // Clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create conversion');
        } finally {
            setCreating(false);
        }
    };

    const cancelConversion = () => {
        setActiveConversion(null);
        setConversionData({ to_unit: '', conversion_factor: '' });
    };

    if (loading) {
        return (
            <Box textAlign="center" py={6}>
                <Spinner size="md" />
                <Text mt={2} fontSize="sm" style={{ color: 'var(--muted-text)' }}>Loading units data...</Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Box p={4} borderRadius="md" borderLeft="4px solid" style={{ backgroundColor: 'var(--panel-red-bg)', borderColor: 'var(--panel-red-border)' }}>
                <Text fontWeight="medium" mb={1} style={{ color: 'var(--panel-red-heading)' }}>Error loading units</Text>
                <Text fontSize="sm" style={{ color: 'var(--panel-red-text)' }}>{error}</Text>
            </Box>
        );
    }

    if (!unitsData || unitsData.units_used.length === 0) {
        return (
            <Box textAlign="center" py={6} borderRadius="lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                <Text fontSize="md" mb={2} style={{ color: 'var(--muted-text)' }}>
                    No units used yet
                </Text>
                <Text fontSize="sm" style={{ color: 'var(--empty-text)' }}>
                    This ingredient hasn't been used in any recipes yet.
                </Text>
            </Box>
        );
    }

    return (
        <Box p={6} borderRadius="lg" borderLeft="4px solid" style={{ backgroundColor: 'var(--panel-green-bg)', borderColor: 'var(--panel-green-border)' }}>
            <VStack gap={4} align="stretch">
                <Box>
                    <Heading size="md" mb={2} style={{ color: 'var(--panel-green-heading)' }}>
                        Units Used for {unitsData.ingredient.name}
                    </Heading>
                    <Text fontSize="sm" style={{ color: 'var(--panel-green-text)' }}>
                        These are the units currently used for this ingredient across {unitsData.total_uses} recipe entries.
                        Add conversions to make unit switching easier.
                    </Text>
                </Box>

                {/* Success Message */}
                {successMessage && (
                    <Box p={3} borderRadius="md" border="1px solid" style={{ backgroundColor: 'var(--panel-green-accent-bg)', borderColor: 'var(--panel-green-accent-border)' }}>
                        <Text fontSize="sm" fontWeight="medium" style={{ color: 'var(--panel-green-heading)' }}>{successMessage}</Text>
                    </Box>
                )}

                {/* Units List */}
                <VStack gap={3} align="stretch">
                    {unitsData.units_used.map(unit => (
                        <Box key={unit} p={4} borderRadius="md" shadow="sm" style={{ backgroundColor: 'var(--card-bg-raised)', border: '1px solid var(--border-color)' }}>
                            <VStack gap={3} align="stretch">
                                {/* Unit Header */}
                                <HStack justify="space-between" align="center">
                                    <HStack>
                                        <Text fontSize="lg" fontWeight="bold" style={{ color: 'var(--heading-color)' }}>{unit}</Text>
                                        <Badge colorScheme="green" variant="subtle">
                                            {unitsData.unit_usage_count[unit]} uses
                                        </Badge>
                                    </HStack>

                                    {activeConversion !== unit && (
                                        <Button
                                            size="sm"
                                            colorScheme="blue"
                                            variant="outline"
                                            onClick={() => setActiveConversion(unit)}
                                        >
                                            Add Conversion
                                        </Button>
                                    )}
                                </HStack>

                                {/* Existing Conversions */}
                                {unitsData.existing_conversions[unit] && unitsData.existing_conversions[unit].length > 0 && (
                                    <Box>
                                        <Text fontSize="xs" mb={1} style={{ color: 'var(--muted-text)' }}>Existing conversions:</Text>
                                        <HStack wrap="wrap" gap={1}>
                                            {unitsData.existing_conversions[unit].map(toUnit => (
                                                <Badge key={toUnit} colorScheme="blue" variant="outline" fontSize="xs">
                                                    → {toUnit}
                                                </Badge>
                                            ))}
                                        </HStack>
                                    </Box>
                                )}

                                {/* Recipe Usage */}
                                <Box>
                                    <Text fontSize="xs" mb={1} style={{ color: 'var(--muted-text)' }}>Used in recipes:</Text>
                                    <Text fontSize="sm" style={{ color: 'var(--heading-color)' }}>
                                        {unitsData.recipe_names[unit]?.slice(0, 3).join(', ')}
                                        {unitsData.recipe_names[unit]?.length > 3 && ` (+${unitsData.recipe_names[unit].length - 3} more)`}
                                    </Text>
                                </Box>

                                {/* Conversion Form */}
                                {activeConversion === unit && (
                                    <Box p={3} borderRadius="md" border="1px solid" style={{ backgroundColor: 'var(--panel-blue-bg)', borderColor: 'var(--panel-blue-border)' }}>
                                        <VStack gap={3} align="stretch">
                                            <Text fontSize="sm" fontWeight="medium" style={{ color: 'var(--panel-blue-heading)' }}>
                                                Create conversion from {unit}
                                            </Text>

                                            <SimpleGrid columns={2} gap={3}>
                                                <Box>
                                                    <Text fontSize="xs" fontWeight="medium" mb={1}>To Unit</Text>
                                                    <select
                                                        value={conversionData.to_unit}
                                                        onChange={(e) => setConversionData({ ...conversionData, to_unit: e.target.value })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px 8px',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--border-color)',
                                                            backgroundColor: 'var(--input-bg)',
                                                            color: 'var(--heading-color)',
                                                            fontSize: '14px'
                                                        }}
                                                    >
                                                        <option value="">Select target unit</option>
                                                        {unitsData.all_available_units
                                                            .filter(u => u !== unit) // Don't convert to same unit
                                                            .map(availableUnit => (
                                                                <option key={availableUnit} value={availableUnit}>
                                                                    {availableUnit}
                                                                </option>
                                                            ))}
                                                    </select>
                                                </Box>

                                                <Box>
                                                    <Text fontSize="xs" fontWeight="medium" mb={1}>Factor</Text>
                                                    <Input
                                                        type="number"
                                                        step="any"
                                                        value={conversionData.conversion_factor}
                                                        onChange={(e) => setConversionData({ ...conversionData, conversion_factor: e.target.value })}
                                                        placeholder="e.g., 240"
                                                        size="sm"
                                                        bg="bg"
                                                    />
                                                </Box>
                                            </SimpleGrid>

                                            <Text fontSize="xs" style={{ color: 'var(--panel-blue-text)' }}>
                                                Example: If 1 {unit} = 240 ml, enter "240" and select "ml"
                                            </Text>

                                            <HStack justify="flex-end" gap={2}>
                                                <Button size="sm" variant="outline" onClick={cancelConversion}>
                                                    Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    colorScheme="blue"
                                                    onClick={() => handleCreateConversion(unit)}
                                                    loading={creating}
                                                    disabled={!conversionData.to_unit || !conversionData.conversion_factor}
                                                >
                                                    Create
                                                </Button>
                                            </HStack>
                                        </VStack>
                                    </Box>
                                )}
                            </VStack>
                        </Box>
                    ))}
                </VStack>
            </VStack>
        </Box>
    );
};

export default IngredientUnitsManager;