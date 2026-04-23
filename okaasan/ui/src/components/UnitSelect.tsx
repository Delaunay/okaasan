import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Input,
    VStack,
    Spinner
} from '@chakra-ui/react';
import { recipeAPI } from '../services/api';

interface UnitSelectProps {
    value: string;
    onChange: (value: string) => void;
    ingredientId?: number;
    placeholder?: string;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    width?: string;
}

const UnitSelect: React.FC<UnitSelectProps> = ({
    value,
    onChange,
    ingredientId,
    placeholder = "Enter unit...",
    disabled = false,
    size = 'md',
    width = '120px'
}) => {
    const [inputValue, setInputValue] = useState(value);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Load suggestions when component mounts or ingredient changes
    useEffect(() => {
        const loadSuggestions = async () => {
            setIsLoading(true);
            try {
                const unitSuggestions = await recipeAPI.getUnitSuggestions(ingredientId);
                setSuggestions(unitSuggestions || []);
            } catch (error) {
                console.error('Error loading unit suggestions:', error);
                // Fallback to common units
                setSuggestions(['ml', 'l', 'cl', 'tsp', 'tbsp', 'cup', 'fl oz', 'g', 'kg', 'oz', 'lb']);
            } finally {
                setIsLoading(false);
            }
        };

        loadSuggestions();
    }, [ingredientId]);

    // Update input value when prop changes
    useEffect(() => {
        setInputValue(value);
    }, [value]);

    // Filter suggestions based on input
    useEffect(() => {
        if (!inputValue.trim()) {
            setFilteredSuggestions(suggestions);
        } else {
            const filtered = suggestions.filter(unit =>
                unit.toLowerCase().includes(inputValue.toLowerCase())
            );
            setFilteredSuggestions(filtered);
        }
    }, [inputValue, suggestions]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        setShowSuggestions(true);
    };

    const handleInputFocus = () => {
        setShowSuggestions(true);
    };

    const handleSuggestionSelect = (suggestion: string) => {
        setInputValue(suggestion);
        onChange(suggestion);
        setShowSuggestions(false);
    };

    const handleInputBlur = (_e: React.FocusEvent<HTMLInputElement>) => {
        // Small delay to allow suggestion clicks to register
        setTimeout(() => {
            if (!dropdownRef.current?.contains(document.activeElement)) {
                // Only call onChange if the value has actually changed
                if (inputValue !== value) {
                    onChange(inputValue);
                }
                setShowSuggestions(false);
            }
        }, 200);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onChange(inputValue);
            setShowSuggestions(false);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const inputSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

    return (
        <Box position="relative" width={width} ref={dropdownRef}>
            <Input
                value={inputValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                size={inputSize}
                bg="bg"
                borderColor="gray.200"
                _hover={{ borderColor: "gray.300" }}
                _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)" }}
            />

            {showSuggestions && !disabled && (
                <Box
                    position="absolute"
                    top="100%"
                    left={0}
                    right={0}
                    bg="bg"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    boxShadow="md"
                    zIndex={1000}
                    maxHeight="200px"
                    overflowY="auto"
                >
                    {isLoading ? (
                        <Box p={2} textAlign="center">
                            <Spinner size="sm" />
                        </Box>
                    ) : filteredSuggestions.length > 0 ? (
                        <VStack gap={0} align="stretch">
                            {filteredSuggestions.map((suggestion, index) => (
                                <Box
                                    key={index}
                                    px={3}
                                    py={2}
                                    cursor="pointer"
                                    _hover={{ bg: "gray.100" }}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent input blur
                                        handleSuggestionSelect(suggestion);
                                    }}
                                    fontSize={inputSize === 'sm' ? 'sm' : 'md'}
                                >
                                    {suggestion}
                                </Box>
                            ))}
                        </VStack>
                    ) : (
                        <Box p={2} color="gray.500" fontSize="sm" textAlign="center">
                            No suggestions found
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default UnitSelect;