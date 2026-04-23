import React, { useState, useCallback, useRef, useEffect, FC, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Flex,
  Spacer,
  Image,
  Spinner,
  Link,
  Input,
  Textarea,
  IconButton,
  Heading,
} from '@chakra-ui/react';
import { recipeAPI, imagePath } from '../services/api';
import type { RecipeData, RecipeIngredient, Instruction } from '../services/type';
import { convert, getAvailableUnits } from '../utils/unit_cvt';
import { formatQuantity, parseFractionToDecimal } from '../utils/fractions';
import ImageUpload from './ImageUpload';
import UnitSelect from './UnitSelect';

// Utility functions for ingredient references
interface IngredientReference {
  originalText: string;
  ingredientName: string;
  quantity?: string;
  fullIngredientName?: string;
  quantityValue?: number;
  unit?: string;
}

// Temperature command interface
interface TemperatureCommand {
  originalText: string;
  temperature: number;
  unit: 'C' | 'F';
}

// Time command interface
interface TimeCommand {
  originalText: string;
  time: number;
  unit: string; // 'm', 'h', 's', etc.
}

// Timer state interface
interface ActiveTimer {
  id: string;
  originalTime: number;
  currentTime: number;
  unit: string;
  isRunning: boolean;
  isFinished: boolean;
}

// Parse ingredient references in text
const parseIngredientReferences = (text: string): IngredientReference[] => {
  const references: IngredientReference[] = [];
  const regex = /@([a-zA-Z0-9_]+)(?:\{([^}]+)\})?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    references.push({
      originalText: match[0],
      ingredientName: match[1].trim(),
      quantity: match[2] || '1'
    });
  }

  return references;
};

// Parse temperature commands in text
const parseTemperatureCommands = (text: string): TemperatureCommand[] => {
  const commands: TemperatureCommand[] = [];
  const regex = /\$temp\{([0-9]+(?:\.[0-9]+)?)\}\{([CF])\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    commands.push({
      originalText: match[0],
      temperature: parseFloat(match[1]),
      unit: match[2] as 'C' | 'F'
    });
  }

  return commands;
};

// Parse time commands in text
const parseTimeCommands = (text: string): TimeCommand[] => {
  const commands: TimeCommand[] = [];
  const regex = /\$time\{([0-9]+(?:\.[0-9]+)?)([mhs])\}/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    commands.push({
      originalText: match[0],
      time: parseFloat(match[1]),
      unit: match[2]
    });
  }

  return commands;
};

// Get target unit for ingredient based on preferred unit system
const getTargetUnitForIngredient = async (ingredient: RecipeIngredient, targetSystem: 'metric' | 'us_customary'): Promise<string | null> => {
  if (!ingredient.ingredient_id) {
    // If no ingredient ID, use fallback units
    return targetSystem === 'metric' ? 'ml' : 'cup';
  }

  try {
    // Get the full ingredient data to access unit preferences
    const fullIngredient = await recipeAPI.getIngredientById(ingredient.ingredient_id);

    if (fullIngredient.unit) {
      if (targetSystem === 'metric') {
        return fullIngredient.unit.metric || 'ml';
      } else {
        return fullIngredient.unit.us_customary || 'cup';
      }
    }
  } catch (error) {
    console.log(`Could not load ingredient data for ${ingredient.name}:`, error);
  }

  // Fallback if ingredient data unavailable
  return targetSystem === 'metric' ? 'ml' : 'cup';
};

// Find ingredient by partial name match
const findIngredientByName = (ingredients: RecipeIngredient[], partialName: string): RecipeIngredient | null => {
  // Replace underscores with spaces for matching
  const normalizedPartialName = partialName.replace(/_/g, ' ').toLowerCase();

  // First try exact match
  const exactMatch = ingredients.find(ing =>
    ing.name.toLowerCase() === normalizedPartialName
  );
  if (exactMatch) return exactMatch;

  // Then try starts with
  const startsWithMatch = ingredients.find(ing =>
    ing.name.toLowerCase().startsWith(normalizedPartialName)
  );
  if (startsWithMatch) return startsWithMatch;

  // Finally try contains
  const containsMatch = ingredients.find(ing =>
    ing.name.toLowerCase().includes(normalizedPartialName)
  );
  if (containsMatch) return containsMatch;

  return null;
};

// Evaluate quantity expression (e.g., "1/4", "2.5", "1+1/2")
const evaluateQuantity = (quantityStr: string): number => {
  try {
    // Handle fractions like "1/4"
    if (quantityStr.includes('/')) {
      const [numerator, denominator] = quantityStr.split('/').map(Number);
      return numerator / denominator;
    }

    // Handle mixed numbers like "1+1/2"
    if (quantityStr.includes('+')) {
      const parts = quantityStr.split('+');
      return parts.reduce((sum, part) => sum + evaluateQuantity(part.trim()), 0);
    }

    // Handle simple numbers
    return parseFloat(quantityStr) || 1;
  } catch {
    return 1;
  }
};

// Convert temperature between Celsius and Fahrenheit
const convertTemperature = (temp: number, fromUnit: 'C' | 'F', toUnit: 'C' | 'F'): number => {
  if (fromUnit === toUnit) return temp;

  if (fromUnit === 'C' && toUnit === 'F') {
    return Math.round((temp * 9 / 5) + 32);
  } else if (fromUnit === 'F' && toUnit === 'C') {
    return Math.round((temp - 32) * 5 / 9);
  }

  return temp;
};

// Format time with appropriate unit
const formatTime = (time: number, unit: string): string => {
  if (unit === 'm') {
    return `${time} min`;
  } else if (unit === 'h') {
    return `${time} hour${time !== 1 ? 's' : ''}`;
  } else if (unit === 's') {
    return `${time} second${time !== 1 ? 's' : ''}`;
  }
  return `${time} ${unit}`;
};

// Render instruction text with ingredient references
interface InstructionTextRendererProps {
  text: string;
  ingredients: RecipeIngredient[];
  multiplier?: number;
  convertedIngredients?: Record<number, ConvertedIngredient>;
  preferredTemperatureUnit?: 'C' | 'F';
  onTimerStart?: (timerId: string, time: number, unit: string) => void;
  activeTimers?: Record<string, ActiveTimer>;
  stepIndex?: number;
}

