import React from 'react';
import {
    Box,
    Text,
    Spinner,
    VStack,
    HStack,
    Heading
} from '@chakra-ui/react';
import type { ConversionMatrix as ConversionMatrixType } from '../services/type';

interface ConversionMatrixProps {
    matrix: ConversionMatrixType | null;
    loading: boolean;
    error: string | null;
}

const ConversionMatrix: React.FC<ConversionMatrixProps> = ({ matrix, loading, error }) => {
    if (loading) {
        return (
            <Box textAlign="center" py={8}>
                <Spinner size="lg" color="blue.500" />
                <Text mt={2} color="gray.600">Loading conversion matrix...</Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Box p={4} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400">
                <Text fontWeight="medium" color="red.800" mb={1}>Failed to load conversion matrix</Text>
                <Text fontSize="sm" color="red.700">{error}</Text>
            </Box>
        );
    }

    if (!matrix || !matrix.conversions || Object.keys(matrix.conversions).length === 0) {
        return (
            <Box textAlign="center" py={8} bg="gray.50" borderRadius="lg">
                <Text fontSize="lg" color="gray.500" mb={2}>
                    No conversion data available
                </Text>
                <Text fontSize="sm" color="gray.400">
                    This ingredient doesn't have density information for volume-to-weight conversions.
                </Text>
            </Box>
        );
    }

    // Filter units to keep only the essential ones
    const filteredVolumeUnits = matrix.volume_units.filter(unit =>
        !['cl', 'l', 'cm3'].includes(unit) // Keep ml, exclude cl, l, cm3
    );
    const filteredWeightUnits = matrix.weight_units.filter(unit =>
        !['kg', 'mg'].includes(unit) // Keep g, exclude kg, mg
    );

    const formatValue = (value: number | null): string => {
        if (value === null || value === undefined) return '—';
        if (value === 0) return '0';
        if (value < 0.01) return value.toExponential(2);
        if (value < 1) return value.toFixed(4);
        if (value < 10) return value.toFixed(3);
        if (value < 100) return value.toFixed(2);
        return value.toFixed(1);
    };

    const getUnitDisplayName = (unit: string): string => {
        const unitNames: { [key: string]: string } = {
            'ml': 'Milliliter',
            'fl oz': 'Fluid ounce',
            'tbsp': 'Tablespoon',
            'tsp': 'Teaspoon',
            'cup': 'Cup',
            'pint': 'Pint',
            'quart': 'Quart',
            'gallon': 'Gallon',
            'g': 'Gram',
            'lb': 'Pound',
            'oz': 'Ounce'
        };
        return unitNames[unit] || unit;
    };

    return (
        <Box p={6} bg="orange.50" borderRadius="lg" borderLeft="4px solid" borderColor="orange.400">
            <VStack gap={4} align="stretch">
                <Box>
                    <HStack justify="space-between" align="center" mb={2}>
                        <Heading size="md" color="orange.800">
                            Conversion Matrix
                        </Heading>
                        <Text fontSize="xs" bg="orange.200" px={2} py={1} borderRadius="md" color="orange.800">
                            1 volume = ? weight
                        </Text>
                    </HStack>
                    <Text fontSize="sm" color="orange.700">
                        Shows how much weight you get from 1 unit of volume for <strong>{matrix.ingredient.name}</strong>
                        {matrix.ingredient.density && (
                            <> (density: {matrix.ingredient.density} g/ml)</>
                        )}
                    </Text>
                </Box>

                <Box overflowX="auto">
                    <table style={{ borderCollapse: 'collapse', backgroundColor: 'var(--chakra-colors-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'var(--chakra-colors-orange-200)' }}>
                                <th style={{
                                    padding: '12px',
                                    textAlign: 'left',
                                    fontWeight: 'bold',
                                    color: 'var(--chakra-colors-orange-700)',
                                    borderBottom: '2px solid var(--chakra-colors-orange-500)',
                                    minWidth: '120px'
                                }}>
                                </th>
                                {filteredWeightUnits.map(weightUnit => (
                                    <th key={weightUnit} style={{
                                        padding: '12px',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        color: 'var(--chakra-colors-orange-700)',
                                        borderBottom: '2px solid var(--chakra-colors-orange-500)',
                                        minWidth: '80px'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{weightUnit}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--chakra-colors-orange-600)', fontWeight: 'normal' }}>
                                                {getUnitDisplayName(weightUnit)}
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredVolumeUnits.map((volumeUnit, index) => (
                                <tr key={volumeUnit} style={{
                                    backgroundColor: index % 2 === 0 ? 'var(--chakra-colors-bg)' : 'var(--chakra-colors-orange-50)',
                                    transition: 'background-color 0.2s'
                                }}>
                                    <td style={{
                                        padding: '12px',
                                        fontWeight: 'medium',
                                        borderBottom: '1px solid var(--chakra-colors-orange-200)',
                                        borderRight: '2px solid var(--chakra-colors-orange-500)'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--chakra-colors-fg)' }}>
                                                {volumeUnit}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--chakra-colors-gray-500)' }}>
                                                {getUnitDisplayName(volumeUnit)}
                                            </div>
                                        </div>
                                    </td>
                                    {filteredWeightUnits.map(weightUnit => {
                                        const value = matrix.conversions[volumeUnit]?.[weightUnit];
                                        const isUnavailable = value === null || value === undefined;

                                        return (
                                            <td key={`${volumeUnit}-${weightUnit}`} style={{
                                                padding: '12px',
                                                textAlign: 'center',
                                                borderBottom: '1px solid var(--chakra-colors-orange-200)'
                                            }}>
                                                <Text
                                                    fontSize="sm"
                                                    color={isUnavailable ? 'gray.400' : 'gray.800'}
                                                    fontFamily={isUnavailable ? 'inherit' : 'mono'}
                                                    fontWeight={isUnavailable ? 'normal' : 'medium'}
                                                >
                                                    {formatValue(value)}
                                                </Text>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Box>

                <Box fontSize="xs" color="orange.600" pt={2} borderTop="1px solid" borderColor="orange.200">
                    <Text>
                        <strong>How to read:</strong> Find your volume unit in the left column, then look across to find the equivalent weight.
                        For example, "1 cup = X grams" means 1 cup of {matrix.ingredient.name} weighs X grams.
                    </Text>
                </Box>
            </VStack>
        </Box>
    );
};

export default ConversionMatrix;