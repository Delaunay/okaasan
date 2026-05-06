import React from 'react';
import {
    Box,
    Text,
    Spinner,
    VStack,
    HStack,
    Heading
} from '@chakra-ui/react';
import type { ConversionMatrix as ConversionMatrixType } from '../../services/type';

interface ConversionMatrixProps {
    matrix: ConversionMatrixType | null;
    loading: boolean;
    error: string | null;
}

const ConversionMatrix: React.FC<ConversionMatrixProps> = ({ matrix, loading, error }) => {
    if (loading) {
        return (
            <Box textAlign="center" py={8}>
                <Spinner size="lg" />
                <Text mt={2} style={{ color: 'var(--muted-text)' }}>Loading conversion matrix...</Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Box p={4} borderRadius="md" borderLeft="4px solid" style={{ backgroundColor: 'var(--panel-red-bg)', borderColor: 'var(--panel-red-border)' }}>
                <Text fontWeight="medium" mb={1} style={{ color: 'var(--panel-red-heading)' }}>Failed to load conversion matrix</Text>
                <Text fontSize="sm" style={{ color: 'var(--panel-red-text)' }}>{error}</Text>
            </Box>
        );
    }

    if (!matrix || !matrix.conversions || Object.keys(matrix.conversions).length === 0) {
        return (
            <Box textAlign="center" py={8} borderRadius="lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                <Text fontSize="lg" mb={2} style={{ color: 'var(--muted-text)' }}>
                    No conversion data available
                </Text>
                <Text fontSize="sm" style={{ color: 'var(--empty-text)' }}>
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
        <Box p={6} borderRadius="lg" borderLeft="4px solid" style={{ backgroundColor: 'var(--panel-orange-bg)', borderColor: 'var(--panel-orange-border)' }}>
            <VStack gap={4} align="stretch">
                <Box>
                    <HStack justify="space-between" align="center" mb={2}>
                        <Heading size="md" style={{ color: 'var(--panel-orange-heading)' }}>
                            Conversion Matrix
                        </Heading>
                        <Text fontSize="xs" px={2} py={1} borderRadius="md" style={{ backgroundColor: 'var(--panel-orange-border)', color: 'var(--panel-orange-heading)' }}>
                            1 volume = ? weight
                        </Text>
                    </HStack>
                    <Text fontSize="sm" style={{ color: 'var(--panel-orange-text)' }}>
                        Shows how much weight you get from 1 unit of volume for <strong>{matrix.ingredient.name}</strong>
                        {matrix.ingredient.density && (
                            <> (density: {matrix.ingredient.density} g/ml)</>
                        )}
                    </Text>
                </Box>

                <Box overflowX="auto">
                    <table style={{ borderCollapse: 'collapse', backgroundColor: 'var(--card-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'var(--panel-orange-border)' }}>
                                <th style={{
                                    padding: '12px',
                                    textAlign: 'left',
                                    fontWeight: 'bold',
                                    color: 'var(--panel-orange-heading)',
                                    borderBottom: '2px solid var(--panel-orange-border)',
                                    minWidth: '120px'
                                }}>
                                </th>
                                {filteredWeightUnits.map(weightUnit => (
                                    <th key={weightUnit} style={{
                                        padding: '12px',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        color: 'var(--panel-orange-heading)',
                                        borderBottom: '2px solid var(--panel-orange-border)',
                                        minWidth: '80px'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{weightUnit}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--panel-orange-text)', fontWeight: 'normal' }}>
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
                                    backgroundColor: index % 2 === 0 ? 'var(--card-bg)' : 'var(--panel-orange-bg)',
                                    transition: 'background-color 0.2s'
                                }}>
                                    <td style={{
                                        padding: '12px',
                                        fontWeight: 'medium',
                                        borderBottom: '1px solid var(--border-color)',
                                        borderRight: '2px solid var(--panel-orange-border)'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--heading-color)' }}>
                                                {volumeUnit}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--muted-text)' }}>
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
                                                borderBottom: '1px solid var(--border-color)'
                                            }}>
                                                <Text
                                                    fontSize="sm"
                                                    fontFamily={isUnavailable ? 'inherit' : 'mono'}
                                                    fontWeight={isUnavailable ? 'normal' : 'medium'}
                                                    style={{ color: isUnavailable ? 'var(--empty-text)' : 'var(--heading-color)' }}
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

                <Box fontSize="xs" pt={2} borderTop="1px solid" style={{ color: 'var(--panel-orange-text)', borderColor: 'var(--border-color)' }}>
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