const InstructionTextRenderer: FC<InstructionTextRendererProps> = ({
  text,
  ingredients,
  multiplier = 1,
  convertedIngredients = {},
  preferredTemperatureUnit = 'C',
  onTimerStart,
  activeTimers = {},
  stepIndex = 0
}) => {
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>(preferredTemperatureUnit);

  const references = parseIngredientReferences(text);
  const temperatureCommands = parseTemperatureCommands(text);
  const timeCommands = parseTimeCommands(text);

  if (references.length === 0 && temperatureCommands.length === 0 && timeCommands.length === 0) {
    return <span style={{ paddingLeft: "10px" }}>{text}</span>;
  }

  let lastIndex = 0;
  const elements: React.ReactElement[] = [];

  // Process all commands in order of appearance
  const allCommands = [
    ...references.map(ref => ({ ...ref, type: 'ingredient' as const })),
    ...temperatureCommands.map(cmd => ({ ...cmd, type: 'temperature' as const })),
    ...timeCommands.map(cmd => ({ ...cmd, type: 'time' as const }))
  ].sort((a, b) => {
    const aIndex = text.indexOf(a.originalText);
    const bIndex = text.indexOf(b.originalText);
    return aIndex - bIndex;
  });

  allCommands.forEach((command, index) => {
    const startIndex = text.indexOf(command.originalText, lastIndex);
    const endIndex = startIndex + command.originalText.length;

    // Add text before the command
    if (startIndex > lastIndex) {
      elements.push(
        <span key={`text-${index}`}>
          {text.slice(lastIndex, startIndex)}
        </span>
      );
    }

    if (command.type === 'ingredient') {
      // Handle ingredient references
      const ingredient = findIngredientByName(ingredients, command.ingredientName);
      const quantityValue = evaluateQuantity(command.quantity || '1');

      if (ingredient) {
        const ingredientIndex = ingredients.findIndex(ing => ing.name === ingredient.name);
        const converted = ingredientIndex >= 0 ? convertedIngredients[ingredientIndex] : null;

        const baseQuantity = converted ? converted.quantity : (ingredient.quantity || 1);
        const finalQuantity = quantityValue * baseQuantity * multiplier;
        const unit = converted ? converted.unit : (ingredient.unit || 'unit');

        const displayQuantity = `${finalQuantity.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;
        elements.push(
          <Text as="span" key={`ref-${index}`} fontWeight="bold" color="fg">
            {ingredient.name} ({displayQuantity})
          </Text>
        );
      } else {
        elements.push(
          <span key={`ref-${index}`} style={{ color: 'red', fontStyle: 'italic' }}>
            {command.originalText} (ingredient not found)
          </span>
        );
      }
    } else if (command.type === 'temperature') {
      // Handle temperature commands
      const convertedTemp = convertTemperature(command.temperature, command.unit, temperatureUnit);
      elements.push(
        <Text
          as="span"
          key={`temp-${index}`}
          fontWeight="bold"
          color="fg"
          cursor="pointer"
          onClick={() => setTemperatureUnit(temperatureUnit === 'C' ? 'F' : 'C')}
          _hover={{
            color: 'blue.600',
            textDecoration: 'underline'
          }}
          display="inline-flex"
          alignItems="center"
          gap={1}
        >
          {convertedTemp}°{temperatureUnit}
          <span style={{ fontSize: '1em', opacity: 0.6, paddingLeft: "2px" }}>(to °{temperatureUnit === 'C' ? 'F' : 'C'})</span>
        </Text>
      );
    } else if (command.type === 'time') {
      // Handle time commands - use stepIndex for consistent timer identification
      const timerId = `timer-${command.time}-${command.unit}-step-${stepIndex}-cmd-${index}`;
      const activeTimer = activeTimers[timerId];

      elements.push(
        <Text
          as="span"
          key={`time-${index}`}
          fontWeight="bold"
          color={activeTimer?.isRunning ? "green.600" : activeTimer?.isFinished ? "red.600" : "fg"}
          cursor="pointer"
          onClick={() => onTimerStart?.(timerId, command.time, command.unit)}
          _hover={{
            color: 'blue.600',
            textDecoration: 'underline'
          }}
          display="inline-flex"
          alignItems="center"
          gap={1}
        >
          {formatTime(command.time, command.unit)}
          {/* {activeTimer?.isRunning && <span style={{ fontSize: '0.8em', opacity: 0.7 }}>🕒</span>}
          {activeTimer?.isFinished && <span style={{ fontSize: '0.8em', opacity: 0.7 }}>✅</span>} */}
          <span style={{ fontSize: '1em', opacity: 0.6, paddingLeft: "2px" }}>🕒</span>
        </Text>
      );
    }

    lastIndex = endIndex;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(
      <span key="text-end">
        {text.slice(lastIndex)}
      </span>
    );
  }

  return <span style={{ paddingLeft: "10px" }}>{elements}</span>;
};

// Simple icon components
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

const DragHandleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const ResetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
  </svg>
);

const ConversionIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
  </svg>
);





// IngredientNameInput Component - Input with suggestions for ingredient names
interface IngredientNameInputProps {
  value: string;
  onChange: (value: string, ingredientId?: number, ingredientRecipeId?: number, clearIds?: boolean) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "2xs" | "xs";
}

const IngredientNameInput: FC<IngredientNameInputProps> = ({
  value,
  onChange,
  placeholder = "Ingredient name",
  size = "sm"
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ id: number, name: string, type: 'ingredient' | 'recipe' }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const isUserInputRef = useRef(false);

  // Update input value when prop changes
  useEffect(() => {
    isUserInputRef.current = false; // Mark as programmatic change
    setInputValue(value);
    setShowSuggestions(false); // Don't show suggestions on programmatic changes
  }, [value]);

  // Debounced search function - only when focused
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (isFocused && inputValue.length >= 2) {
        setIsLoading(true);
        try {
          const results = await recipeAPI.searchIngredients(inputValue);
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error searching ingredients:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [inputValue, isFocused]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    isUserInputRef.current = true; // Mark as user input
    setInputValue(newValue);

    // Check if the typed value exactly matches any suggestion
    const exactMatch = suggestions.find(s => s.name.toLowerCase() === newValue.toLowerCase());

    if (exactMatch) {
      // Auto-select the exact match
      if (exactMatch.type === 'ingredient') {
        onChange(exactMatch.name, exactMatch.id, undefined, false);
      } else if (exactMatch.type === 'recipe') {
        onChange(exactMatch.name, undefined, exactMatch.id, false);
      }
    } else {
      // No exact match - update name and signal to clear IDs
      onChange(newValue, undefined, undefined, true);
    }
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: { id: number, name: string, type: 'ingredient' | 'recipe' }) => {
    setInputValue(suggestion.name);
    setShowSuggestions(false);

    if (suggestion.type === 'ingredient') {
      // For ingredients, set the name and ingredient_id
      onChange(suggestion.name, suggestion.id, undefined, false);
    } else if (suggestion.type === 'recipe') {
      // For recipes, set the name and ingredient_recipe_id
      onChange(suggestion.name, undefined, suggestion.id, false);
    }
  };



  return (
    <Box position="relative" width="100%">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        size={size}
        placeholder={placeholder}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          // Small delay to allow suggestion clicks to register
          setTimeout(() => {
            setShowSuggestions(false);
          }, 150);
        }}
      />

      {isLoading && (
        <Box position="absolute" right="8px" top="50%" transform="translateY(-50%)">
          <Spinner size="xs" />
        </Box>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <Box
          ref={suggestionsRef}
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
        >
          {suggestions.map((suggestion, index) => (
            <Box
              key={`${suggestion.type}-${suggestion.id}`}
              p={2}
              cursor="pointer"
              _hover={{ bg: "gray.50" }}
              onClick={() => handleSuggestionClick(suggestion)}
              borderBottom={index < suggestions.length - 1 ? "1px solid" : "none"}
              borderColor="gray.100"
            >
              <HStack justify="space-between">
                <Text fontSize="sm">{suggestion.name}</Text>
                <Badge
                  size="sm"
                  colorScheme={suggestion.type === 'ingredient' ? 'green' : 'blue'}
                  variant="subtle"
                >
                  {suggestion.type}
                </Badge>
              </HStack>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// UsdaFoodSelector Component - Inline USDA food search and selection
interface UsdaFoodSelectorProps {
  currentFdcId?: number;
  ingredientName: string;
  onSelect: (fdcId: number | undefined) => void;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "2xs" | "xs";
}

const UsdaFoodSelector: FC<UsdaFoodSelectorProps> = ({
  currentFdcId,
  ingredientName,
  onSelect,
  size = "sm"
}) => {
  const [suggestions, setSuggestions] = useState<Array<{ fdc_id: number, description: string, data_type: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced USDA search
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (isFocused && searchQuery.length >= 2) {
        setIsLoading(true);
        try {
          const results = await recipeAPI.searchUsdaFoods(searchQuery);
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error searching USDA foods:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, isFocused]);

  const handleSelect = (fdcId: number) => {
    setSearchQuery('');
    setShowSuggestions(false);
    onSelect(fdcId);
  };

  const handleClear = () => {
    setSearchQuery('');
    onSelect(undefined);
  };

  return (
    <Box position="relative" width="100%">
      <HStack gap={1}>
        <Input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            // Pre-fill with ingredient name if no search query
            if (!searchQuery && ingredientName) {
              setSearchQuery(ingredientName);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          size={size}
          placeholder="Search USDA..."
          flex={1}
        />
        {isLoading && (
          <Spinner size="xs" />
        )}
        {currentFdcId && (
          <HStack gap={1}>
            <Badge colorScheme="orange" fontSize="2xs">
              {currentFdcId}
            </Badge>
            <IconButton
              size="xs"
              aria-label="Clear USDA food"
              onClick={handleClear}
              variant="ghost"
              colorScheme="red"
            >
              ✕
            </IconButton>
          </HStack>
        )}
      </HStack>

      {showSuggestions && suggestions.length > 0 && (
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
          {suggestions.map((food, index) => (
            <Box
              key={food.fdc_id}
              p={2}
              cursor="pointer"
              _hover={{ bg: "gray.50" }}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(food.fdc_id);
              }}
              borderBottom={index < suggestions.length - 1 ? "1px solid" : "none"}
              borderColor="gray.100"
            >
              <VStack align="start" gap={0}>
                <Text fontSize="sm">{food.description}</Text>
                <HStack gap={2}>
                  <Badge colorScheme="orange" fontSize="2xs">
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
  );
};

// IngredientItem Component - Represents a single ingredient in a list
interface IngredientItemProps {
  ingredient: RecipeIngredient;
  index: number;
  multiplier: number;
  convertedIngredients: Record<number, ConvertedIngredient>;
  setConvertedIngredients: React.Dispatch<React.SetStateAction<Record<number, ConvertedIngredient>>>;
  isEditable: boolean;
  onUpdateIngredient?: (index: number, field: keyof RecipeIngredient, value: any) => void;
  onRemoveIngredient?: (index: number) => void;
  onReorderIngredients?: (fromIndex: number, toIndex: number) => void;
  showActions: boolean;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  baseIndex?: number;
  isChecked?: boolean;
  onToggleCheck?: (index: number) => void;
}

const IngredientItem: FC<IngredientItemProps> = ({
  ingredient,
  index,
  multiplier,
  convertedIngredients,
  setConvertedIngredients,
  isEditable,
  onUpdateIngredient,
  onRemoveIngredient,
  onReorderIngredients,
  showActions,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  baseIndex = 0,
  isChecked = false,
  onToggleCheck,
}) => {
  const navigate = useNavigate();
  const isStatic = recipeAPI.isStaticMode();
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<{
    id?: number;
    name: string;
    quantity?: number;
    unit?: string;
    density?: number;
  } | null>(null);

  // Local state for raw quantity text input (only used in edit mode)
  const [rawQuantityText, setRawQuantityText] = useState<string>(
    formatQuantity(ingredient.quantity || 1, ingredient.unit)
  );

  // Update raw quantity text when ingredient changes
  useEffect(() => {
    setRawQuantityText(formatQuantity(ingredient.quantity || 1, ingredient.unit));
  }, [ingredient.quantity, ingredient.unit]);

  // Local state for this ingredient's units
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  const actualIndex = baseIndex + index;
  const converted = convertedIngredients[actualIndex];
  const baseQuantity = converted?.quantity || ingredient.quantity || 1;
  const displayQuantity = baseQuantity * multiplier;
  const displayUnit = converted?.unit || ingredient.unit || 'cup';

  const openConversionModal = async (ingredient: RecipeIngredient) => {
    let ingredientDensity = ingredient.density;

    if (!ingredientDensity && ingredient.ingredient_id) {
      try {
        const fullIngredient = await recipeAPI.getIngredientById(ingredient.ingredient_id);
        ingredientDensity = fullIngredient.density;
      } catch (error) {
        console.warn('Could not load full ingredient data:', error);
      }
    }

    setSelectedIngredient({
      id: ingredient.ingredient_id,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      density: ingredientDensity
    });
    setShowConversionModal(true);
  };

  const closeConversionModal = () => {
    setShowConversionModal(false);
    setSelectedIngredient(null);
  };

  // Load available units for this ingredient when not in edit mode
  useEffect(() => {
    if (!isEditable && ingredient) {
      const loadAvailableUnits = async () => {
        const currentUnit = ingredient.unit || 'cup';

        try {
          // Get available units based on unit type and ingredient density
          const availableUnitsFromAPI = await getAvailableUnits(currentUnit, ingredient.ingredient_id);

          // Always include the current unit first, then add other available units
          const units = [currentUnit];
          availableUnitsFromAPI.forEach(unit => {
            if (unit !== currentUnit && !units.includes(unit)) {
              units.push(unit);
            }
          });

          setAvailableUnits(units);

          // Initialize converted ingredient with original values if not already set
          if (!convertedIngredients[actualIndex]) {
            setConvertedIngredients(prev => ({
              ...prev,
              [actualIndex]: {
                quantity: ingredient.quantity || 1,
                unit: currentUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              }
            }));
          }
        } catch (error) {
          console.error('Error loading available units:', error);
          // Fallback to common units if API fails
          const fallbackUnits = ['ml', 'cl', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'pint', 'quart', 'gallon', 'g', 'kg', 'mg', 'oz', 'lb'];

          const units = [currentUnit];
          fallbackUnits.forEach(unit => {
            if (unit !== currentUnit && !units.includes(unit)) {
              units.push(unit);
            }
          });

          setAvailableUnits(units);

          if (!convertedIngredients[actualIndex]) {
            setConvertedIngredients(prev => ({
              ...prev,
              [actualIndex]: {
                quantity: ingredient.quantity || 1,
                unit: currentUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              }
            }));
          }
        }
      };

      loadAvailableUnits();
    }
  }, [isEditable, ingredient, actualIndex, convertedIngredients, setConvertedIngredients]);

  // Handle unit conversion
  const handleUnitChange = async (newUnit: string) => {
    if (!ingredient.unit) return;

    const originalQuantity = converted?.originalQuantity || ingredient.quantity || 1;
    const originalUnit = converted?.originalUnit || ingredient.unit;

    if (originalUnit === newUnit) {
      setConvertedIngredients((prev: Record<number, ConvertedIngredient>) => ({
        ...prev,
        [actualIndex]: {
          quantity: originalQuantity,
          unit: originalUnit,
          originalQuantity: originalQuantity,
          originalUnit: originalUnit,
        }
      }));
      return;
    }

    setIsLoadingUnits(true);

    try {
      const convertedQuantity = await convert(
        originalQuantity,
        originalUnit,
        newUnit,
        ingredient.ingredient_id
      );

      setConvertedIngredients((prev: Record<number, ConvertedIngredient>) => ({
        ...prev,
        [actualIndex]: {
          quantity: convertedQuantity,
          unit: newUnit,
          originalQuantity: originalQuantity,
          originalUnit: originalUnit,
        }
      }));
    } catch (error) {
      console.error('Error converting unit:', error);
      setConvertedIngredients((prev: Record<number, ConvertedIngredient>) => ({
        ...prev,
        [actualIndex]: {
          quantity: originalQuantity,
          unit: originalUnit,
          originalQuantity: originalQuantity,
          originalUnit: originalUnit,
        }
      }));
    } finally {
      setIsLoadingUnits(false);
    }
  };

  return (
    <>
      <HStack
        gap={4}
        align="center"
        bg={dragOverIndex === index ? "blue.50" : "transparent"}
        border={dragOverIndex === index ? "2px dashed" : "1px solid"}
        borderColor={dragOverIndex === index ? "blue.400" : "transparent"}
        opacity={draggedIndex === index ? 0.5 : (isChecked ? 0.6 : 1)}
        transition="all 0.2s"
        onDragOver={(e) => onDragOver(e, index)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, index)}
        onDragEnd={onDragEnd}
        textDecoration={isChecked ? "line-through" : "none"}
        color={isChecked ? "gray.500" : "inherit"}
      >
        {/* Checkbox for crossing out ingredients (view mode only) */}
        {!isEditable && !isStatic && onToggleCheck && (
          <Box
            minW="24px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleCheck(index)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
          </Box>
        )}

        {/* Drag Handle - Left Side */}
        {isEditable && !isStatic && onReorderIngredients && (
          <Box
            minW="24px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="gray.400"
            _hover={{ color: "gray.600" }}
            cursor="grab"
            draggable={true}
            onDragStart={(e) => onDragStart(e, index)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DragHandleIcon />
          </Box>
        )}

        <Box minW="80px" width="5%">
          {isEditable && !isStatic && onUpdateIngredient ? (
            <Input
              value={rawQuantityText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setRawQuantityText(e.target.value);
              }}
              onBlur={() => {
                // Parse and validate quantity when user finishes editing
                const inputText = rawQuantityText.trim() || '1';
                const parsedQuantity = parseFractionToDecimal(inputText);
                if (parsedQuantity && parsedQuantity > 0) {
                  onUpdateIngredient(index, 'quantity', parsedQuantity);
                } else {
                  // If invalid, revert to previous valid value
                  setRawQuantityText(formatQuantity(ingredient.quantity || 1, ingredient.unit));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur(); // Trigger onBlur validation
                }
              }}
              size="sm"
              placeholder="1"
            />
          ) : (
            <VStack align="start" gap={0}>
              <Flex align="center" gap={1} width="100%">
                <Text textAlign="right" width="100%">{formatQuantity(displayQuantity, displayUnit)}</Text>
                {isLoadingUnits && <Spinner size="xs" />}
              </Flex>
              {converted && converted.unit !== converted.originalUnit && (
                <Text fontSize="xs" color="gray.500">
                  (orig: {formatQuantity(converted.originalQuantity * multiplier, converted.originalUnit)} {converted.originalUnit})
                </Text>
              )}
            </VStack>
          )}
        </Box>

        <Box minW="80px">
          {isEditable && !isStatic && onUpdateIngredient ? (
            <UnitSelect
              value={ingredient.unit || 'cup'}
              onChange={(value) => onUpdateIngredient(index, 'unit', value)}
              ingredientId={ingredient.ingredient_id}
              placeholder="unit"
              size="sm"
              width="80px"
            />
          ) : (
            <Box>
              <select
                value={displayUnit}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => handleUnitChange(e.target.value)}
                disabled={isLoadingUnits || availableUnits.length === 0}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--chakra-colors-border)',
                  fontSize: '14px',
                  minWidth: '80px',
                  backgroundColor: 'var(--chakra-colors-bg)'
                }}
              >
                {availableUnits.map((unit: string) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Box>
          )}
        </Box>

        <Box flex="1">
          {isEditable && !isStatic && onUpdateIngredient ? (
            <HStack gap={2} align="start">
              <Box flex="1">
                <IngredientNameInput
                  value={ingredient.name}
                  onChange={(value: string, ingredientId?: number, ingredientRecipeId?: number, clearIds?: boolean) => {
                    // Update the ingredient name
                    onUpdateIngredient(index, 'name', value);

                    // If clearIds flag is set, clear all IDs
                    if (clearIds) {
                      if (ingredient.ingredient_id) {
                        onUpdateIngredient(index, 'ingredient_id', undefined);
                      }
                      if (ingredient.ingredient_recipe_id) {
                        onUpdateIngredient(index, 'ingredient_recipe_id', undefined);
                      }
                      if (ingredient.fdc_id) {
                        onUpdateIngredient(index, 'fdc_id', undefined);
                      }
                      return;
                    }

                    // Set ingredient_id if an ingredient was selected
                    if (ingredientId !== undefined) {
                      onUpdateIngredient(index, 'ingredient_id', ingredientId);
                      // Clear ingredient_recipe_id and fdc_id if they exist
                      if (ingredient.ingredient_recipe_id) {
                        onUpdateIngredient(index, 'ingredient_recipe_id', undefined);
                      }
                      if (ingredient.fdc_id) {
                        onUpdateIngredient(index, 'fdc_id', undefined);
                      }
                    }

                    // Set ingredient_recipe_id if a recipe was selected
                    if (ingredientRecipeId !== undefined) {
                      onUpdateIngredient(index, 'ingredient_recipe_id', ingredientRecipeId);
                      // Clear ingredient_id and fdc_id if they exist
                      if (ingredient.ingredient_id) {
                        onUpdateIngredient(index, 'ingredient_id', undefined);
                      }
                      if (ingredient.fdc_id) {
                        onUpdateIngredient(index, 'fdc_id', undefined);
                      }
                    }
                  }}
                  size="sm"
                  placeholder="Ingredient name"
                />
              </Box>
              <Box flex="1">
                <UsdaFoodSelector
                  currentFdcId={ingredient.fdc_id}
                  ingredientName={ingredient.name}
                  onSelect={async (fdcId) => {
                    onUpdateIngredient(index, 'fdc_id', fdcId);
                    // Update via API if the ingredient has an ID
                    if (ingredient.id && fdcId !== undefined) {
                      try {
                        await recipeAPI.updateRecipeIngredient(ingredient.id, { fdc_id: fdcId });
                      } catch (error) {
                        console.error('Failed to update fdc_id:', error);
                      }
                    }
                    // Clear other IDs when USDA food is selected
                    if (fdcId !== undefined) {
                      if (ingredient.ingredient_id) {
                        onUpdateIngredient(index, 'ingredient_id', undefined);
                      }
                      if (ingredient.ingredient_recipe_id) {
                        onUpdateIngredient(index, 'ingredient_recipe_id', undefined);
                      }
                    }
                  }}
                  size="sm"
                />
              </Box>
            </HStack>
          ) : (
            <Text
              color="blue.600"
              _hover={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => {
                if (ingredient.ingredient_id) {
                  navigate(`/ingredients/${ingredient.ingredient_id}`);
                } else if (ingredient.ingredient_recipe_id) {
                  navigate(`/recipes/${ingredient.ingredient_recipe_id}`);
                }
              }}
            >
              {ingredient.name}
            </Text>
          )}
        </Box>

        {showActions && (
          <HStack gap={1}>
            {!isStatic && (
              <IconButton
                size="sm"
                colorScheme="blue"
                variant="ghost"
                aria-label="Calculate ingredient density"
                title="Calculate ingredient density"
                onClick={() => openConversionModal(ingredient)}
              >
                <ConversionIcon />
              </IconButton>
            )}
            {isEditable && !isStatic && onRemoveIngredient && (
              <Button
                size="sm"
                colorScheme="red"
                variant="ghost"
                onClick={() => onRemoveIngredient(index)}
              >
                <DeleteIcon />
              </Button>
            )}
          </HStack>
        )}
      </HStack>

      {/* Density Calculation Modal */}
      <DensityCalculationModal
        isOpen={showConversionModal}
        onClose={closeConversionModal}
        ingredientId={selectedIngredient?.id}
        ingredientName={selectedIngredient?.name}
        currentDensity={selectedIngredient?.density}
      />
    </>
  );
};

// RecipeImages Component


// RecipeIngredients Component
interface RecipeIngredientsProps {
  ingredients: RecipeIngredient[];
  isEditable: boolean;
  onAddIngredient: () => void;
  onRemoveIngredient: (index: number) => void;
  onUpdateIngredient: (index: number, field: keyof RecipeIngredient, value: any) => void;
  onReorderIngredients: (fromIndex: number, toIndex: number) => void;
  multiplier?: number;
  convertedIngredients: Record<number, ConvertedIngredient>;
  setConvertedIngredients: React.Dispatch<React.SetStateAction<Record<number, ConvertedIngredient>>>;
  setAvailableUnits: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  preferredUnitSystem?: 'metric' | 'us_customary';
  setPreferredUnitSystem?: (system: 'metric' | 'us_customary') => void;
  recipeId?: number;
}

interface ConvertedIngredient {
  quantity: number;
  unit: string;
  originalQuantity: number;
  originalUnit: string;
}

const RecipeIngredients: FC<RecipeIngredientsProps> = ({
  ingredients,
  isEditable,
  onAddIngredient,
  onRemoveIngredient,
  onUpdateIngredient,
  onReorderIngredients,
  multiplier = 1.0,
  convertedIngredients,
  setConvertedIngredients,
  setAvailableUnits,
  preferredUnitSystem = 'metric',
  setPreferredUnitSystem,
  recipeId,
}) => {
  const isStatic = recipeAPI.isStaticMode();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Checkbox state management for crossing out ingredients
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(() => {
    if (typeof window !== 'undefined' && recipeId) {
      const stored = localStorage.getItem(`recipe-${recipeId}-checked-ingredients`);
      if (stored) {
        try {
          return new Set(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing checked ingredients from localStorage:', e);
        }
      }
    }
    return new Set();
  });

  // Save checked ingredients to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && recipeId) {
      localStorage.setItem(
        `recipe-${recipeId}-checked-ingredients`,
        JSON.stringify(Array.from(checkedIngredients))
      );
    }
  }, [checkedIngredients, recipeId]);

  const toggleIngredientCheck = (index: number) => {
    setCheckedIngredients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const clearAllChecks = () => {
    setCheckedIngredients(new Set());
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorderIngredients(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };



  // Load available units for each ingredient when not in edit mode
  useEffect(() => {
    if (!isEditable && ingredients.length > 0) {
      const loadAvailableUnits = async () => {
        const newAvailableUnits: Record<number, string[]> = {};
        const newConvertedIngredients: Record<number, ConvertedIngredient> = {};

        try {
          for (let i = 0; i < ingredients.length; i++) {
            const ingredient = ingredients[i];
            const currentUnit = ingredient.unit || 'cup';

            // Get available units based on unit type and ingredient density
            const availableUnitsFromAPI = await getAvailableUnits(currentUnit, ingredient.ingredient_id);

            // Always include the current unit first, then add other available units
            const availableUnits = [currentUnit];
            availableUnitsFromAPI.forEach(unit => {
              if (unit !== currentUnit && !availableUnits.includes(unit)) {
                availableUnits.push(unit);
              }
            });

            newAvailableUnits[i] = availableUnits;

            // Initialize converted ingredients with original values
            newConvertedIngredients[i] = {
              quantity: ingredient.quantity || 1,
              unit: currentUnit,
              originalQuantity: ingredient.quantity || 1,
              originalUnit: currentUnit,
            };
          }
        } catch (error) {
          console.error('Error loading available units:', error);
          // Fallback to common units if API fails
          const fallbackUnits = ['ml', 'cl', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'pint', 'quart', 'gallon', 'g', 'kg', 'mg', 'oz', 'lb'];

          for (let i = 0; i < ingredients.length; i++) {
            const ingredient = ingredients[i];
            const currentUnit = ingredient.unit || 'cup';

            const availableUnits = [currentUnit];
            fallbackUnits.forEach(unit => {
              if (unit !== currentUnit && !availableUnits.includes(unit)) {
                availableUnits.push(unit);
              }
            });

            newAvailableUnits[i] = availableUnits;
            newConvertedIngredients[i] = {
              quantity: ingredient.quantity || 1,
              unit: currentUnit,
              originalQuantity: ingredient.quantity || 1,
              originalUnit: currentUnit,
            };
          }
        }

        setAvailableUnits(newAvailableUnits);
        setConvertedIngredients(newConvertedIngredients);
      };

      loadAvailableUnits();
    }
  }, [isEditable, ingredients]);



  return (
    <Box>
      <Flex align="center" mb={4}>
        <VStack align="start" gap={1}>
          <Text fontSize="lg" fontWeight="semibold">Ingredients</Text>
          {multiplier !== 1.0 && (
            <Text fontSize="sm" color="blue.600" fontWeight="medium">
              Quantities shown for {multiplier.toFixed(1)}x recipe
            </Text>
          )}
        </VStack>
        <Spacer />
        <HStack gap={3}>
          {!isEditable && !isStatic && checkedIngredients.size > 0 && (
            <Button
              size="sm"
              onClick={clearAllChecks}
              colorScheme="gray"
              variant="outline"
              fontSize="xs"
              px={3}
            >
              ✓ Clear All
            </Button>
          )}
          {!isStatic && (
            <Box>
              <Button
                size="sm"
                variant={preferredUnitSystem === 'metric' ? 'solid' : 'outline'}
                colorScheme="blue"
                onClick={() => setPreferredUnitSystem?.(preferredUnitSystem === 'metric' ? 'us_customary' : 'metric')}
                fontSize="xs"
                px={3}
              >
                {preferredUnitSystem === 'metric' ? '📏 Metric' : '🇺🇸 US'}
              </Button>
            </Box>
          )}
          {isEditable && !isStatic && (
            <Button
              size="sm"
              onClick={onAddIngredient}
              colorScheme="blue"
              variant="outline"
            >
              <AddIcon />
              Add Ingredient
            </Button>
          )}
        </HStack>
      </Flex>

      <VStack gap={3} align="stretch">
        {ingredients.map((ingredient, index) => (
          <IngredientItem
            key={index}
            ingredient={ingredient}
            index={index}
            multiplier={multiplier}
            convertedIngredients={convertedIngredients}
            setConvertedIngredients={setConvertedIngredients}
            isEditable={isEditable}
            onUpdateIngredient={onUpdateIngredient}
            onRemoveIngredient={onRemoveIngredient}
            onReorderIngredients={onReorderIngredients}
            showActions={true}
            draggedIndex={draggedIndex}
            dragOverIndex={dragOverIndex}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            baseIndex={0}
            isChecked={checkedIngredients.has(index)}
            onToggleCheck={toggleIngredientCheck}
          />
        ))}
      </VStack>
    </Box>
  );
};

// Density Calculation Modal Component
interface DensityCalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  ingredientId?: number;
  ingredientName?: string;
  currentDensity?: number;
}

const DensityCalculationModal: FC<DensityCalculationModalProps> = ({
  isOpen,
  onClose,
  ingredientId,
  ingredientName,
  currentDensity
}) => {
  console.log('DensityCalculationModal received currentDensity:', currentDensity, 'for ingredient:', ingredientName);
  const [massQuantity, setMassQuantity] = useState('100');
  const [massUnit, setMassUnit] = useState('g');
  const [volumeQuantity, setVolumeQuantity] = useState('250');
  const [volumeUnit, setVolumeUnit] = useState('ml');
  const [calculatedDensity, setCalculatedDensity] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [massUnits, setMassUnits] = useState<string[]>([]);
  const [volumeUnits, setVolumeUnits] = useState<string[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [hasInitializedMass, setHasInitializedMass] = useState(false);

  // Load available units when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadUnits = async () => {
        setUnitsLoading(true);
        try {
          const [massUnitsData, volumeUnitsData] = await Promise.all([
            recipeAPI.getMassUnits(),
            recipeAPI.getVolumeUnits()
          ]);
          setMassUnits(massUnitsData);
          setVolumeUnits(volumeUnitsData);

          // Set default units if they exist in the lists
          if (massUnitsData.length > 0 && !massUnitsData.includes(massUnit)) {
            setMassUnit(massUnitsData.includes('g') ? 'g' : massUnitsData[0]);
          }
          if (volumeUnitsData.length > 0 && !volumeUnitsData.includes(volumeUnit)) {
            setVolumeUnit(volumeUnitsData.includes('ml') ? 'ml' : volumeUnitsData[0]);
          }
        } catch (err) {
          setError('Failed to load available units');
        } finally {
          setUnitsLoading(false);
        }
      };
      loadUnits();
    }
  }, [isOpen]);

  // Initialize mass to match current density when modal opens (only once)
  useEffect(() => {
    if (isOpen && currentDensity && !hasInitializedMass) {
      // Calculate mass that would give the current density with the default volume (100ml)
      // density = mass / volume, so mass = density * volume
      const defaultVolume = parseFloat(volumeQuantity);
      if (defaultVolume > 0) {
        const calculatedMass = currentDensity * defaultVolume;
        setMassQuantity(calculatedMass.toFixed(2));
        setHasInitializedMass(true);
      }
    }
  }, [isOpen, currentDensity, volumeQuantity, hasInitializedMass]);

  // Reset initialization flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasInitializedMass(false);
    }
  }, [isOpen]);

  // Calculate density whenever mass or volume changes
  useEffect(() => {
    const calculateDensity = async () => {
      const massQty = parseFloat(massQuantity);
      const volumeQty = parseFloat(volumeQuantity);

      if (massQty > 0 && volumeQty > 0 && massUnit && volumeUnit) {
        try {
          // Get conversion factors to standard units (g and ml)
          const [massConversion, volumeConversion] = await Promise.all([
            recipeAPI.getConversionFactor(massUnit, 'g'),
            recipeAPI.getConversionFactor(volumeUnit, 'ml')
          ]);

          if (massConversion && volumeConversion) {
            // Convert to standard units (grams and ml)
            const massInGrams = massQty * massConversion.conversion_factor;
            const volumeInMl = volumeQty * volumeConversion.conversion_factor;

            // Calculate density in g/ml
            const density = massInGrams / volumeInMl;
            setCalculatedDensity(density);
          } else {
            // Fallback: assume direct conversion if no conversion found
            setCalculatedDensity(massQty / volumeQty);
          }
        } catch (err) {
          // Fallback calculation
          setCalculatedDensity(massQty / volumeQty);
        }
      } else {
        setCalculatedDensity(null);
      }
    };

    calculateDensity();
  }, [massQuantity, massUnit, volumeQuantity, volumeUnit]);

  const handleSave = async () => {
    if (!calculatedDensity || !ingredientId) {
      setError('Cannot save density - missing required data');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Update ingredient with new density
      await recipeAPI.updateIngredient(ingredientId, { density: calculatedDensity });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save density');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setMassQuantity('100');
    setMassUnit('g');
    setVolumeQuantity('100');
    setVolumeUnit('ml');
    setCalculatedDensity(null);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="blackAlpha.600"
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Box
        bg="bg"
        borderRadius="md"
        p={6}
        maxW="600px"
        width="100%"
        maxH="90vh"
        overflowY="auto"
      >
        <VStack gap={4} align="stretch">
          <Flex justify="space-between" align="center">
            <Heading size="md">
              Calculate Density - {ingredientName}
            </Heading>
            <IconButton
              aria-label="Close modal"
              onClick={handleClose}
              variant="ghost"
              size="sm"
            >
              <CloseIcon />
            </IconButton>
          </Flex>

          {error && (
            <Box p={3} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.400">
              <Text color="red.700" fontSize="sm">{error}</Text>
            </Box>
          )}

          {/* Loading indicator for units */}
          {unitsLoading && (
            <Box p={3} bg="gray.50" borderRadius="md">
              <Text fontSize="sm" color="gray.600">
                Loading available units...
              </Text>
            </Box>
          )}

          {/* Density calculation layout */}
          <VStack>
            <HStack align="center" justify="space-between" gap={4}>
              {/* Volume side */}
              <VStack align="stretch" gap={3} flex={1}>
                <Text fontWeight="semibold" textAlign="center" color="blue.600">
                  Volume
                </Text>
                <HStack gap={2}>
                  <Input
                    type="number"
                    step="any"
                    value={volumeQuantity}
                    onChange={(e) => setVolumeQuantity(e.target.value)}
                    placeholder="100"
                    size="sm"
                    disabled={unitsLoading}
                  />
                  <select
                    value={volumeUnit}
                    onChange={(e) => setVolumeUnit(e.target.value)}
                    disabled={unitsLoading}
                    style={{
                      padding: '0.375rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--chakra-colors-border)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--chakra-colors-bg)'
                    }}
                  >
                    {volumeUnits.map(unit => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </HStack>
              </VStack>

              <VStack align="center" gap={2} minW="50px">
              </VStack>

              {/* Mass side */}
              <VStack align="stretch" gap={3} flex={1}>
                <Text fontWeight="semibold" textAlign="center" color="orange.600">
                  Mass
                </Text>
                <HStack gap={2}>
                  <Input
                    type="number"
                    step="any"
                    value={massQuantity}
                    onChange={(e) => setMassQuantity(e.target.value)}
                    placeholder="100"
                    size="sm"
                    disabled={unitsLoading}
                  />
                  <select
                    value={massUnit}
                    onChange={(e) => setMassUnit(e.target.value)}
                    disabled={unitsLoading}
                    style={{
                      padding: '0.375rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--chakra-colors-border)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--chakra-colors-bg)'
                    }}
                  >
                    {massUnits.map(unit => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </HStack>
              </VStack>
            </HStack>

            <HStack align="flex-end" gap={4}>
              {/* Previous density display */}
              {currentDensity && (
                <VStack align="center" gap={2} minW="120px">
                  <Text fontSize="sm" fontWeight="medium" color="blue.600">
                    Previous Density
                  </Text>
                  <Box
                    p={3}
                    bg="blue.50"
                    borderRadius="md"
                    border="2px solid"
                    borderColor="blue.200"
                    textAlign="center"
                  >
                    <Text
                      fontSize="lg"
                      fontWeight="bold"
                      color="blue.700"
                    >
                      {currentDensity.toFixed(4)}
                    </Text>
                    <Text fontSize="xs" color="blue.600">
                      g/ml
                    </Text>
                  </Box>
                </VStack>
              )}

              {/* Arrow - only show if there's a previous density */}
              {currentDensity && (
                <Box
                  color="gray.400"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  minH="100px"
                  px={3}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                  </svg>
                </Box>
              )}

              {/* New density display */}
              <VStack align="center" gap={2} minW="120px">
                <Text fontSize="sm" fontWeight="medium" color="gray.600">
                  {calculatedDensity ? "New Density" : "Density"}
                </Text>
                <Box
                  p={3}
                  bg={calculatedDensity ? "green.50" : "gray.50"}
                  borderRadius="md"
                  border="2px solid"
                  borderColor={calculatedDensity ? "green.200" : "gray.200"}
                  textAlign="center"
                >
                  <Text
                    fontSize="lg"
                    fontWeight="bold"
                    color={calculatedDensity ? "green.700" : "gray.500"}
                  >
                    {calculatedDensity ? calculatedDensity.toFixed(4) : "—"}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    g/ml
                  </Text>
                </Box>
              </VStack>
            </HStack>
          </VStack>
          {/* Help text */}
          <Box p={3} bg="gray.50" borderRadius="md">
            <Text fontSize="sm" color="gray.700" mb={2} fontWeight="medium">
              💡 How to use:
            </Text>
            <VStack align="start" gap={1} fontSize="xs" color="gray.600">
              <Text>• Measure the same quantity of {ingredientName} by both mass and volume</Text>
              <Text>• Enter the measurements above using your preferred units</Text>
              <Text>• The density will be calculated automatically in g/ml</Text>
              <Text>• This helps convert between weight and volume measurements for this ingredient</Text>
            </VStack>
          </Box>

          <HStack gap={3} justify="flex-end">
            <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleSave}
              disabled={!calculatedDensity || isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Density'}
            </Button>
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
};

// StepTimer Component - Pure timer overlay component
interface StepTimerProps { }

interface StepTimerRef {
  startTimer: (timerId: string, time: number, unit: string) => void;
}

const StepTimer = React.forwardRef<StepTimerRef, StepTimerProps>((_props, ref) => {
  // Local timer state
  const [activeTimers, setActiveTimers] = useState<Record<string, ActiveTimer>>({});
  const [currentTimer, setCurrentTimer] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  // Initialize audio context on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContext) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioContext(ctx);
    }
  }, [audioContext]);

  // Convert time to seconds
  const timeToSeconds = useCallback((time: number, unit: string): number => {
    switch (unit) {
      case 'h': return time * 3600;
      case 'm': return time * 60;
      case 's': return time;
      default: return time * 60; // default to minutes
    }
  }, []);

  // Play notification sound when timer finishes
  const playTimerSound = useCallback(async () => {
    if (!audioContext) return;

    try {
      // Resume audio context if suspended (required for some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Create a simple beep sound using Web Audio API
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set up the beep sound
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800Hz tone
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);

      // Play multiple beeps
      for (let i = 1; i < 3; i++) {
        const nextOscillator = audioContext.createOscillator();
        const nextGainNode = audioContext.createGain();

        nextOscillator.connect(nextGainNode);
        nextGainNode.connect(audioContext.destination);

        const startTime = audioContext.currentTime + (i * 0.7);
        nextOscillator.frequency.setValueAtTime(800, startTime);
        nextGainNode.gain.setValueAtTime(0.3, startTime);
        nextGainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);

        nextOscillator.start(startTime);
        nextOscillator.stop(startTime + 0.5);
      }
    } catch (error) {
      console.error('Error playing timer sound:', error);
    }
  }, [audioContext]);

  // Timer countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTimers(prevTimers => {
        const updatedTimers = { ...prevTimers };
        let hasChanges = false;

        Object.keys(updatedTimers).forEach(timerId => {
          const timer = updatedTimers[timerId];
          if (timer.isRunning && !timer.isFinished && timer.currentTime > 0) {
            updatedTimers[timerId] = {
              ...timer,
              currentTime: Math.max(0, timer.currentTime - 1)
            };
            hasChanges = true;

            // Check if timer just finished
            if (updatedTimers[timerId].currentTime === 0) {
              updatedTimers[timerId].isFinished = true;
              updatedTimers[timerId].isRunning = false;
              playTimerSound();
            }
          }
        });

        return hasChanges ? updatedTimers : prevTimers;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [playTimerSound]);

  // Timer control functions
  const handleTimerStart = useCallback((timerId: string, time: number, unit: string) => {
    initAudioContext();
    const totalSeconds = timeToSeconds(time, unit);

    setActiveTimers(prev => ({
      ...prev,
      [timerId]: {
        id: timerId,
        originalTime: totalSeconds,
        currentTime: totalSeconds,
        unit,
        isRunning: true, // Start immediately when clicked
        isFinished: false
      }
    }));

    setCurrentTimer(timerId);
  }, [timeToSeconds, initAudioContext]);

  const toggleTimer = useCallback((timerId: string) => {
    setActiveTimers(prev => ({
      ...prev,
      [timerId]: {
        ...prev[timerId],
        isRunning: !prev[timerId].isRunning
      }
    }));
  }, []);

  const resetTimer = useCallback((timerId: string) => {
    setActiveTimers(prev => {
      const timer = prev[timerId];
      if (!timer) return prev;

      return {
        ...prev,
        [timerId]: {
          ...timer,
          currentTime: timer.originalTime,
          isRunning: false,
          isFinished: false
        }
      };
    });
  }, []);

  const closeTimer = useCallback(() => {
    setCurrentTimer(null);
  }, []);

  const addMinuteToTimer = useCallback((timerId: string) => {
    setActiveTimers(prev => {
      const timer = prev[timerId];
      if (!timer) return prev;

      return {
        ...prev,
        [timerId]: {
          ...timer,
          originalTime: timer.originalTime + 60,
          currentTime: timer.currentTime + 60,
          // If timer was finished, restart it when time is added
          isFinished: false,
          isRunning: timer.isFinished ? true : timer.isRunning
        }
      };
    });
  }, []);

  // Expose the timer start function to parent via ref
  React.useImperativeHandle(ref, () => ({
    startTimer: handleTimerStart
  }), [handleTimerStart]);

  // Only render overlay when there's an active timer
  if (!currentTimer || !activeTimers[currentTimer]) {
    return null;
  }

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={10}
    >
      <TimerOverlay
        timer={activeTimers[currentTimer]}
        onToggle={() => toggleTimer(currentTimer)}
        onReset={() => resetTimer(currentTimer)}
        onClose={closeTimer}
        onAddMinute={() => addMinuteToTimer(currentTimer)}
      />
    </Box>
  );
});

// InstructionStep Component - Represents a single instruction step
interface InstructionStepProps {
  instruction: Instruction;
  index: number;
  ingredients: RecipeIngredient[];
  multiplier: number;
  convertedIngredients: Record<number, ConvertedIngredient>;
  preferredTemperatureUnit: 'C' | 'F';
  isEditable: boolean;
  onUpdateInstruction?: (index: number, field: keyof Instruction, value: string) => void;
  onRemoveInstruction?: (index: number) => void;
  onAddInstructionImage?: (index: number, imageUrl: string) => void;
  onRemoveInstructionImage?: (index: number) => void;
  onReorderInstructions?: (fromIndex: number, toIndex: number) => void;
  baseNamespace?: string;
  showActions: boolean;
  draggedIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const InstructionStep: FC<InstructionStepProps> = ({
  instruction,
  index,
  ingredients,
  multiplier,
  convertedIngredients,
  preferredTemperatureUnit,
  isEditable,
  onUpdateInstruction,
  onRemoveInstruction,
  onAddInstructionImage,
  onRemoveInstructionImage,
  onReorderInstructions,
  baseNamespace,
  showActions,
  draggedIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const isStatic = recipeAPI.isStaticMode();
  const timerRef = useRef<{ startTimer: (timerId: string, time: number, unit: string) => void } | null>(null);

  // Timer start handler that communicates with StepTimer
  const handleTimerStart = useCallback((timerId: string, time: number, unit: string) => {
    if (timerRef.current) {
      timerRef.current.startTimer(timerId, time, unit);
    }
  }, []);

  return (
    <VStack
      id={`step-${instruction.step}`}
      align="stretch"
      gap={3}
      p={4}
      borderRadius="md"
      bg={dragOverIndex === index ? "blue.50" : "bg"}
      border={dragOverIndex === index ? "2px dashed" : "1px solid"}
      borderColor={dragOverIndex === index ? "blue.400" : "transparent"}
      opacity={draggedIndex === index ? 0.5 : 1}
      transition="all 0.2s"
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <HStack align="flex-start" gap={4}>
        {/* Drag Handle - Left Side */}
        {isEditable && !isStatic && onReorderInstructions && (
          <Box
            minW="24px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="gray.400"
            _hover={{ color: "gray.600" }}
            cursor="grab"
            draggable={true}
            onDragStart={(e) => onDragStart(e, index)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DragHandleIcon />
          </Box>
        )}

        {/* Step Image - Left Side */}
        <Box minW="200px" maxW="200px" position="relative">
          {isEditable && !isStatic && onAddInstructionImage && onRemoveInstructionImage ? (
            <VStack align="stretch" gap={2}>
              <Text fontSize="xs" color="gray.600" fontWeight="medium">
                Step Image (optional)
              </Text>
              <ImageUpload
                onImageUpload={(imageUrl) => onAddInstructionImage(index, imageUrl)}
                onImageRemove={() => onRemoveInstructionImage(index)}
                existingImages={instruction.image ? [instruction.image] : []}
                multiple={false}
                maxImages={1}
                disabled={false}
                namespace={baseNamespace ? `${baseNamespace}/step_${instruction.step}` : undefined}
              />
            </VStack>
          ) : (
            <>
              {/* Step Image */}
              {instruction.image ? (
                <Image
                  src={imagePath(instruction.image)}
                  alt={`Step ${instruction.step} image`}
                  width="200px"
                  height="150px"
                  objectFit="cover"
                  borderRadius="md"
                  border="1px solid"
                  borderColor="gray.200"
                />
              ) : (
                <Box
                  width="200px"
                  height="150px"
                  bg="bg"
                  borderRadius="md"
                  border="2px dashed"
                  borderColor="gray.300"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="gray.500" fontSize="sm" textAlign="center">
                    No image
                  </Text>
                </Box>
              )}

              {/* Timer Overlay */}
              <StepTimer ref={timerRef} />
            </>
          )}
        </Box>

        {/* Step Content - Right Side */}
        <VStack flex="1" align="stretch" gap={2} height="100%">
          <VStack align="flex-start" gap={1} height="100%">
            <HStack gap={2} align="center" justify="space-between" width="100%">
              <Link
                href={`#step-${instruction.step}`}
                colorScheme="blue"
                cursor="pointer"
                display="flex"
                alignItems="center"
                gap={1}
                fontSize="md"
                fontWeight={"semibold"}
              >
                # Step {instruction.step}
              </Link>

              <HStack>
                {isEditable && !isStatic && onUpdateInstruction ? (
                  <HStack>
                    <Text fontSize="xs" color="gray.600" mb={1}>Duration</Text>
                    <Input
                      value={instruction.duration || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateInstruction(index, 'duration', e.target.value)}
                      placeholder="e.g., 5 minutes"
                      size="sm"
                    />
                  </HStack>
                ) : (<Text>{instruction.duration}</Text>)
                }

                {isEditable && !isStatic && showActions && onRemoveInstruction && (
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => onRemoveInstruction(index)}
                  >
                    <DeleteIcon />
                  </Button>
                )}
              </HStack>
            </HStack>

            <VStack flex="1" align="stretch" gap={1} width="100%" height="100%">
              {isEditable && !isStatic && onUpdateInstruction ? (
                <Textarea
                  value={instruction.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateInstruction(index, 'description', e.target.value)}
                  placeholder="Enter instruction..."
                  minH="80px"
                  resize="vertical"
                  width="100%"
                />
              ) : (
                <InstructionTextRenderer
                  text={instruction.description}
                  ingredients={ingredients}
                  multiplier={multiplier}
                  convertedIngredients={convertedIngredients}
                  preferredTemperatureUnit={preferredTemperatureUnit}
                  onTimerStart={handleTimerStart}
                  activeTimers={{}}
                  stepIndex={index}
                />
              )}
            </VStack>
          </VStack>
        </VStack>
      </HStack>
    </VStack>
  );
};

// RecipeInstructions Component
interface RecipeInstructionsProps {
  instructions: Instruction[];
  ingredients: RecipeIngredient[];
  isEditable: boolean;
  onAddInstruction: () => void;
  onRemoveInstruction: (index: number) => void;
  onUpdateInstruction: (index: number, field: keyof Instruction, value: string) => void;
  onAddInstructionImage: (index: number, imageUrl: string) => void;
  onRemoveInstructionImage: (index: number) => void;
  onReorderInstructions: (fromIndex: number, toIndex: number) => void;
  baseNamespace?: string;
  multiplier?: number;
  convertedIngredients?: Record<number, ConvertedIngredient>;
  preferredTemperatureUnit?: 'C' | 'F';
}

const RecipeInstructions: FC<RecipeInstructionsProps> = ({
  instructions,
  ingredients,
  isEditable,
  onAddInstruction,
  onRemoveInstruction,
  onUpdateInstruction,
  onAddInstructionImage,
  onRemoveInstructionImage,
  onReorderInstructions,
  baseNamespace,
  multiplier = 1,
  convertedIngredients = {},
  preferredTemperatureUnit = 'C',
}) => {

  const isStatic = recipeAPI.isStaticMode();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      onReorderInstructions(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <Box>
      <Flex align="center" mb={4}>
        <Text fontSize="lg" fontWeight="semibold">Instructions</Text>
      </Flex>

      {isEditable && !isStatic && (
        <Box p={3} bg="blue.50" borderRadius="md" mb={4}>
          <Text fontSize="sm" color="blue.700" mb={2}>
            💡 <strong>Tip:</strong> You can use special commands in your instructions:
          </Text>
          <VStack align="start" gap={1} fontSize="sm" color="blue.700">
            <Text>• <strong>Ingredients:</strong> <code>@tomatoes{`{1/4}`}</code> or <code>@flour{`{2}`}</code> or just <code>@salt</code></Text>
            <Text>• <strong>Temperatures:</strong> <code>$temp{`{180}{C}`}</code> or <code>$temp{`{350}{F}`}</code> (clickable to convert)</Text>
            <Text>• <strong>Times:</strong> <code>$time{`{40m}`}</code> or <code>$time{`{2h}`}</code> or <code>$time{`{30s}`}</code> (clickable to start timer)</Text>
          </VStack>
        </Box>
      )}

      <VStack gap={4} align="stretch">
        {instructions.map((instruction, index) => (
          <InstructionStep
            key={index}
            instruction={instruction}
            index={index}
            ingredients={ingredients}
            multiplier={multiplier}
            convertedIngredients={convertedIngredients}
            preferredTemperatureUnit={preferredTemperatureUnit}
            isEditable={isEditable}
            onUpdateInstruction={onUpdateInstruction}
            onRemoveInstruction={onRemoveInstruction}
            onAddInstructionImage={onAddInstructionImage}
            onRemoveInstructionImage={onRemoveInstructionImage}
            onReorderInstructions={onReorderInstructions}
            baseNamespace={baseNamespace}
            showActions={true}
            draggedIndex={draggedIndex}
            dragOverIndex={dragOverIndex}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* Add Step button at the end of instructions in edit mode */}
        {isEditable && !isStatic && (
          <Box display="flex" justifyContent="center" mt={4}>
            <Button
              size="sm"
              onClick={onAddInstruction}
              colorScheme="blue"
              variant="outline"
            >
              <AddIcon />
              Add Step
            </Button>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

// ComposedRecipeDisplay Component - Shows ingredients and instructions grouped by recipe
interface ComposedRecipeDisplayProps {
  recipe: RecipeData;
  multiplier?: number;
  convertedIngredients?: Record<number, ConvertedIngredient>;
  preferredTemperatureUnit?: 'C' | 'F';
}

const ComposedRecipeDisplay: FC<ComposedRecipeDisplayProps> = ({
  recipe,
  multiplier = 1,
  convertedIngredients = {},
  preferredTemperatureUnit = 'C'
}) => {
  // Group ingredients by their source recipe
  const groupedIngredients = React.useMemo(() => {
    const groups: {
      topLevel: RecipeIngredient[];
      subRecipes: { [recipeId: number]: { recipe: any; ingredients: RecipeIngredient[]; originalIngredient: RecipeIngredient } };
    } = {
      topLevel: [],
      subRecipes: {}
    };

    recipe.ingredients?.forEach((ingredient) => {
      if (ingredient.ingredient_recipe_id && (ingredient as any).recipe) {
        const recipeId = ingredient.ingredient_recipe_id;
        if (!groups.subRecipes[recipeId]) {
          groups.subRecipes[recipeId] = {
            recipe: (ingredient as any).recipe,
            ingredients: [],
            originalIngredient: ingredient
          };
        }

        // Add sub-recipe ingredients to the group with scaling
        if ((ingredient as any).recipe.ingredients) {
          (ingredient as any).recipe.ingredients.forEach((subIngredient: any) => {
            groups.subRecipes[recipeId].ingredients.push({
              ...subIngredient,
              name: subIngredient.name,
              quantity: (subIngredient.quantity || 1) * (ingredient.quantity || 1),
              unit: subIngredient.unit || 'unit'
            });
          });
        }
      } else {
        // Top-level ingredient
        groups.topLevel.push(ingredient);
      }
    });

    return groups;
  }, [recipe.ingredients, multiplier]);

  // Group instructions by their source recipe
  const groupedInstructions = React.useMemo(() => {
    const groups: {
      subRecipes: { [recipeId: number]: { recipe: any; instructions: any[] } };
      topLevel: any[];
    } = {
      subRecipes: {},
      topLevel: recipe.instructions || []
    };

    recipe.ingredients?.forEach((ingredient) => {
      if (ingredient.ingredient_recipe_id && (ingredient as any).recipe) {
        const recipeId = ingredient.ingredient_recipe_id;
        if (!groups.subRecipes[recipeId]) {
          groups.subRecipes[recipeId] = {
            recipe: (ingredient as any).recipe,
            instructions: (ingredient as any).recipe.instructions || []
          };
        }
      }
    });

    return groups;
  }, [recipe.ingredients, recipe.instructions]);

  return (
    <VStack gap={8} align="stretch">
      {/* Ingredients Section */}
      <Box>
        <Text fontSize="lg" fontWeight="semibold" mb={4}>Ingredients</Text>

        {/* Top-level ingredients */}
        {groupedIngredients.topLevel.length > 0 && (
          <Box mb={8}>
            <Text fontSize="md" fontWeight="medium" color="blue.600" mb={4} borderBottom="2px solid" borderColor="blue.200" pb={2}>
              {recipe.title}
            </Text>
            <VStack gap={3} align="stretch">
              {groupedIngredients.topLevel.map((ingredient, index) => (
                <IngredientItem
                  key={index}
                  ingredient={ingredient}
                  index={index}
                  multiplier={multiplier}
                  convertedIngredients={convertedIngredients}
                  setConvertedIngredients={() => { }}
                  isEditable={false}
                  showActions={false}
                  draggedIndex={null}
                  dragOverIndex={null}
                  onDragStart={() => { }}
                  onDragOver={() => { }}
                  onDragLeave={() => { }}
                  onDrop={() => { }}
                  onDragEnd={() => { }}
                  baseIndex={0}
                  isChecked={false}
                  onToggleCheck={undefined}
                />
              ))}
            </VStack>
          </Box>
        )}

        {/* Sub-recipe ingredients */}
        {Object.entries(groupedIngredients.subRecipes).map(([recipeId, group]) => (
          <Box key={recipeId} mb={8}>
            <HStack mb={4} align="center">
              <Text fontSize="md" fontWeight="medium" color="green.600" borderBottom="2px solid" borderColor="green.200" pb={2}>
                {group.recipe.title}
              </Text>
              <Badge colorScheme="green" size="sm">
                {formatQuantity(group.originalIngredient.quantity || 1, group.originalIngredient.unit || 'unit')} × recipe
              </Badge>
            </HStack>
            <VStack gap={3} align="stretch">
              {group.ingredients.map((ingredient, index) => (
                <IngredientItem
                  key={index}
                  ingredient={ingredient}
                  index={index}
                  multiplier={multiplier}
                  convertedIngredients={{}}
                  setConvertedIngredients={() => { }}
                  isEditable={false}
                  showActions={false}
                  draggedIndex={null}
                  dragOverIndex={null}
                  onDragStart={() => { }}
                  onDragOver={() => { }}
                  onDragLeave={() => { }}
                  onDrop={() => { }}
                  onDragEnd={() => { }}
                  baseIndex={0}
                  isChecked={false}
                  onToggleCheck={undefined}
                />
              ))}
            </VStack>
          </Box>
        ))}
      </Box>

      <Box height="1px" bg="gray.200" />

      {/* Instructions Section */}
      <Box>
        <Text fontSize="lg" fontWeight="semibold" mb={4}>Instructions</Text>

        {/* Sub-recipe instructions first */}
        {Object.entries(groupedInstructions.subRecipes).map(([recipeId, group]) => (
          <Box key={recipeId} mb={8}>
            <Text fontSize="md" fontWeight="medium" color="green.600" mb={4} borderBottom="2px solid" borderColor="green.200" pb={2}>
              {group.recipe.title}
            </Text>
            <VStack gap={4} align="stretch">
              {group.instructions.map((instruction, index) => (
                <InstructionStep
                  key={index}
                  instruction={instruction}
                  index={index}
                  ingredients={group.recipe.ingredients || []}
                  multiplier={multiplier}
                  convertedIngredients={{}}
                  preferredTemperatureUnit={preferredTemperatureUnit}
                  isEditable={false}
                  showActions={false}
                  draggedIndex={null}
                  dragOverIndex={null}
                  onDragStart={() => { }}
                  onDragOver={() => { }}
                  onDragLeave={() => { }}
                  onDrop={() => { }}
                  onDragEnd={() => { }}
                />
              ))}
            </VStack>
          </Box>
        ))}

        {/* Top-level instructions last */}
        {groupedInstructions.topLevel.length > 0 && (
          <Box mb={8}>
            <Text fontSize="md" fontWeight="medium" color="blue.600" mb={4} borderBottom="2px solid" borderColor="blue.200" pb={2}>
              {recipe.title}
            </Text>
            <VStack gap={4} align="stretch">
              {groupedInstructions.topLevel.map((instruction, index) => (
                <InstructionStep
                  key={index}
                  instruction={instruction}
                  index={index}
                  ingredients={recipe.ingredients || []}
                  multiplier={multiplier}
                  convertedIngredients={convertedIngredients}
                  preferredTemperatureUnit={preferredTemperatureUnit}
                  isEditable={false}
                  showActions={false}
                  draggedIndex={null}
                  dragOverIndex={null}
                  onDragStart={() => { }}
                  onDragOver={() => { }}
                  onDragLeave={() => { }}
                  onDrop={() => { }}
                  onDragEnd={() => { }}
                />
              ))}
            </VStack>
          </Box>
        )}
      </Box>
    </VStack>
  );
};

// RecipeCategories Component
interface RecipeCategoriesProps {
  categories: any[];
  isEditable: boolean;
  onAddCategory: () => void;
  onRemoveCategory: (categoryId: number) => void;
  onUpdateCategory: (categoryId: number, field: string, value: string) => void;
}

const RecipeCategories: FC<RecipeCategoriesProps> = ({
  categories,
  isEditable,
  onAddCategory,
  onRemoveCategory,
  onUpdateCategory,
}) => {
  const isStatic = recipeAPI.isStaticMode();

  return (
    <Box>
      <Flex align="center" mb={4}>
        <Text fontSize="lg" fontWeight="semibold">Categories</Text>
        <Spacer />
        {isEditable && !isStatic && (
          <Button
            size="sm"
            onClick={onAddCategory}
            colorScheme="blue"
            variant="outline"
          >
            <AddIcon />
            Add Category
          </Button>
        )}
      </Flex>

      {categories && categories.length > 0 ? (
        <VStack gap={3} align="stretch">
          {categories.map((category) => (
            <HStack key={category.id} gap={4} align="center">
              {isEditable && !isStatic ? (
                <>
                  <Box flex="1">
                    <Input
                      value={category.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateCategory(category.id!, 'name', e.target.value)}
                      placeholder="Category name"
                      size="sm"
                    />
                  </Box>
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => onRemoveCategory(category.id!)}
                  >
                    <DeleteIcon />
                  </Button>
                </>
              ) : (
                <Badge colorScheme="green" variant="subtle" fontSize="sm" px={3} py={1}>
                  {category.name}
                </Badge>
              )}
            </HStack>
          ))}
        </VStack>
      ) : (
        !isEditable && (
          <Text color="gray.500" fontSize="sm">No categories assigned</Text>
        )
      )}
    </Box>
  );
};

// Timer Overlay Component for Step Images
interface TimerOverlayProps {
  timer: ActiveTimer;
  onToggle: () => void;
  onReset: () => void;
  onClose: () => void;
  onAddMinute: () => void;
}

const TimerOverlay: FC<TimerOverlayProps> = ({ timer, onToggle, onReset, onClose, onAddMinute }) => {
  const formatTimerDisplay = (timeInSeconds: number): string => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  const getProgressPercentage = (): number => {
    if (timer.originalTime === 0) return 100;
    return ((timer.originalTime - timer.currentTime) / timer.originalTime) * 100;
  };

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="blackAlpha.700"
      borderRadius="md"
      display="flex"
      alignItems="center"
      justifyContent="center"
      zIndex={10}
    >
      {/* Compact Control buttons */}
      <HStack gap={2} align="stretch" justify="space-between" position="absolute" left="5%" top="5%" width="90%">
        <Button
          size="xs"
          colorScheme="blue"
          onClick={onAddMinute}
          title="Add 1 minute"
        >
          <AddIcon />
        </Button>

        <Button
          aria-label="Close timer"
          size="xs"
          variant="ghost"
          color="white"
          _hover={{ bg: "whiteAlpha.200" }}
          onClick={onClose}
          position="absolute"
          top={"-10px"}
          right={"-15px"}
        >
          <CloseIcon />
        </Button>
      </HStack>

      {/* Compact Progress Ring */}
      <Box position="absolute" top="10%">
        <svg width="120" height="120">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke="whiteAlpha.300"
            strokeWidth="6"
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r="50"
            stroke={timer.isFinished ? "red.400" : timer.isRunning ? "blue.500" : "gray.400"}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 50}`}
            strokeDashoffset={`${2 * Math.PI * 50 - (2 * Math.PI * 50 * getProgressPercentage() / 100)}`}
            style={{
              transition: 'stroke-dashoffset 1s ease-in-out',
              transform: 'rotate(-90deg)',
              transformOrigin: '60px 60px'
            }}
          />
        </svg>
        <Box
          position="absolute"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          textAlign="center"
        >
          <Text
            fontSize="lg"
            fontWeight="bold"
            color={timer.isFinished ? "red.300" : "white"}
          >
            {formatTimerDisplay(timer.currentTime)}
          </Text>
          <Text fontSize="xs" color="whiteAlpha.800">
            {timer.isFinished ? "Done!" : timer.isRunning ? "Running" : "Paused"}
          </Text>
        </Box>
      </Box>

      {/* Compact Control buttons */}
      <HStack gap={2} align="stretch" justify="space-between" position="absolute" left="5%" bottom="5%" width="90%">
        <Button
          size="xs"
          colorScheme={timer.isRunning ? "orange" : "green"}
          onClick={onToggle}
        >
          {timer.isRunning ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button size="xs" color="white" onClick={onReset}>
          <ResetIcon />
        </Button>
      </HStack>
    </Box>
  );
};

interface RecipeProps {
  initialRecipe?: RecipeData;
  isAuthorized?: boolean;
  onSave?: (recipe: RecipeData) => void;
  onDelete?: (recipeId: number) => void;
}

const Recipe: FC<RecipeProps> = ({
  initialRecipe,
  isAuthorized = false,
  onSave,
  onDelete,
}) => {
  const isStatic = recipeAPI.isStaticMode();
  const [isEditable, setIsEditable] = useState(!initialRecipe && !isStatic); // New recipe starts in edit mode, but not in static mode
  const [recipeMultiplier, setRecipeMultiplier] = useState<number | string>(1.0); // Default multiplier is 1.0
  const [showComposedView, setShowComposedView] = useState(true); // Toggle for composed recipe view - default to grouped view

  // State for converted ingredient values (shared between components)
  const [convertedIngredients, setConvertedIngredients] = useState<Record<number, ConvertedIngredient>>({});
  // State for available units for each ingredient
  const [, setAvailableUnits] = useState<Record<number, string[]>>({});
  // State for preferred temperature unit
  const [preferredTemperatureUnit] = useState<'C' | 'F'>('C');
  // State for preferred unit system with localStorage persistence
  const [preferredUnitSystem, setPreferredUnitSystem] = useState<'metric' | 'us_customary'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('unitSystem');
      return (stored === 'metric' || stored === 'us_customary') ? stored : 'metric';
    }
    return 'metric';
  });

  // Update localStorage when unit system changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('unitSystem', preferredUnitSystem);
    }
  }, [preferredUnitSystem]);



  // Handle step navigation from URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#step-')) {
        const stepNumber = hash.replace('#step-', '');
        const stepElement = document.getElementById(`step-${stepNumber}`);
        if (stepElement) {
          stepElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
          // Add a brief highlight effect
          stepElement.style.transition = 'background-color 0.3s ease';
          stepElement.style.backgroundColor = 'var(--chakra-colors-yellow-100)';
          setTimeout(() => {
            stepElement.style.backgroundColor = '';
          }, 2000);
        }
      }
    };

    // Handle initial load
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Helper to get the effective multiplier value for calculations
  const getEffectiveMultiplier = () => {
    const numValue = typeof recipeMultiplier === 'string' ? parseFloat(recipeMultiplier) : recipeMultiplier;
    return isNaN(numValue) || numValue <= 0 ? 1.0 : numValue;
  };

  // Helper to check if recipe has composed ingredients (sub-recipes)
  const hasComposedIngredients = () => {
    return recipe.ingredients?.some(ingredient => ingredient.ingredient_recipe_id && ingredient.recipe) || false;
  };

  // Helper to generate temporary IDs for new categories
  const generateTempId = () => Math.floor(Math.random() * 1000000) * -1; // Negative numbers for temp IDs

  const [recipe, setRecipe] = useState<RecipeData>(() => {
    const baseRecipe = initialRecipe || {
      title: 'New Recipe',
      description: 'Enter recipe description...',
      instructions: [{ step: '1', description: 'Add your first step here...', duration: '' }],
      prep_time: 15,
      cook_time: 30,
      servings: 4,
      ingredients: [{ name: 'Enter ingredient', quantity: 1, unit: 'cup' }],
      categories: [],
      images: [],
    };

    // Ensure recipe has proper structure
    const transformedRecipe = {
      ...baseRecipe,
      categories: baseRecipe.categories || [],
      ingredients: baseRecipe.ingredients || []
    };

    return transformedRecipe;
  });

  // Update document title when recipe title changes
  useEffect(() => {
    if (recipe.title && recipe.title !== 'New Recipe') {
      document.title = recipe.title;
    } else if (isEditable && !initialRecipe) {
      document.title = 'Create Recipe';
    } else {
      document.title = 'Recipe';
    }
  }, [recipe.title, isEditable, initialRecipe]);

  // Load available units for each ingredient when not in edit mode
  useEffect(() => {
    if (!isEditable && recipe.ingredients && recipe.ingredients.length > 0) {
      const loadAvailableUnits = async () => {
        const newAvailableUnits: Record<number, string[]> = {};
        const newConvertedIngredients: Record<number, ConvertedIngredient> = {};

        try {
          for (let i = 0; i < (recipe.ingredients?.length || 0); i++) {
            const ingredient = recipe.ingredients && recipe.ingredients[i];
            if (ingredient) {
              const currentUnit = ingredient.unit || 'cup';

              // Get available units based on unit type and ingredient density
              const availableUnitsFromAPI = await getAvailableUnits(currentUnit, ingredient.ingredient_id);

              // Always include the current unit first, then add other available units
              const availableUnits = [currentUnit];
              availableUnitsFromAPI.forEach(unit => {
                if (unit !== currentUnit && !availableUnits.includes(unit)) {
                  availableUnits.push(unit);
                }
              });

              newAvailableUnits[i] = availableUnits;

              // Initialize converted ingredients with original values
              newConvertedIngredients[i] = {
                quantity: ingredient.quantity || 1,
                unit: currentUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              };
            }
          }
        } catch (error) {
          console.error('Error loading available units:', error);
          // Fallback to common units if API fails
          const fallbackUnits = ['ml', 'cl', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'pint', 'quart', 'gallon', 'g', 'kg', 'mg', 'oz', 'lb'];

          for (let i = 0; i < (recipe.ingredients?.length || 0); i++) {
            const ingredient = recipe.ingredients && recipe.ingredients[i];
            if (ingredient) {
              const currentUnit = ingredient.unit || 'cup';

              const availableUnits = [currentUnit];
              fallbackUnits.forEach(unit => {
                if (unit !== currentUnit && !availableUnits.includes(unit)) {
                  availableUnits.push(unit);
                }
              });

              newAvailableUnits[i] = availableUnits;
              newConvertedIngredients[i] = {
                quantity: ingredient.quantity || 1,
                unit: currentUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              };
            }
          }
        }

        setAvailableUnits(newAvailableUnits);
        setConvertedIngredients(newConvertedIngredients);
      };

      loadAvailableUnits();
    }
  }, [isEditable, recipe.ingredients]);

  // Convert ingredient units when unit system changes
  useEffect(() => {
    const convertIngredientUnits = async () => {
      if (!recipe.ingredients || recipe.ingredients.length === 0) return;

      const newConvertedIngredients: Record<number, ConvertedIngredient> = {};

      // Process each ingredient conversion
      const conversionPromises = recipe.ingredients.map(async (ingredient, i) => {
        const currentUnit = ingredient.unit || 'cup';
        const targetUnit = await getTargetUnitForIngredient(ingredient, preferredUnitSystem);

        if (targetUnit && targetUnit !== currentUnit && ingredient.ingredient_id) {
          try {
            // Convert to the equivalent unit in the selected system
            const convertedQuantity = await convert(
              ingredient.quantity || 1,
              currentUnit,
              targetUnit,
              ingredient.ingredient_id
            );

            return {
              index: i,
              conversion: {
                quantity: convertedQuantity,
                unit: targetUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              }
            };
          } catch (error) {
            console.log(`Could not convert ${currentUnit} to ${targetUnit} for ingredient ${ingredient.name}:`, error);
            // If conversion fails, keep original unit
            return {
              index: i,
              conversion: {
                quantity: ingredient.quantity || 1,
                unit: currentUnit,
                originalQuantity: ingredient.quantity || 1,
                originalUnit: currentUnit,
              }
            };
          }
        } else {
          // No conversion needed or target unit same as current, keep original unit
          return {
            index: i,
            conversion: {
              quantity: ingredient.quantity || 1,
              unit: currentUnit,
              originalQuantity: ingredient.quantity || 1,
              originalUnit: currentUnit,
            }
          };
        }
      });

      // Wait for all conversions to complete
      const conversions = await Promise.all(conversionPromises);

      // Apply all conversions to the result object
      conversions.forEach(({ index, conversion }) => {
        newConvertedIngredients[index] = conversion;
      });

      setConvertedIngredients(newConvertedIngredients);
    };

    // Only convert if we're not in edit mode and have ingredients
    if (!isEditable && recipe.ingredients && recipe.ingredients.length > 0) {
      convertIngredientUnits();
    }
  }, [preferredUnitSystem, recipe.ingredients, isEditable]);

  const addIngredient = useCallback(() => {
    const newIngredient: RecipeIngredient = {
      name: 'New ingredient',
      quantity: 1,
      unit: 'cup'
    };
    setRecipe(prev => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), newIngredient]
    }));
  }, []);

  const removeIngredient = useCallback((index: number) => {
    setRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients?.filter((_, i) => i !== index) || []
    }));
  }, []);

  const addCategory = useCallback(() => {
    const newCategory = {
      id: generateTempId(), // Use negative number for temporary ID
      name: 'New Category',
      description: ''
    };
    setRecipe(prev => ({
      ...prev,
      categories: [...(prev.categories || []), newCategory]
    }));
  }, []);

  const addInstruction = useCallback(() => {
    const newStep = ((recipe.instructions?.length || 0) + 1).toString();
    const newInstruction: Instruction = {
      step: newStep,
      description: 'Add instruction here...',
      duration: ''
    };
    setRecipe(prev => ({
      ...prev,
      instructions: [...(prev.instructions || []), newInstruction]
    }));
  }, [recipe.instructions?.length]);

  const removeInstruction = useCallback((index: number) => {
    setRecipe(prev => {
      const filteredInstructions = prev.instructions?.filter((_, i) => i !== index) || [];

      // Update step numbers to reflect new order
      const updatedInstructions = filteredInstructions.map((instruction, index) => ({
        ...instruction,
        step: (index + 1).toString()
      }));

      return {
        ...prev,
        instructions: updatedInstructions
      };
    });
  }, []);

  const reorderInstructions = useCallback((fromIndex: number, toIndex: number) => {
    setRecipe(prev => {
      const instructions = [...(prev.instructions || [])];
      const [movedInstruction] = instructions.splice(fromIndex, 1);
      instructions.splice(toIndex, 0, movedInstruction);

      // Update step numbers to reflect new order
      const updatedInstructions = instructions.map((instruction, index) => ({
        ...instruction,
        step: (index + 1).toString()
      }));

      return {
        ...prev,
        instructions: updatedInstructions
      };
    });
  }, []);

  const reorderIngredients = useCallback((fromIndex: number, toIndex: number) => {
    setRecipe(prev => {
      const ingredients = [...(prev.ingredients || [])];
      const [movedIngredient] = ingredients.splice(fromIndex, 1);
      ingredients.splice(toIndex, 0, movedIngredient);

      return {
        ...prev,
        ingredients: ingredients
      };
    });
  }, []);

  const removeCategory = useCallback((categoryId: number) => {
    setRecipe(prev => ({
      ...prev,
      categories: prev.categories?.filter(cat => cat.id !== categoryId) || []
    }));
  }, []);

  const handleSave = () => {
    if (onSave) {
      // Validate that no recipe references itself as an ingredient (only for existing recipes)
      if (recipe.id) {
        const selfReferencingIngredients = recipe.ingredients?.filter(ing =>
          (ing.ingredient_recipe_id === recipe.id)
        ) || [];

        if (selfReferencingIngredients.length > 0) {
          alert("Error: A recipe cannot reference itself as an ingredient. Please remove the self-reference.");
          return;
        }
      }

      // Validate all ingredient quantities are valid numbers
      const invalidIngredients = recipe.ingredients?.filter(ing =>
        !ing.quantity || isNaN(ing.quantity) || ing.quantity <= 0
      ) || [];

      if (invalidIngredients.length > 0) {
        alert("Error: Some ingredients have invalid quantities. Please check all quantity fields contain valid numbers greater than 0.");
        return;
      }

      // Ensure we have the proper data structure for the API
      const recipeToSave: RecipeData = {
        ...recipe,
        // Ensure instructions is an array
        instructions: recipe.instructions || [],
        // Ensure ingredients exist and have proper structure
        ingredients: recipe.ingredients?.map(ing => ({
          name: ing.name,
          quantity: ing.quantity || 1,
          unit: ing.unit || 'unit',
          // Include ingredient_id if it exists
          ...(ing.ingredient_id && { ingredient_id: ing.ingredient_id }),
          // Include ingredient_recipe_id if it exists (for recipes used as ingredients)
          // CRITICAL: Never allow self-reference for existing recipes (already validated above)
          ...(ing.ingredient_recipe_id && (!recipe.id || ing.ingredient_recipe_id !== recipe.id) && { ingredient_recipe_id: ing.ingredient_recipe_id }),
          // Include fdc_id if it exists
          ...(ing.fdc_id && { fdc_id: ing.fdc_id }),
        })) || [],
        // Ensure categories exist
        categories: recipe.categories || [],
        // Ensure images exist
        images: recipe.images || []
      };
      onSave(recipeToSave);
    }
    setIsEditable(false);
  };

  const handleCancel = () => {
    if (initialRecipe) {
      setRecipe(initialRecipe);
      setIsEditable(false);
    }
  };

  const updateCategoryStable = useCallback((categoryId: number, field: string, value: string) => {
    setRecipe(prev => ({
      ...prev,
      categories: prev.categories?.map(cat =>
        cat.id === categoryId ? { ...cat, [field]: value } : cat
      ) || []
    }));
  }, []);

  const updateIngredientStable = useCallback((index: number, field: keyof RecipeIngredient, value: any) => {
    setRecipe(prev => ({
      ...prev,
      ingredients: prev.ingredients?.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      ) || []
    }));
  }, []);

  const updateInstructionStable = useCallback((index: number, field: keyof Instruction, value: string) => {
    setRecipe(prev => ({
      ...prev,
      instructions: prev.instructions?.map((inst, i) =>
        i === index ? { ...inst, [field]: value } : inst
      ) || []
    }));
  }, []);

  // Image handling functions
  const addRecipeImage = useCallback((imageUrl: string) => {
    setRecipe(prev => ({
      ...prev,
      images: [...(prev.images || []), imageUrl]
    }));
  }, []);

  const removeRecipeImage = useCallback((imageUrl: string) => {
    setRecipe(prev => ({
      ...prev,
      images: prev.images?.filter(img => img !== imageUrl) || []
    }));
  }, []);

  const addInstructionImage = useCallback((index: number, imageUrl: string) => {
    setRecipe(prev => ({
      ...prev,
      instructions: prev.instructions?.map((inst, i) =>
        i === index ? { ...inst, image: imageUrl } : inst
      ) || []
    }));
  }, []);

  const removeInstructionImage = useCallback((index: number) => {
    setRecipe(prev => ({
      ...prev,
      instructions: prev.instructions?.map((inst, i) =>
        i === index ? { ...inst, image: undefined } : inst
      ) || []
    }));
  }, []);

  return (
    <Box maxW="4xl" mx="auto" p={6} borderWidth="1px" borderRadius="lg" shadow="lg" bg="bg">
      <VStack gap={6} align="stretch" className='recipe-cls'>
        {/* Static Mode Notice */}
        {isStatic && (
          <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontWeight="medium" color="blue.800" mb={1}>
              📖 Read-Only Mode
            </Text>
            <Text fontSize="sm" color="blue.700">
              This is a static version of the recipe website. Editing, creating, and deleting recipes is not available.
            </Text>
          </Box>
        )}

        {/* Header with Title and Controls */}
        <Flex align="center" wrap="wrap" gap={4}>
          <Box flex="1">
            {isEditable && !isStatic ? (
              <Input
                value={recipe.title}
                onChange={(e) => setRecipe(prev => ({ ...prev, title: e.target.value }))}
                fontSize="2xl"
                fontWeight="bold"
                border="none"
                px={0}
                _focus={{ boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)" }}
                placeholder="Recipe title"
              />
            ) : (
              <Text fontSize="2xl" fontWeight="bold" className="recipe-title">
                {recipe.title}
              </Text>
            )}
          </Box>

          {isAuthorized && !isStatic && (
            <HStack gap={2}>
              <Flex align="center" gap={2}>
                <Text fontSize="sm">Edit Mode</Text>
                <Button
                  size="sm"
                  variant={isEditable ? 'solid' : 'outline'}
                  colorScheme="blue"
                  onClick={() => setIsEditable(!isEditable)}
                >
                  {isEditable ? 'View' : 'Edit'}
                </Button>
              </Flex>

              {/* Composed View Toggle - only show if recipe has sub-recipes */}
              {!isEditable && hasComposedIngredients() && (
                <Flex align="center" gap={2}>
                  <Text fontSize="sm">Composed View</Text>
                  <Button
                    size="sm"
                    variant={showComposedView ? 'solid' : 'outline'}
                    colorScheme="green"
                    onClick={() => setShowComposedView(!showComposedView)}
                  >
                    {showComposedView ? 'Grouped' : 'Flat'}
                  </Button>
                </Flex>
              )}

              {isEditable && (
                <HStack gap={2}>
                  <Button
                    colorScheme="green"
                    size="sm"
                    onClick={handleSave}
                  >
                    <CheckIcon />
                    Save
                  </Button>
                  {initialRecipe && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                    >
                      <CloseIcon />
                      Cancel
                    </Button>
                  )}
                </HStack>
              )}

              {!isEditable && recipe.id && onDelete && (
                <Button
                  variant="outline"
                  colorScheme="red"
                  size="sm"
                  onClick={() => onDelete(recipe.id!)}
                >
                  <DeleteIcon />
                  Delete
                </Button>
              )}
            </HStack>
          )}
        </Flex>

        {/* Recipe Showcase and Info */}
        <HStack align="flex-start" gap={6} mb={6}>
          {/* Recipe Images Component - Larger Size */}
          <Box flex="1">
            {isEditable && !isStatic ? (
              <ImageUpload
                onImageUpload={addRecipeImage}
                onImageRemove={removeRecipeImage}
                existingImages={recipe.images || []}
                multiple={true}
                maxImages={5}
                disabled={false}
                namespace={recipe.id ? `${recipe.id}_${recipe.title.replace(/[^a-zA-Z0-9]/g, '_')}/preview_${(recipe.images?.length || 0) + 1}` : undefined}
              />
            ) : (
              recipe.images && recipe.images.length > 0 ? (
                <HStack wrap="wrap" gap={3}>
                  {recipe.images.map((imageUrl, index) => (
                    <Image
                      key={index}
                      src={imagePath(imageUrl)}
                      alt={`Recipe image ${index + 1}`}
                      maxHeight="300px"
                      objectFit="cover"
                      borderRadius="lg"
                      border="2px solid"
                      borderColor="gray.200"
                      shadow="md"
                    />
                  ))}
                </HStack>
              ) : (
                <Box
                  width="300px"
                  height="250px"
                  bg="bg"
                  borderRadius="lg"
                  border="2px dashed"
                  borderColor="gray.300"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="gray.500" fontSize="sm" textAlign="center">
                    No showcase images
                  </Text>
                </Box>
              )
            )}
          </Box>

          {/* Recipe Info - Right Side */}
          <VStack align="stretch" gap={4} minW="200px">
            {isEditable && !isStatic && (
              <Box>
                <HStack gap={2}>
                  <input
                    type="checkbox"
                    checked={recipe.component || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setRecipe(prev => ({ ...prev, component: e.target.checked }))
                    }
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: '#3182ce'
                    }}
                  />
                  <Text fontSize="sm">Component Recipe</Text>
                </HStack>
              </Box>
            )}
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={1}>Prep Time (minutes)</Text>
              {isEditable && !isStatic ? (
                <Input
                  type="number"
                  value={recipe.prep_time?.toString() || '0'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRecipe(prev => ({ ...prev, prep_time: parseInt(e.target.value) || 0 }))
                  }
                  size="sm"
                  min="0"
                />
              ) : (
                <Text>{recipe.prep_time || 0}</Text>
              )}
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={1}>Cook Time (minutes)</Text>
              {isEditable && !isStatic ? (
                <Input
                  type="number"
                  value={recipe.cook_time?.toString() || '0'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRecipe(prev => ({ ...prev, cook_time: parseInt(e.target.value) || 0 }))
                  }
                  size="sm"
                  min="0"
                />
              ) : (
                <Text>{recipe.cook_time || 0}</Text>
              )}
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={1}>Servings</Text>
              {isEditable && !isStatic ? (
                <Input
                  type="number"
                  value={recipe.servings?.toString() || '1'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRecipe(prev => ({ ...prev, servings: parseInt(e.target.value) || 1 }))
                  }
                  size="sm"
                  min="1"
                />
              ) : (
                <Text>{recipe.servings || 1}</Text>
              )}
            </Box>
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={1}>Recipe Multiplier</Text>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={recipeMultiplier}
                onChange={(e) => setRecipeMultiplier(e.target.value === '' ? '' : e.target.value)}
                onBlur={(e) => {
                  const value = parseFloat(e.target.value);
                  if (isNaN(value) || value <= 0) {
                    setRecipeMultiplier(1.0);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--chakra-colors-border)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: 'var(--chakra-colors-bg)',
                }}
                placeholder="1.0"
              />
            </Box>
          </VStack>
        </HStack>

        {/* Description */}
        {(recipe.description || isEditable) && (
          <Box>
            <Text fontSize="lg" fontWeight="semibold" mb={2}>Description</Text>
            {isEditable && !isStatic ? (
              <Textarea
                value={recipe.description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRecipe(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter recipe description..."
                minH="100px"
                resize="vertical"
              />
            ) : (
              <Text whiteSpace="pre-wrap">
                {recipe.description}
              </Text>
            )}
          </Box>
        )}

        <Box height="1px" bg="gray.200" />

        {/* Conditional rendering: Composed view or regular view */}
        {!isEditable && showComposedView && hasComposedIngredients() ? (
          /* Composed Recipe Display */
          <>

            <ComposedRecipeDisplay
              recipe={recipe}
              multiplier={getEffectiveMultiplier()}
              convertedIngredients={convertedIngredients}
              preferredTemperatureUnit={preferredTemperatureUnit}
            />
          </>
        ) : (
          /* Regular Ingredients and Instructions */
          <>
            {/* Ingredients Component */}
            <RecipeIngredients
              ingredients={recipe.ingredients || []}
              isEditable={isEditable}
              onAddIngredient={addIngredient}
              onRemoveIngredient={removeIngredient}
              onUpdateIngredient={updateIngredientStable}
              onReorderIngredients={reorderIngredients}
              multiplier={getEffectiveMultiplier()}
              convertedIngredients={convertedIngredients}
              setConvertedIngredients={setConvertedIngredients}
              setAvailableUnits={setAvailableUnits}
              preferredUnitSystem={preferredUnitSystem}
              setPreferredUnitSystem={setPreferredUnitSystem}
              recipeId={recipe.id}
            />

            <Box height="1px" bg="gray.200" />

            {/* Instructions Component */}
            <RecipeInstructions
              instructions={recipe.instructions || []}
              ingredients={recipe.ingredients || []}
              isEditable={isEditable}
              onAddInstruction={addInstruction}
              onRemoveInstruction={removeInstruction}
              onUpdateInstruction={updateInstructionStable}
              onAddInstructionImage={addInstructionImage}
              onRemoveInstructionImage={removeInstructionImage}
              onReorderInstructions={reorderInstructions}
              baseNamespace={recipe.id ? `${recipe.id}_${recipe.title.replace(/[^a-zA-Z0-9]/g, '_')}` : undefined}
              multiplier={getEffectiveMultiplier()}
              convertedIngredients={convertedIngredients}
              preferredTemperatureUnit={preferredTemperatureUnit}
            />
          </>
        )}

        {/* Categories Component */}
        <RecipeCategories
          categories={recipe.categories || []}
          isEditable={isEditable}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
          onUpdateCategory={updateCategoryStable}
        />

        {/* Recipe ID Display (for debugging) */}
        {recipe.id && (
          <Box>
            <Text fontSize="xs" color="gray.500">Recipe ID: {recipe.id}</Text>
          </Box>
        )}

        {/* Usage Instructions */}
        {(isEditable || getEffectiveMultiplier() !== 1.0) && !isStatic && (
          <Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
            <Text fontWeight="medium" color="blue.800" mb={2}>
              {isEditable ? 'Editing Tips:' : 'Recipe Scaling:'}
            </Text>
            <VStack align="start" gap={1} fontSize="sm" color="blue.700">
              {isEditable ? (
                <>
                  <Text>• Click on any text to edit it inline</Text>
                  <Text>• Use Shift+Enter for line breaks in multi-line fields</Text>
                  <Text>• Press Enter or click outside to finish editing a field</Text>
                  <Text>• Changes are saved to the server when you click Save</Text>
                  <Text>• Use @ syntax to reference ingredients: @tomatoes{1 / 4} or @flour{2}</Text>
                </>
              ) : (
                <>
                  <Text>• Recipe multiplier is set to {getEffectiveMultiplier().toFixed(1)}x</Text>
                  <Text>• All ingredient quantities are scaled proportionally</Text>
                  <Text>• You can change units using the dropdowns for more convenient measurements</Text>
                  <Text>• Original quantities are shown in gray when units are converted</Text>
                  <Text>• Ingredient references are automatically scaled with the recipe multiplier</Text>
                </>
              )}
            </VStack>
          </Box>
        )}

        {/* Recipe Scaling Info for Static Mode */}
        {isStatic && getEffectiveMultiplier() !== 1.0 && (
          <Box p={4} bg="green.50" borderRadius="md" borderLeft="4px solid" borderColor="green.400">
            <Text fontWeight="medium" color="green.800" mb={2}>
              🍽️ Recipe Scaling:
            </Text>
            <VStack align="start" gap={1} fontSize="sm" color="green.700">
              <Text>• Recipe multiplier is set to {getEffectiveMultiplier().toFixed(1)}x</Text>
              <Text>• All ingredient quantities are scaled proportionally</Text>
              <Text>• You can change units using the dropdowns for more convenient measurements</Text>
              <Text>• Original quantities are shown in gray when units are converted</Text>
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default Recipe;
