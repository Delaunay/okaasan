import { useState, useMemo, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Textarea,
    Heading,
    Badge,
    IconButton,
    Card,
    Input,
    Table,
    Spinner,
} from '@chakra-ui/react';
import { convert, getAvailableUnits } from '../utils/unit_cvt';
import { recipeAPI } from '../services/api';

interface ParsedIngredient {
    quantity: string;
    unit: string;
    ingredient: string;
    raw: string;
    ingredientId?: number; // For unit conversions
}

interface RecipeSource {
    id: string;
    name: string;
    ingredients: ParsedIngredient[];
    rawText: string;
}

interface IngredientRow {
    genericName: string; // The grouping key (lowercase by default, or user-renamed)
    sources: { [sourceId: string]: { quantity: string; unit: string; originalName: string }[] };
}

const DeleteIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
);

const RecipeComparison = () => {
    const [sources, setSources] = useState<RecipeSource[]>([]);
    const [currentInput, setCurrentInput] = useState('');
    const [currentSourceName, setCurrentSourceName] = useState('');
    const [availableUnits, setAvailableUnits] = useState<{ [key: string]: string[] }>({});
    const [selectedUnits, setSelectedUnits] = useState<{ [key: string]: string }>({});
    const [convertedQuantities, setConvertedQuantities] = useState<{ [key: string]: number }>({});
    const [convertingRows, setConvertingRows] = useState<Set<string>>(new Set());
    const [editingIngredient, setEditingIngredient] = useState<string | null>(null);
    const [ingredientRenames, setIngredientRenames] = useState<{ [normalized: string]: string }>({});

    // Parse ingredient text into structured data
    const parseIngredients = (text: string): ParsedIngredient[] => {
        const lines = text.split('\n').filter(line => line.trim());
        const ingredients: ParsedIngredient[] = [];

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Pattern to match: optional quantity, optional unit, ingredient name
            // Examples: "2 cups flour", "1/2 tablespoon sugar", "1 1/2 cups flour", "½ tsp salt", "salt", "500g beef"
            const patterns = [
                /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[\u00BC-\u00BE\u2150-\u215E]|[\u00BC-\u00BE\u2150-\u215E]|\d+\.?\d*)\s*([a-zA-Z]+)?\s+(.+)$/,  // quantity with unit and ingredient
                /^([a-zA-Z\s]+)$/,  // Just ingredient name
            ];

            let parsed = false;
            for (const pattern of patterns) {
                const match = line.match(pattern);
                if (match) {
                    if (match.length === 4) {
                        // Matched quantity + unit + ingredient
                        let ingredientName = match[3] || line;
                        // Remove "of" or "of the" from the beginning of ingredient name
                        ingredientName = ingredientName.replace(/^(of\s+(?:the\s+)?)/i, '');
                        ingredients.push({
                            quantity: match[1] || '',
                            unit: match[2] || '',
                            ingredient: ingredientName,
                            raw: line,
                        });
                        parsed = true;
                        break;
                    } else if (match.length === 2) {
                        // Just ingredient name
                        ingredients.push({
                            quantity: '',
                            unit: '',
                            ingredient: match[1],
                            raw: line,
                        });
                        parsed = true;
                        break;
                    }
                }
            }

            // If no pattern matched, treat whole line as ingredient
            if (!parsed) {
                ingredients.push({
                    quantity: '',
                    unit: '',
                    ingredient: line,
                    raw: line,
                });
            }
        });

        return ingredients;
    };

    // Create a normalized ingredient name for matching
    const normalizeIngredient = (name: string): string => {
        let normalized = name
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .trim();
        // Remove common prepositions from the beginning
        normalized = normalized.replace(/^(of|the)\s+/i, '');
        return normalized;
    };

    // Build the comparison table data
    const tableData = useMemo(() => {
        const ingredientMap = new Map<string, IngredientRow>();

        // Collect all ingredients, grouping by generic name
        sources.forEach(source => {
            source.ingredients.forEach(ing => {
                const normalized = normalizeIngredient(ing.ingredient);
                // Generic name is either user-defined or defaults to lowercase original
                const genericName = ingredientRenames[normalized] || ing.ingredient.toLowerCase().trim();

                if (!ingredientMap.has(genericName)) {
                    ingredientMap.set(genericName, {
                        genericName: genericName,
                        sources: {},
                    });
                }

                const row = ingredientMap.get(genericName)!;
                if (!row.sources[source.id]) {
                    row.sources[source.id] = [];
                }
                row.sources[source.id].push({
                    quantity: ing.quantity,
                    unit: ing.unit,
                    originalName: ing.ingredient,
                });
            });
        });

        return Array.from(ingredientMap.values()).sort((a, b) =>
            a.genericName.localeCompare(b.genericName)
        );
    }, [sources, ingredientRenames]);

    // Load available units for ingredients
    useEffect(() => {
        const loadAvailableUnits = async () => {
            const units: { [key: string]: string[] } = {};
            const selected: { [key: string]: string } = {};

            for (const row of tableData) {
                for (const [sourceId, items] of Object.entries(row.sources)) {
                    for (let idx = 0; idx < items.length; idx++) {
                        const item = items[idx];
                        const key = `${row.genericName}-${sourceId}-${idx}`;

                        try {
                            // Try to get ingredient ID from API by searching for the ingredient name
                            const ingredients = await recipeAPI.getIngredients();
                            const matchedIngredient = ingredients.find(
                                ing => ing.name.toLowerCase() === row.genericName.toLowerCase()
                            );

                            if (matchedIngredient?.id && item.unit) {
                                const available = await getAvailableUnits(item.unit, matchedIngredient.id);
                                units[key] = available;
                                selected[key] = item.unit; // Default to current unit
                            } else if (item.unit) {
                                const available = await getAvailableUnits(item.unit);
                                units[key] = available;
                                selected[key] = item.unit;
                            }
                        } catch (error) {
                            console.error('Error loading units:', error);
                            units[key] = [item.unit]; // Fallback to current unit
                            selected[key] = item.unit;
                        }
                    }
                }
            }

            setAvailableUnits(units);
            setSelectedUnits(selected);
        };

        if (tableData.length > 0) {
            loadAvailableUnits();
        }
    }, [tableData]);

    const handleUnitChange = async (
        genericName: string,
        sourceId: string,
        idx: number,
        originalUnit: string,
        newUnit: string,
        quantity: string,
        ingredientId?: number
    ) => {
        const key = `${genericName}-${sourceId}-${idx}`;

        if (originalUnit === newUnit) {
            // Same unit, no conversion needed
            setSelectedUnits(prev => ({ ...prev, [key]: newUnit }));
            setConvertedQuantities(prev => {
                const updated = { ...prev };
                delete updated[key];
                return updated;
            });
            return;
        }

        setConvertingRows(prev => new Set(prev).add(key));

        try {
            const qty = parseFloat(quantity) || 1;
            const convertedQty = await convert(qty, originalUnit, newUnit, ingredientId);

            setSelectedUnits(prev => ({ ...prev, [key]: newUnit }));
            setConvertedQuantities(prev => ({ ...prev, [key]: convertedQty }));
        } catch (error) {
            console.error('Error converting unit:', error);
            alert(`Failed to convert from ${originalUnit} to ${newUnit}`);
        } finally {
            setConvertingRows(prev => {
                const updated = new Set(prev);
                updated.delete(key);
                return updated;
            });
        }
    };

    const addSource = () => {
        if (!currentInput.trim()) return;

        const newSource: RecipeSource = {
            id: Date.now().toString(),
            name: currentSourceName.trim() || `Source ${sources.length + 1}`,
            ingredients: parseIngredients(currentInput),
            rawText: currentInput,
        };

        setSources([...sources, newSource]);
        setCurrentInput('');
        setCurrentSourceName('');
    };

    const removeSource = (id: string) => {
        setSources(sources.filter(s => s.id !== id));
    };

    const clearAll = () => {
        setSources([]);
        setIngredientRenames({});
    };

    const exportTable = () => {
        // Create CSV-like format
        const header = ['Ingredient', ...sources.map(s => s.name)].join('\t');
        const rows = tableData.map(row => {
            const cells = [
                row.genericName,
                ...sources.map(source => {
                    const dataArray = row.sources[source.id];
                    if (!dataArray || dataArray.length === 0) return '-';
                    return dataArray.map(data => {
                        const quantityUnit = `${data.quantity} ${data.unit}`.trim();
                        const showOriginal = data.originalName.toLowerCase() !== row.genericName.toLowerCase();
                        return showOriginal ? `${quantityUnit} (${data.originalName})` : quantityUnit;
                    }).join(', ');
                })
            ];
            return cells.join('\t');
        });

        const text = [header, ...rows].join('\n');
        navigator.clipboard.writeText(text);
        alert('Table copied to clipboard!');
    };

    return (
        <Box py={6}>
            <VStack gap={6} align="stretch">
                {/* Header */}
                <Box>
                    <Heading size="xl" mb={2}>Recipe Comparison</Heading>
                    <Text color="gray.600">
                        Paste recipes from multiple sources and compare ingredients side-by-side in a table.
                    </Text>
                </Box>

                {/* Input Section */}
                <Card.Root>
                    <Card.Body p={6}>
                        <VStack gap={4} align="stretch">
                            <Heading size="md">Add Recipe Source</Heading>
                            <Input
                                placeholder="Source name (e.g., 'Grandma's Recipe', 'AllRecipes.com')"
                                value={currentSourceName}
                                onChange={(e) => setCurrentSourceName(e.target.value)}
                            />
                            <Textarea
                                placeholder="Paste ingredients here, one per line&#10;Examples:&#10;2 cups flour&#10;1 tablespoon sugar&#10;500g beef&#10;salt"
                                value={currentInput}
                                onChange={(e) => setCurrentInput(e.target.value)}
                                minH="200px"
                                fontFamily="monospace"
                            />
                            <HStack justify="space-between">
                                <Button colorScheme="blue" onClick={addSource} disabled={!currentInput.trim()}>
                                    Add Source
                                </Button>
                                {sources.length > 0 && (
                                    <Button colorScheme="red" variant="outline" onClick={clearAll}>
                                        Clear All
                                    </Button>
                                )}
                            </HStack>
                        </VStack>
                    </Card.Body>
                </Card.Root>

                {/* Sources Overview */}
                {sources.length > 0 && (
                    <Box>
                        <HStack justify="space-between" mb={4}>
                            <Heading size="md">Recipe Sources ({sources.length})</Heading>
                        </HStack>
                        <HStack gap={3} wrap="wrap">
                            {sources.map(source => (
                                <Badge
                                    key={source.id}
                                    colorScheme="blue"
                                    fontSize="md"
                                    px={3}
                                    py={2}
                                    borderRadius="md"
                                    display="flex"
                                    alignItems="center"
                                    gap={2}
                                >
                                    {source.name}
                                    <Text fontSize="xs" color="blue.600">
                                        ({source.ingredients.length} ingredients)
                                    </Text>
                                    <IconButton
                                        aria-label="Remove source"
                                        onClick={() => removeSource(source.id)}
                                        size="xs"
                                        colorScheme="red"
                                        variant="ghost"
                                        ml={1}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </Badge>
                            ))}
                        </HStack>
                    </Box>
                )}

                {/* Comparison Table */}
                {sources.length > 0 && tableData.length > 0 && (
                    <Card.Root>
                        <Card.Body p={6}>
                            <VStack gap={4} align="stretch">
                                <HStack justify="space-between" flexWrap="wrap" gap={3}>
                                    <Box>
                                        <Heading size="md">Ingredient Comparison</Heading>
                                        <Text fontSize="xs" color="gray.600" mt={1}>
                                            Click ingredient names to rename them to a generic name
                                        </Text>
                                    </Box>
                                    <Button colorScheme="green" onClick={exportTable}>
                                        Copy Table
                                    </Button>
                                </HStack>

                                <Box overflowX="auto">
                                    <Table.Root variant="outline" size="sm">
                                        <Table.Header>
                                            <Table.Row bg="gray.100">
                                                <Table.ColumnHeader fontWeight="bold" minW="200px">
                                                    Ingredient
                                                </Table.ColumnHeader>
                                                {sources.map(source => (
                                                    <Table.ColumnHeader key={source.id} fontWeight="bold" minW="150px">
                                                        {source.name}
                                                    </Table.ColumnHeader>
                                                ))}
                                            </Table.Row>
                                        </Table.Header>
                                        <Table.Body>
                                            {tableData.map((row, idx) => {
                                                const isEditing = editingIngredient === row.genericName;

                                                return (
                                                    <Table.Row key={idx} _hover={{ bg: 'gray.50' }}>
                                                        <Table.Cell fontWeight="medium">
                                                            {isEditing ? (
                                                                <Input
                                                                    size="sm"
                                                                    defaultValue={row.genericName}
                                                                    autoFocus
                                                                    onBlur={(e) => {
                                                                        const newName = e.target.value.trim();
                                                                        if (newName && newName !== row.genericName) {
                                                                            // Find all normalized keys that currently map to this generic name
                                                                            const newRenames = { ...ingredientRenames };
                                                                            sources.forEach(source => {
                                                                                source.ingredients.forEach(ing => {
                                                                                    const normalized = normalizeIngredient(ing.ingredient);
                                                                                    const currentGeneric = ingredientRenames[normalized] || ing.ingredient.toLowerCase().trim();
                                                                                    if (currentGeneric === row.genericName) {
                                                                                        newRenames[normalized] = newName.toLowerCase();
                                                                                    }
                                                                                });
                                                                            });
                                                                            setIngredientRenames(newRenames);
                                                                        }
                                                                        setEditingIngredient(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.currentTarget.blur();
                                                                        } else if (e.key === 'Escape') {
                                                                            setEditingIngredient(null);
                                                                        }
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Text
                                                                    cursor="pointer"
                                                                    _hover={{ textDecoration: 'underline', color: 'blue.600' }}
                                                                    onClick={() => setEditingIngredient(row.genericName)}
                                                                >
                                                                    {row.genericName}
                                                                </Text>
                                                            )}
                                                        </Table.Cell>
                                                        {sources.map(source => {
                                                            const dataArray = row.sources[source.id];

                                                            return (
                                                                <Table.Cell key={source.id}>
                                                                    {dataArray && dataArray.length > 0 ? (
                                                                        <VStack align="start" gap={2}>
                                                                            {dataArray.map((data, dataIdx) => {
                                                                                const showOriginalName = data.originalName.toLowerCase() !== row.genericName.toLowerCase();
                                                                                const key = `${row.genericName}-${source.id}-${dataIdx}`;
                                                                                const selectedUnit = selectedUnits[key] || data.unit;
                                                                                const convertedQty = convertedQuantities[key];
                                                                                const isConverting = convertingRows.has(key);
                                                                                const units = availableUnits[key] || [data.unit];

                                                                                return (
                                                                                    <VStack key={dataIdx} align="start" gap={1} width="full">
                                                                                        <HStack gap={1} flexWrap="wrap" width="full">
                                                                                            <Badge colorScheme="green" fontSize="xs">
                                                                                                {convertedQty !== undefined
                                                                                                    ? convertedQty.toFixed(2).replace(/\.?0+$/, '')
                                                                                                    : data.quantity}
                                                                                            </Badge>
                                                                                            {units.length > 1 ? (
                                                                                                <Box position="relative">
                                                                                                    <select
                                                                                                        value={selectedUnit}
                                                                                                        onChange={(e) => handleUnitChange(
                                                                                                            row.genericName,
                                                                                                            source.id,
                                                                                                            dataIdx,
                                                                                                            data.unit,
                                                                                                            e.target.value,
                                                                                                            data.quantity,
                                                                                                            undefined // Will be looked up automatically
                                                                                                        )}
                                                                                                        disabled={isConverting}
                                                                                                        style={{
                                                                                                            padding: '2px 4px',
                                                                                                            fontSize: '12px',
                                                                                                            borderRadius: '4px',
                                                                                                            border: '1px solid var(--chakra-colors-border)',
                                                                                                            backgroundColor: isConverting ? 'var(--chakra-colors-gray-50)' : 'var(--chakra-colors-bg)',
                                                                                                            cursor: isConverting ? 'wait' : 'pointer',
                                                                                                        }}
                                                                                                    >
                                                                                                        {units.map(unit => (
                                                                                                            <option key={unit} value={unit}>
                                                                                                                {unit}
                                                                                                            </option>
                                                                                                        ))}
                                                                                                    </select>
                                                                                                    {isConverting && (
                                                                                                        <Box position="absolute" right="-20px" top="50%" transform="translateY(-50%)">
                                                                                                            <Spinner size="xs" />
                                                                                                        </Box>
                                                                                                    )}
                                                                                                </Box>
                                                                                            ) : (
                                                                                                <Badge colorScheme="purple" fontSize="xs">
                                                                                                    {data.unit}
                                                                                                </Badge>
                                                                                            )}
                                                                                            {!data.quantity && !data.unit && (
                                                                                                <Text color="gray.400" fontSize="sm">✓</Text>
                                                                                            )}
                                                                                        </HStack>
                                                                                        {convertedQty !== undefined && selectedUnit !== data.unit && (
                                                                                            <Text fontSize="xs" color="gray.500" fontStyle="italic">
                                                                                                (orig: {data.quantity} {data.unit})
                                                                                            </Text>
                                                                                        )}
                                                                                        {showOriginalName && (
                                                                                            <Text fontSize="xs" color="gray.500" fontStyle="italic">
                                                                                                ({data.originalName})
                                                                                            </Text>
                                                                                        )}
                                                                                    </VStack>
                                                                                );
                                                                            })}
                                                                        </VStack>
                                                                    ) : (
                                                                        <Text color="gray.300" fontSize="sm">—</Text>
                                                                    )}
                                                                </Table.Cell>
                                                            );
                                                        })}
                                                    </Table.Row>
                                                );
                                            })}
                                        </Table.Body>
                                    </Table.Root>
                                </Box>

                                <VStack gap={3} align="stretch">
                                    <Box p={4} bg="blue.50" borderRadius="md">
                                        <Text fontSize="sm" color="blue.800">
                                            <strong>Total unique ingredients:</strong> {tableData.length}
                                        </Text>
                                    </Box>

                                    <Box p={4} bg="green.50" borderRadius="md" borderLeft="4px solid" borderColor="green.400">
                                        <Text fontWeight="medium" color="green.800" mb={2}>
                                            🔄 Unit Conversion Available
                                        </Text>
                                        <VStack align="start" gap={1} fontSize="sm" color="green.700">
                                            <Text>• Use the dropdown menus in each cell to convert units</Text>
                                            <Text>• Original quantities are shown in gray when converted</Text>
                                            <Text>• Conversions use ingredient-specific densities when available</Text>
                                            <Text>• Only compatible units are shown (e.g., volume to volume, or with density conversion)</Text>
                                        </VStack>
                                    </Box>
                                </VStack>
                            </VStack>
                        </Card.Body>
                    </Card.Root>
                )}

                {/* Empty State */}
                {sources.length === 0 && (
                    <Box textAlign="center" py={10} bg="gray.50" borderRadius="md">
                        <Text fontSize="lg" color="gray.600" mb={2}>
                            No recipe sources added yet
                        </Text>
                        <Text fontSize="sm" color="gray.500">
                            Start by pasting ingredients from your first recipe source above
                        </Text>
                    </Box>
                )}
            </VStack>
        </Box>
    );
};

export default RecipeComparison;