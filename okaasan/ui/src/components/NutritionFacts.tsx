import { useState, FC } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    SimpleGrid,
    Flex,
} from '@chakra-ui/react';
import type { IngredientComposition } from '../services/type';

// Icon components
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

const EditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

interface NutritionFactsProps {
    compositions: IngredientComposition[];
    entityId: number;
    editable?: boolean;
    onAdd?: (data: Omit<IngredientComposition, 'id' | 'ingredient_id'>) => Promise<void>;
    onEdit?: (id: number, data: Partial<IngredientComposition>) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
    onRefresh?: () => Promise<void>;
    onPushAll?: () => Promise<void>;
    availableSources?: string[];
    selectedSource?: string;
    onSourceChange?: (source: string) => void;
}

const NutritionFacts: FC<NutritionFactsProps> = ({
    compositions,
    entityId,
    editable = true,
    onAdd,
    onEdit,
    onDelete,
    onRefresh,
    onPushAll,
    availableSources,
    selectedSource,
    onSourceChange,
}) => {
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingValues, setEditingValues] = useState<Partial<IngredientComposition>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [referenceQuantity, setReferenceQuantity] = useState<number>(100);
    const [displayReferenceQuantity, setDisplayReferenceQuantity] = useState<number>(100);
    const [isEditingDisplayRef, setIsEditingDisplayRef] = useState(false);
    const [hoveredCategoryKind, setHoveredCategoryKind] = useState<string | null>(null);

    // We do not want to manually edit numbers from USDA, they are baselines
    // but we should be able to copy them to make our own
    const isReallyEditable = selectedSource == "USDA" ? false : editable;

    // Get unique sources from compositions or use provided sources
    let sources: string[] = availableSources || [];
    if (!availableSources) {
        sources = [...new Set(compositions.map(c => c.source).filter((s): s is string => Boolean(s)))];
    }

    // Calculate display multiplier for adjusting values
    const displayMultiplier = displayReferenceQuantity / 100;

    // Process compositions: group by kind and create virtual totals if needed
    const processedCompositions = (() => {
        if (compositions.length === 0) return [];

        // Group by kind
        const grouped = compositions.reduce((acc, comp) => {
            const kind = comp.kind || '_standalone';
            if (!acc[kind]) acc[kind] = [];
            acc[kind].push(comp);
            return acc;
        }, {} as Record<string, IngredientComposition[]>);

        const result: IngredientComposition[] = [];

        // Process each kind group
        Object.entries(grouped).forEach(([kind, items]) => {
            if (kind === '_standalone') {
                // Add standalone items (no kind) directly
                result.push(...items);
            } else {
                // Check if total exists (item with kind but no name)
                const hasTotal = items.some(item => !item.name);

                if (hasTotal) {
                    // Total exists, add items as is (sorted: total first, then subcategories)
                    result.push(...items);
                } else {
                    // No total exists, create virtual total
                    const subcategories = items.filter(item => item.name);

                    // Create virtual total (without computing quantity or daily value)
                    // Only show these if explicitly provided in DB
                    const virtualTotal: IngredientComposition = {
                        id: -1, // Virtual ID
                        ingredient_id: entityId,
                        kind: kind,
                        name: undefined,
                        quantity: undefined, // Don't compute - only show if explicitly in DB
                        unit: undefined,
                        daily_value: undefined, // Don't compute - only show if explicitly in DB
                    };

                    result.push(virtualTotal, ...subcategories);
                }
            }
        });

        return result;
    })();

    const handleStartAdd = (prefilledKind?: string) => {
        setIsAdding(true);
        setReferenceQuantity(displayReferenceQuantity); // Use current display reference
        setEditingValues({
            name: '',
            kind: prefilledKind || '',
            quantity: 0,
            unit: 'g',
            daily_value: 0,
        });
    };

    const handleCancelAdd = () => {
        setIsAdding(false);
        setEditingValues({});
    };

    const handleSaveNew = async () => {
        if (!onAdd) return;

        // Normalize quantity to per 100g if provided
        const normalizedQuantity = editingValues.quantity
            ? (editingValues.quantity * 100) / referenceQuantity
            : undefined;

        // Normalize daily_value to per 100g if provided
        const normalizedDailyValue = editingValues.daily_value
            ? (editingValues.daily_value * 100) / referenceQuantity
            : undefined;

        try {
            await onAdd({
                name: editingValues.name || '',
                kind: editingValues.kind,
                quantity: normalizedQuantity,
                unit: editingValues.unit || '',
                daily_value: normalizedDailyValue,
            });
            if (onRefresh) await onRefresh();
            setIsAdding(false);
            setEditingValues({});
            setReferenceQuantity(100);
            setSuccessMessage('Composition added successfully');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            alert(`Failed to add composition: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleStartEdit = (composition: IngredientComposition) => {
        setEditingId(composition.id!);
        setEditingValues({ ...composition });
        setReferenceQuantity(100); // Values in DB are already per 100g
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditingValues({});
    };

    const handleSaveEdit = async () => {
        if (!editingId || !onEdit) return;

        // Normalize quantity to per 100g
        const normalizedQuantity = editingValues.quantity
            ? (editingValues.quantity * 100) / referenceQuantity
            : editingValues.quantity;

        // Normalize daily_value to per 100g if provided
        const normalizedDailyValue = editingValues.daily_value
            ? (editingValues.daily_value * 100) / referenceQuantity
            : editingValues.daily_value;

        try {
            await onEdit(editingId, {
                ...editingValues,
                quantity: normalizedQuantity,
                daily_value: normalizedDailyValue,
            });
            if (onRefresh) await onRefresh();
            setEditingId(null);
            setEditingValues({});
            setReferenceQuantity(100);
            setSuccessMessage('Composition updated successfully');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            alert(`Failed to update composition: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleDelete = async (id: number) => {
        if (!onDelete) return;
        if (!window.confirm('Are you sure you want to delete this composition?')) {
            return;
        }

        try {
            await onDelete(id);
            if (onRefresh) await onRefresh();
            setSuccessMessage('Composition deleted successfully');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            alert(`Failed to delete composition: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleFieldChange = (field: keyof IngredientComposition, value: any) => {
        setEditingValues({ ...editingValues, [field]: value });
    };

    const pushNutritionFact = async () => {
        if (!onPushAll) return;

        try {
            await onPushAll();
            if (onRefresh) await onRefresh();
            setSuccessMessage('All compositions saved to database successfully');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            alert(`Failed to save compositions: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    return (
        <Box p={6} bg="bg" borderRadius="lg" border="2px solid" borderColor="gray.800">
            <Flex justify="space-between" align="center" mb={2} pb={2} borderBottom="4px solid" borderColor="gray.800">
                <VStack align="start" gap={0}>
                    <HStack>
                        <Text fontSize="2xl" fontWeight="bold" color="gray.800">
                            Nutrition Facts
                        </Text>
                        {sources && sources.length > 0 && (
                            <>
                                <Text fontSize="1xl" color="gray.800">(</Text>
                                <select
                                    value={selectedSource || (sources[0] || 'Default')}
                                    onChange={(e) => onSourceChange && onSourceChange(e.target.value)}
                                    style={{
                                        padding: '2px 8px',
                                        fontSize: '14px',
                                        border: '1px solid var(--chakra-colors-border)',
                                        borderRadius: '4px',
                                        backgroundColor: 'var(--chakra-colors-bg)',
                                        cursor: 'pointer',
                                        color: 'var(--chakra-colors-fg)',
                                    }}
                                >
                                    {sources.map((src) => (
                                        <option key={src} value={src}>
                                            {src}
                                        </option>
                                    ))}
                                </select>
                                <Text fontSize="1xl" color="gray.800">)</Text>
                            </>
                        )}
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="sm" color="gray.600">Per</Text>
                        {isEditingDisplayRef ? (
                            <input
                                type="number"
                                value={displayReferenceQuantity}
                                onChange={(e) => setDisplayReferenceQuantity(parseFloat(e.target.value) || 100)}
                                onBlur={() => setIsEditingDisplayRef(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setIsEditingDisplayRef(false);
                                    }
                                }}
                                autoFocus
                                style={{
                                    width: '60px',
                                    padding: '2px 4px',
                                    border: '1px solid var(--chakra-colors-blue-500)',
                                    borderRadius: '3px',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                }}
                            />
                        ) : (
                            <Text
                                fontSize="sm"
                                color="blue.600"
                                fontWeight="semibold"
                                cursor="pointer"
                                userSelect="none"
                                onClick={() => setIsEditingDisplayRef(true)}
                                _hover={{ textDecoration: 'underline' }}
                            >
                                {displayReferenceQuantity}g
                            </Text>
                        )}
                    </HStack>
                </VStack>
                <HStack gap={2}>
                    {isReallyEditable && !isAdding && onAdd && (
                        <Button
                            size="sm"
                            colorScheme="orange"
                            onClick={() => handleStartAdd()}
                        >
                            <AddIcon />
                            <Text ml={1}>Add</Text>
                        </Button>
                    )}
                    {onPushAll && (
                        <Button
                            size="sm"
                            colorScheme="green"
                            onClick={() => pushNutritionFact()}
                        >
                            <Text ml={1}>Save</Text>
                        </Button>
                    )}
                </HStack>
            </Flex>

            {/* Success Message */}
            {successMessage && (
                <Box p={3} mb={3} bg="green.100" borderRadius="md" borderLeft="4px solid" borderColor="green.500">
                    <Text fontSize="sm" color="green.800" fontWeight="medium">
                        ✓ {successMessage}
                    </Text>
                </Box>
            )}

            {/* Daily Value Header */}
            {processedCompositions.length > 0 && (
                <Flex justify="flex-end" py={2} borderTop="2px solid" borderBottom="1px solid" borderColor="gray.800">
                    <Text fontSize="xs" fontWeight="bold" color="gray.800">
                        % Daily Value*
                    </Text>
                </Flex>
            )}

            <VStack align="stretch" gap={0}>
                {/* Add new composition form - Nutrition Facts style */}
                {isAdding && (
                    <Box bg="yellow.50" border="2px solid" borderColor="orange.400" borderRadius="md" p={3} mb={2}>
                        <VStack align="stretch" gap={2}>
                            <Box mb={1} fontSize="xs">
                                <Text as="span" fontWeight="bold" color="orange.800">
                                    Add New Nutrient{' '}
                                </Text>
                                <Text as="span" color="gray.600">(Values per </Text>
                                <input
                                    type="number"
                                    value={referenceQuantity}
                                    onChange={(e) => setReferenceQuantity(parseFloat(e.target.value) || 100)}
                                    style={{
                                        width: '45px',
                                        padding: '2px 4px',
                                        border: '1px solid var(--chakra-colors-border)',
                                        borderRadius: '3px',
                                        fontSize: '12px',
                                        textAlign: 'center',
                                        marginLeft: '2px',
                                        marginRight: '2px',
                                    }}
                                />
                                <Text as="span" color="gray.600">g, will normalize to 100g)</Text>
                            </Box>

                            {/* Main row - nutrition facts style */}
                            <Flex gap={2} align="center">
                                <HStack flex={1} gap={2}>
                                    <input
                                        type="text"
                                        value={editingValues.kind || ''}
                                        onChange={(e) => handleFieldChange('kind', e.target.value)}
                                        placeholder="Kind (e.g., Fat)"
                                        style={{
                                            width: '100px',
                                            flex: '1',
                                            padding: '4px 8px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={editingValues.name || ''}
                                        onChange={(e) => handleFieldChange('name', e.target.value)}
                                        placeholder="Name (e.g., Saturated)"
                                        style={{
                                            width: '100px',
                                            flex: '1',
                                            padding: '4px 8px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            fontSize: '13px',
                                        }}
                                    />
                                    <input
                                        type="number"
                                        value={editingValues.quantity || ''}
                                        onChange={(e) => handleFieldChange('quantity', parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        step="0.01"
                                        style={{
                                            width: '40px',
                                            padding: '4px 8px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            fontSize: '14px',
                                            textAlign: 'right',
                                        }}
                                    />
                                    <input
                                        type="text"
                                        value={editingValues.unit || ''}
                                        onChange={(e) => handleFieldChange('unit', e.target.value)}
                                        placeholder="g"
                                        style={{
                                            width: '30px',
                                            padding: '4px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            fontSize: '13px',
                                        }}
                                    />
                                    <input
                                        type="number"
                                        value={editingValues.daily_value || ''}
                                        onChange={(e) => handleFieldChange('daily_value', parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        step="0.1"
                                        style={{
                                            width: '30px',
                                            padding: '4px 8px',
                                            border: '1px solid var(--chakra-colors-border)',
                                            borderRadius: '4px',
                                            fontSize: '14px',
                                            textAlign: 'right',
                                        }}
                                    />
                                    <Text fontSize="sm" fontWeight="bold" ml={-1}>%</Text>
                                </HStack>
                            </Flex>

                            <HStack justify="flex-end" gap={2}>
                                <Button size="xs" variant="outline" onClick={handleCancelAdd}>
                                    <CloseIcon />
                                    <Text ml={1}>Cancel</Text>
                                </Button>
                                <Button size="xs" colorScheme="green" onClick={handleSaveNew}>
                                    <CheckIcon />
                                    <Text ml={1}>Add</Text>
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                )}

                {/* Existing compositions */}
                {processedCompositions.length === 0 && !isAdding ? (
                    <Box textAlign="center" py={6} bg="bg" borderRadius="md">
                        <Text fontSize="sm" color="gray.500" mb={2}>
                            No nutritional composition data available
                        </Text>
                        {isReallyEditable && onAdd && (
                            <Text fontSize="xs" color="gray.400">
                                Click "Add" to insert nutritional information
                            </Text>
                        )}
                    </Box>
                ) : (
                    processedCompositions.map((composition, index) => {
                        const isEditing = editingId === composition.id;
                        const isVirtual = composition.id === -1; // Virtual total

                        return (
                            <Box
                                key={isVirtual ? `virtual-${index}` : composition.id}
                                bg={isEditing ? "gray.50" : "bg"}
                                border={isEditing ? "1px solid" : "none"}
                                borderColor={isEditing ? 'orange.300' : 'transparent'}
                                borderRadius={isEditing ? "md" : "none"}
                                p={isEditing ? 4 : 0}
                            >
                                {isEditing ? (
                                    <VStack align="stretch" gap={3}>
                                        <SimpleGrid columns={2} gap={3}>
                                            <Box>
                                                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                    Nutrient Name
                                                </Text>
                                                <input
                                                    type="text"
                                                    value={editingValues.name || ''}
                                                    onChange={(e) => handleFieldChange('name', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        border: '1px solid var(--chakra-colors-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '14px',
                                                    }}
                                                />
                                            </Box>
                                            <Box>
                                                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                    Kind
                                                </Text>
                                                <input
                                                    type="text"
                                                    value={editingValues.kind || ''}
                                                    onChange={(e) => handleFieldChange('kind', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        border: '1px solid var(--chakra-colors-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '14px',
                                                    }}
                                                />
                                            </Box>
                                        </SimpleGrid>

                                        <Box>
                                            <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                Reference Quantity (g)
                                            </Text>
                                            <HStack gap={2}>
                                                <input
                                                    type="number"
                                                    value={referenceQuantity}
                                                    onChange={(e) => setReferenceQuantity(parseFloat(e.target.value) || 100)}
                                                    placeholder="100"
                                                    step="1"
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        border: '1px solid var(--chakra-colors-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '14px',
                                                    }}
                                                />
                                                <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                                                    per {referenceQuantity}g
                                                </Text>
                                            </HStack>
                                            <Text fontSize="xs" color="gray.500" mt={1}>
                                                Values will be normalized to per 100g
                                            </Text>
                                        </Box>

                                        <SimpleGrid columns={2} gap={3}>
                                            <Box>
                                                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                    Quantity
                                                </Text>
                                                <input
                                                    type="number"
                                                    value={editingValues.quantity || ''}
                                                    onChange={(e) => handleFieldChange('quantity', parseFloat(e.target.value) || 0)}
                                                    step="0.01"
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        border: '1px solid var(--chakra-colors-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '14px',
                                                    }}
                                                />
                                            </Box>
                                            <Box>
                                                <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                    Unit
                                                </Text>
                                                <input
                                                    type="text"
                                                    value={editingValues.unit || ''}
                                                    onChange={(e) => handleFieldChange('unit', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        border: '1px solid var(--chakra-colors-border)',
                                                        borderRadius: '4px',
                                                        fontSize: '14px',
                                                    }}
                                                />
                                            </Box>
                                        </SimpleGrid>

                                        <Box>
                                            <Text fontSize="xs" fontWeight="medium" mb={1} color="gray.600">
                                                Daily Value (%)
                                            </Text>
                                            <input
                                                type="number"
                                                value={editingValues.daily_value || ''}
                                                onChange={(e) => handleFieldChange('daily_value', parseFloat(e.target.value) || 0)}
                                                placeholder="0"
                                                step="0.1"
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    border: '1px solid var(--chakra-colors-border)',
                                                    borderRadius: '4px',
                                                    fontSize: '14px',
                                                }}
                                            />
                                            <Text fontSize="xs" color="gray.500" mt={1}>
                                                % of recommended daily value per {referenceQuantity}g
                                            </Text>
                                        </Box>

                                        <HStack justify="space-between">
                                            <Button
                                                size="xs"
                                                colorScheme="red"
                                                variant="ghost"
                                                onClick={() => handleDelete(composition.id!)}
                                            >
                                                <DeleteIcon />
                                            </Button>
                                            <HStack gap={2}>
                                                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                                    <CloseIcon />
                                                    <Text ml={1}>Cancel</Text>
                                                </Button>
                                                <Button size="sm" colorScheme="green" onClick={handleSaveEdit}>
                                                    <CheckIcon />
                                                    <Text ml={1}>Save</Text>
                                                </Button>
                                            </HStack>
                                        </HStack>
                                    </VStack>
                                ) : (
                                    <Box>
                                        {/* Display logic:
                                          - If has kind but no name: Main category (bold, total)
                                          - If has both kind and name: Subcategory (indented, name shown)
                                          - If has name but no kind: Standalone item
                                      */}
                                        {composition.kind && !composition.name ? (
                                            // Main category - bold, no indentation
                                            <Flex
                                                justify="space-between"
                                                align="center"
                                                py={2}
                                                borderBottom="2px solid"
                                                borderColor="gray.300"
                                                onMouseEnter={() => setHoveredCategoryKind(composition.kind || null)}
                                                onMouseLeave={() => setHoveredCategoryKind(null)}
                                                position="relative"
                                            >
                                                <HStack flex={1} gap={1}>
                                                    <Text fontWeight="bold" color="gray.800" fontSize="md">
                                                        {composition.kind}
                                                    </Text>
                                                    {composition.quantity && composition.unit && (
                                                        <Text fontWeight="bold" color="gray.800" fontSize="md">
                                                            {Number(composition.quantity * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}{composition.unit}
                                                        </Text>
                                                    )}
                                                </HStack>
                                                <HStack gap={2}>
                                                    {/* Show daily value only if explicitly provided in DB */}
                                                    {composition.daily_value && composition.daily_value > 0 && (
                                                        <Text fontWeight="bold" color="gray.800" fontSize="md">
                                                            {Number(composition.daily_value * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}%
                                                        </Text>
                                                    )}
                                                    {isReallyEditable && (
                                                        <HStack gap={1}>
                                                            {/* Add to category button */}
                                                            {hoveredCategoryKind === composition.kind && !isAdding && onAdd && (
                                                                <Button
                                                                    size="xs"
                                                                    colorScheme="green"
                                                                    variant="ghost"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleStartAdd(composition.kind);
                                                                    }}
                                                                    title={`Add item to ${composition.kind}`}
                                                                >
                                                                    <AddIcon />
                                                                </Button>
                                                            )}
                                                            {!isVirtual && (
                                                                <>
                                                                    {onEdit && (
                                                                        <Button
                                                                            size="xs"
                                                                            variant="ghost"
                                                                            onClick={() => handleStartEdit(composition)}
                                                                        >
                                                                            <EditIcon />
                                                                        </Button>
                                                                    )}
                                                                    {onDelete && (
                                                                        <Button
                                                                            size="xs"
                                                                            colorScheme="red"
                                                                            variant="ghost"
                                                                            onClick={() => handleDelete(composition.id!)}
                                                                        >
                                                                            <DeleteIcon />
                                                                        </Button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </HStack>
                                                    )}
                                                </HStack>
                                            </Flex>
                                        ) : composition.kind && composition.name ? (
                                            // Subcategory - indented, shows name
                                            <Flex
                                                justify="space-between"
                                                align="center"
                                                py={1}
                                                pl={6}
                                                borderBottom="1px solid"
                                                borderColor="gray.100"
                                            >
                                                <HStack flex={1} gap={2}>
                                                    <Text fontSize="sm" color="gray.700">
                                                        {composition.name}
                                                    </Text>
                                                    {composition.quantity && composition.unit && (
                                                        <Text fontSize="sm" color="gray.700">
                                                            {Number(composition.quantity * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}{composition.unit}
                                                        </Text>
                                                    )}
                                                </HStack>
                                                <HStack gap={2}>
                                                    {composition.daily_value && composition.daily_value > 0 && (
                                                        <Text fontSize="sm" color="gray.600">
                                                            {Number(composition.daily_value * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}%
                                                        </Text>
                                                    )}
                                                    {isReallyEditable && (
                                                        <HStack gap={1}>
                                                            {onEdit && (
                                                                <Button
                                                                    size="xs"
                                                                    variant="ghost"
                                                                    onClick={() => handleStartEdit(composition)}
                                                                >
                                                                    <EditIcon />
                                                                </Button>
                                                            )}
                                                            {onDelete && (
                                                                <Button
                                                                    size="xs"
                                                                    colorScheme="red"
                                                                    variant="ghost"
                                                                    onClick={() => handleDelete(composition.id!)}
                                                                >
                                                                    <DeleteIcon />
                                                                </Button>
                                                            )}
                                                        </HStack>
                                                    )}
                                                </HStack>
                                            </Flex>
                                        ) : (
                                            // Standalone item (name only, no kind)
                                            <Flex
                                                justify="space-between"
                                                align="center"
                                                py={2}
                                                borderBottom="1px solid"
                                                borderColor="gray.200"
                                            >
                                                <HStack flex={1} gap={2}>
                                                    <Text fontWeight="semibold" color="gray.800" fontSize="sm">
                                                        {composition.name || 'Nutrient'}
                                                    </Text>
                                                    {composition.quantity && composition.unit && (
                                                        <Text fontSize="sm" color="gray.800">
                                                            {Number(composition.quantity * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}{composition.unit}
                                                        </Text>
                                                    )}
                                                </HStack>
                                                <HStack gap={2}>
                                                    {composition.daily_value && composition.daily_value > 0 && (
                                                        <Text fontSize="sm" color="gray.600">
                                                            {Number(composition.daily_value * displayMultiplier).toFixed(2).replace(/\.?0+$/, '')}%
                                                        </Text>
                                                    )}
                                                    {isReallyEditable && (
                                                        <HStack gap={1}>
                                                            {onEdit && (
                                                                <Button
                                                                    size="xs"
                                                                    variant="ghost"
                                                                    onClick={() => handleStartEdit(composition)}
                                                                >
                                                                    <EditIcon />
                                                                </Button>
                                                            )}
                                                            {onDelete && (
                                                                <Button
                                                                    size="xs"
                                                                    colorScheme="red"
                                                                    variant="ghost"
                                                                    onClick={() => handleDelete(composition.id!)}
                                                                >
                                                                    <DeleteIcon />
                                                                </Button>
                                                            )}
                                                        </HStack>
                                                    )}
                                                </HStack>
                                            </Flex>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })
                )}
            </VStack>

            {/* Footer note */}
            {processedCompositions.length > 0 && (
                <Box mt={4} pt={3} borderTop="2px solid" borderColor="gray.800">
                    <Text fontSize="xs" color="gray.600">
                        * Percent Daily Values are based on a 2,000 calorie diet. Values shown per {displayReferenceQuantity}g.
                    </Text>
                </Box>
            )}
        </Box>
    );
};

export default NutritionFacts;

