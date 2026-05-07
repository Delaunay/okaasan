import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Heading,
    Badge,
    IconButton,
    Flex,
    SimpleGrid,
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import type { RecipeData, WeeklyPrep as WeeklyPrepType, WeeklyPrepRecipe, RecipeNutritionResult } from '../../services/type';
import { TelegramClient, TelegramStorage } from '../../services/telegram';
import { TelegramSettings } from '../common/TelegramSettings';
import NutritionFacts from '../recipes/NutritionFacts';

const DeleteIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

const SettingsIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.65-.07-.97l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65c-.04-.24-.24-.42-.49-.42h-4c-.25 0-.45.18-.49.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.12.22-.07.49.12.64l2.11 1.63c-.04.32-.07.65-.07.97s.03.65.07.97l-2.11 1.63c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.31.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.22.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.63z" />
    </svg>
);

interface GroceryItem {
    name: string;
    quantity: number;
    unit: string;
    recipes: string[];
}

const WeeklyPrep: React.FC = () => {
    const { planName: urlPlanName } = useParams<{ planName?: string }>();
    const navigate = useNavigate();

    const [recipes, setRecipes] = useState<RecipeData[]>([]);
    const [selectedRecipes, setSelectedRecipes] = useState<WeeklyPrepRecipe[]>([]);
    const [activePlanName, setActivePlanName] = useState<string>('');
    const [availablePlans, setAvailablePlans] = useState<string[]>([]);
    const [recipeSearch, setRecipeSearch] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [showTelegramSettings, setShowTelegramSettings] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [nutritionResult, setNutritionResult] = useState<(RecipeNutritionResult & { total_portions: number; recipes_with_nutrition: number; total_recipes: number }) | null>(null);
    const [nutritionLoading, setNutritionLoading] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadAvailablePlans = useCallback(async () => {
        try {
            const names = await recipeAPI.getWeeklyPrepNames();
            setAvailablePlans(names);
        } catch {
            setAvailablePlans([]);
        }
    }, []);

    const loadPlanByName = useCallback(async (name: string) => {
        try {
            const plan = await recipeAPI.loadWeeklyPrep(name);
            setSelectedRecipes(plan.recipes || []);
            setActivePlanName(name);
        } catch (error) {
            console.error('Error loading weekly prep:', error);
        }
    }, []);

    useEffect(() => {
        recipeAPI.getRecipes()
            .then(setRecipes)
            .catch((e) => console.error('Error fetching recipes:', e));
        document.title = 'Weekly Prep';
        loadAvailablePlans();
    }, [loadAvailablePlans]);

    useEffect(() => {
        if (urlPlanName) {
            const decoded = decodeURIComponent(urlPlanName);
            if (decoded !== activePlanName) {
                loadPlanByName(decoded);
            }
            document.title = `Weekly Prep — ${decoded}`;
        } else {
            if (activePlanName) {
                setSelectedRecipes([]);
                setActivePlanName('');
            }
            document.title = 'Weekly Prep';
        }
    }, [urlPlanName]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch aggregated nutrition from the server when recipes change
    useEffect(() => {
        if (selectedRecipes.length === 0) {
            setNutritionResult(null);
            return;
        }

        const timer = setTimeout(async () => {
            setNutritionLoading(true);
            try {
                const result = await recipeAPI.calculateWeeklyPrepNutrition(
                    selectedRecipes.map(r => ({
                        recipeId: r.recipeId,
                        multiplier: r.multiplier,
                        servings: r.servings,
                    }))
                );
                setNutritionResult(result);
            } catch {
                setNutritionResult(null);
            } finally {
                setNutritionLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [selectedRecipes]);

    const addRecipe = (recipe: RecipeData) => {
        if (selectedRecipes.some(r => r.recipeId === recipe.id)) return;
        setSelectedRecipes(prev => [
            ...prev,
            {
                recipeId: recipe.id!,
                recipeName: recipe.title,
                multiplier: 1,
                servings: recipe.servings || 1,
            },
        ]);
        setRecipeSearch('');
    };

    const updateMultiplier = (recipeId: number, multiplier: number) => {
        setSelectedRecipes(prev =>
            prev.map(r => r.recipeId === recipeId ? { ...r, multiplier: Math.max(0.5, multiplier) } : r)
        );
    };

    const removeRecipe = (recipeId: number) => {
        setSelectedRecipes(prev => prev.filter(r => r.recipeId !== recipeId));
    };

    const handlePlanSelect = (name: string) => {
        if (!name) {
            setSelectedRecipes([]);
            setActivePlanName('');
            navigate('/planning', { replace: true });
            return;
        }
        navigate(`/planning/${encodeURIComponent(name)}`);
    };

    const savePlan = async () => {
        const name = saveName.trim();
        if (!name) {
            showToast('Please enter a name', 'error');
            return;
        }
        try {
            const prep: WeeklyPrepType = { name, recipes: selectedRecipes };
            await recipeAPI.saveWeeklyPrep(name, prep);
            showToast(`"${name}" saved!`);
            setSaveName('');
            setShowSaveModal(false);
            setActivePlanName(name);
            await loadAvailablePlans();
            navigate(`/planning/${encodeURIComponent(name)}`, { replace: true });
        } catch {
            showToast('Failed to save', 'error');
        }
    };

    const saveCurrentPlan = async () => {
        if (!activePlanName) return;
        try {
            const prep: WeeklyPrepType = { name: activePlanName, recipes: selectedRecipes };
            await recipeAPI.saveWeeklyPrep(activePlanName, prep);
            showToast(`"${activePlanName}" saved!`);
        } catch {
            showToast('Failed to save', 'error');
        }
    };

    // Grocery list generation
    const groceryList = useMemo((): GroceryItem[] => {
        const groceryMap = new Map<string, GroceryItem>();

        selectedRecipes.forEach(sel => {
            const recipe = recipes.find(r => r.id === sel.recipeId);
            if (!recipe?.ingredients || !recipe.servings) return;

            const scaleFactor = (sel.multiplier * sel.servings) / recipe.servings;

            recipe.ingredients.forEach(ing => {
                if (!ing.name || !ing.unit || ing.quantity === undefined) return;
                const key = ing.name.toLowerCase();
                const scaledQty = ing.quantity * scaleFactor;

                if (groceryMap.has(key)) {
                    const existing = groceryMap.get(key)!;
                    if (existing.unit === ing.unit) {
                        existing.quantity += scaledQty;
                    }
                    if (!existing.recipes.includes(sel.recipeName)) {
                        existing.recipes.push(sel.recipeName);
                    }
                } else {
                    groceryMap.set(key, {
                        name: ing.name,
                        quantity: scaledQty,
                        unit: ing.unit,
                        recipes: [sel.recipeName],
                    });
                }
            });
        });

        return Array.from(groceryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedRecipes, recipes]);

    const filteredRecipes = useMemo(() => {
        if (!recipeSearch.trim()) return [];
        const search = recipeSearch.toLowerCase();
        const selectedIds = new Set(selectedRecipes.map(r => r.recipeId));
        return recipes
            .filter(r => r.id && !selectedIds.has(r.id) && r.title.toLowerCase().includes(search))
            .slice(0, 10);
    }, [recipeSearch, recipes, selectedRecipes]);

    const totalPortions = selectedRecipes.reduce((sum, r) => sum + r.multiplier * r.servings, 0);

    const selectBg = 'var(--input-bg)';
    const itemHover = 'var(--hover-bg)';

    return (
        <Box width="100%" height="100%">
            {toast && (
                <Box
                    position="fixed" top={4} right={4} zIndex={1001}
                    p={4} borderRadius="md"
                    bg={toast.type === 'success' ? 'green.500' : 'red.500'}
                    color="white" boxShadow="lg" maxW="300px"
                >
                    <Text fontWeight="medium">{toast.message}</Text>
                </Box>
            )}

            <VStack gap={6} align="stretch" width="100%">
                {/* Header */}
                <Box>
                    <Flex justify="space-between" align="center" mb={2} gap={4} wrap="wrap">
                        <HStack gap={3} flex={1} minW={0}>
                            <Heading size="lg" flexShrink={0}>Weekly Prep</Heading>
                            <select
                                value={activePlanName}
                                onChange={(e) => handlePlanSelect(e.target.value)}
                                style={{
                                    flex: 1, maxWidth: '280px', padding: '6px 10px',
                                    border: '1px solid var(--chakra-colors-border)',
                                    borderRadius: '6px', fontSize: '14px',
                                    backgroundColor: selectBg, color: 'inherit',
                                }}
                            >
                                <option value="">New plan</option>
                                {availablePlans.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </HStack>
                        <HStack gap={2} flexShrink={0}>
                            <Link to="/planning/detailed">
                                <Button variant="outline" size="sm">Detailed Planner</Button>
                            </Link>
                            {activePlanName && (
                                <Button colorScheme="blue" variant="outline" size="sm" onClick={saveCurrentPlan}>
                                    Save
                                </Button>
                            )}
                            <Button
                                colorScheme="green" variant="outline" size="sm"
                                onClick={() => { setSaveName(activePlanName || ''); setShowSaveModal(true); }}
                            >
                                Save As…
                            </Button>
                        </HStack>
                    </Flex>
                </Box>

                {/* Summary */}
                <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
                    <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Recipes</Text>
                            <Text fontSize="2xl" fontWeight="bold">{selectedRecipes.length}</Text>
                        </VStack>
                    </Box>
                    <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Total Portions</Text>
                            <Text fontSize="2xl" fontWeight="bold" color="blue.500">{totalPortions}</Text>
                        </VStack>
                    </Box>
                    <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Grocery Items</Text>
                            <Text fontSize="2xl" fontWeight="bold" color="green.500">{groceryList.length}</Text>
                        </VStack>
                    </Box>
                    <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md" bg="bg">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Nutrition Data</Text>
                            <Text fontSize="2xl" fontWeight="bold" color="orange.500">
                                {nutritionResult ? `${nutritionResult.recipes_with_nutrition}/${nutritionResult.total_recipes}` : '—'}
                            </Text>
                        </VStack>
                    </Box>
                </SimpleGrid>

                {/* Add recipe search */}
                <Box padding="5px" borderRadius="md" border="1px solid" borderColor="gray.200" position="relative">
                    <Heading size="md" mb={3}>Add Recipe</Heading>
                    <Input
                        value={recipeSearch}
                        onChange={(e) => setRecipeSearch(e.target.value)}
                        placeholder="Search recipes…"
                        size="sm"
                    />
                    {filteredRecipes.length > 0 && (
                        <Box
                            position="absolute" left={0} right={0} zIndex={10}
                            bg="bg" border="1px solid" borderColor="gray.200" borderRadius="md"
                            mt={1} maxH="300px" overflowY="auto" boxShadow="md"
                        >
                            {filteredRecipes.map(recipe => (
                                <Box
                                    key={recipe.id}
                                    px={3} py={2} cursor="pointer"
                                    _hover={{ bg: itemHover }}
                                    onClick={() => addRecipe(recipe)}
                                >
                                    <HStack justify="space-between">
                                        <Text fontSize="sm">{recipe.title}</Text>
                                        <Badge size="sm" colorScheme="blue">{recipe.servings} servings</Badge>
                                    </HStack>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>

                {/* Main content: recipes + grocery + nutrition */}
                <Flex gap={4} align="start" wrap={{ base: 'wrap', lg: 'nowrap' }}>
                    {/* Selected recipes */}
                    <Box flex={1} minW="300px" padding="5px" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Heading size="md" mb={3}>Recipes to Cook</Heading>
                        {selectedRecipes.length === 0 ? (
                            <Text fontSize="sm" color="gray.500" fontStyle="italic" p={3}>
                                Search and add recipes above to start planning your week.
                            </Text>
                        ) : (
                            <VStack gap={2} align="stretch">
                                {selectedRecipes.map(sel => (
                                    <Box
                                        key={sel.recipeId}
                                        p={2} border="1px" borderColor="gray.200" borderRadius="md"
                                        bg="bg" _hover={{ bg: itemHover }}
                                    >
                                        <Flex justify="space-between" align="center" gap={2}>
                                            <Link to={`/recipes/${sel.recipeId}`} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
                                                <Text fontSize="sm" fontWeight="semibold" truncate>
                                                    {sel.recipeName}
                                                </Text>
                                            </Link>
                                            <HStack gap={2} flexShrink={0}>
                                                <Text fontSize="xs" color="gray.500">×</Text>
                                                <Input
                                                    type="number"
                                                    value={sel.multiplier}
                                                    onChange={(e) => updateMultiplier(sel.recipeId, parseFloat(e.target.value) || 1)}
                                                    min={0.5}
                                                    step={0.5}
                                                    size="xs"
                                                    width="60px"
                                                    textAlign="center"
                                                />
                                                <Badge size="sm" colorScheme="blue">
                                                    {sel.multiplier * sel.servings}p
                                                </Badge>
                                                <IconButton
                                                    size="xs" aria-label="Remove recipe"
                                                    colorScheme="red" variant="ghost"
                                                    onClick={() => removeRecipe(sel.recipeId)}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </HStack>
                                        </Flex>
                                    </Box>
                                ))}
                            </VStack>
                        )}
                    </Box>

                    {/* Grocery list */}
                    <Box flex={1} minW="300px" padding="5px" borderRadius="md" border="1px solid" borderColor="gray.200">
                        <Flex justify="space-between" align="center" mb={3}>
                            <Heading size="md">Grocery List</Heading>
                            <HStack gap={2}>
                                <Button
                                    size="sm" colorScheme="blue" variant="outline"
                                    disabled={groceryList.length === 0}
                                    onClick={() => {
                                        const text = groceryList.map(item =>
                                            `* ${item.name} ${item.quantity.toFixed(2)} ${item.unit}`
                                        ).join('\n');
                                        navigator.clipboard.writeText(text)
                                            .then(() => showToast('Copied!'))
                                            .catch(() => showToast('Copy failed', 'error'));
                                    }}
                                >
                                    Copy
                                </Button>
                                <Button
                                    size="sm" colorScheme="green" variant="outline"
                                    disabled={groceryList.length === 0}
                                    onClick={async () => {
                                        if (!TelegramStorage.hasCredentials()) {
                                            showToast('Configure Telegram settings first', 'error');
                                            setShowTelegramSettings(true);
                                            return;
                                        }
                                        try {
                                            const data = groceryList.map(item => ({
                                                name: item.name,
                                                quantity: item.quantity.toString(),
                                                unit: item.unit,
                                            }));
                                            await TelegramClient.sendChecklist(data, 'Grocery List');
                                            showToast('Sent to Telegram!');
                                        } catch {
                                            showToast('Telegram send failed', 'error');
                                        }
                                    }}
                                >
                                    Telegram
                                </Button>
                                <IconButton
                                    size="sm" aria-label="Telegram Settings"
                                    colorScheme="gray" variant="outline"
                                    onClick={() => setShowTelegramSettings(true)}
                                >
                                    <SettingsIcon />
                                </IconButton>
                            </HStack>
                        </Flex>
                        {groceryList.length === 0 ? (
                            <Text fontSize="sm" color="gray.500" fontStyle="italic" p={3}>
                                Add recipes to see the grocery list.
                            </Text>
                        ) : (
                            <VStack gap={0} align="stretch">
                                {groceryList.map((item, i) => (
                                    <Box
                                        key={i} px={2} py={1}
                                        borderBottom="1px" borderColor="gray.100"
                                        _hover={{ bg: itemHover }}
                                    >
                                        <HStack justify="space-between">
                                            <Text fontSize="sm">{item.name}</Text>
                                            <Badge size="sm" colorScheme="blue">
                                                {item.quantity.toFixed(2)} {item.unit}
                                            </Badge>
                                        </HStack>
                                    </Box>
                                ))}
                            </VStack>
                        )}
                    </Box>

                    {/* Nutrition summary */}
                    <Box flex={1} minW="300px">
                        {nutritionLoading && (
                            <Text fontSize="xs" color="gray.500" mb={2}>
                                Calculating nutrition…
                            </Text>
                        )}
                        {!nutritionResult || !nutritionResult.compositions?.length ? (
                            !nutritionLoading && (
                                <Box padding="5px" borderRadius="md" border="1px solid" borderColor="gray.200">
                                    <Heading size="md" mb={3}>Average Nutrition per Portion</Heading>
                                    <Text fontSize="sm" color="gray.500" fontStyle="italic" p={3}>
                                        Nutrition data will appear once recipes with calculated nutrition are added.
                                    </Text>
                                </Box>
                            )
                        ) : (
                            <>
                                <NutritionFacts
                                    compositions={nutritionResult.compositions}
                                    entityId={0}
                                    editable={false}
                                    title="Average Nutrition"
                                    referenceLabel="Per portion (average across all recipes)"
                                />
                                <Box px={2} py={2}>
                                    <Text fontSize="xs" color="gray.500">
                                        Based on {nutritionResult.recipes_with_nutrition} of {nutritionResult.total_recipes} recipes
                                        ({nutritionResult.total_portions} total portions)
                                    </Text>
                                </Box>
                            </>
                        )}
                    </Box>
                </Flex>
            </VStack>

            {/* Save Modal */}
            {showSaveModal && (
                <Box
                    position="fixed" top={0} left={0} right={0} bottom={0}
                    bg="blackAlpha.600" zIndex={1000}
                    display="flex" alignItems="center" justifyContent="center" p={4}
                >
                    <Box bg="bg" borderRadius="md" p={6} maxW="400px" width="100%">
                        <VStack gap={4} align="stretch">
                            <Flex justify="space-between" align="center">
                                <Heading size="md">Save Weekly Prep</Heading>
                                <IconButton
                                    aria-label="Close" onClick={() => { setShowSaveModal(false); setSaveName(''); }}
                                    variant="ghost" size="sm"
                                >
                                    <CloseIcon />
                                </IconButton>
                            </Flex>
                            <Box>
                                <Text mb={2} fontWeight="semibold">Plan Name</Text>
                                <Input
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    placeholder="e.g. Week of May 5"
                                    size="sm"
                                    onKeyDown={(e) => { if (e.key === 'Enter') savePlan(); }}
                                />
                            </Box>
                            <HStack justify="flex-end" pt={2}>
                                <Button variant="ghost" onClick={() => { setShowSaveModal(false); setSaveName(''); }}>
                                    Cancel
                                </Button>
                                <Button colorScheme="blue" onClick={savePlan} disabled={!saveName.trim()}>
                                    Save
                                </Button>
                            </HStack>
                        </VStack>
                    </Box>
                </Box>
            )}

            {/* Telegram Settings Modal */}
            <TelegramSettings
                isOpen={showTelegramSettings}
                onClose={() => setShowTelegramSettings(false)}
            />
        </Box>
    );
};

export default WeeklyPrep;
