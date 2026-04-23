// Common cooking fractions mapping
const COMMON_FRACTIONS: { [key: number]: string } = {
    0.125: '1/8',
    0.25: '1/4',
    0.333: '1/3',
    0.375: '3/8',
    0.5: '1/2',
    0.625: '5/8',
    0.666: '2/3',
    0.75: '3/4',
    0.875: '7/8',
};

// Tolerance for floating point comparison
const TOLERANCE = 0.001;

/**
 * Converts a decimal number to a fraction string if it matches common cooking fractions
 * @param quantity - The decimal quantity to convert
 * @param unit - The unit (optional, used for context-specific formatting)
 * @returns Formatted string with fractions where appropriate
 */
export function formatQuantityWithFractions(quantity: number): string {
    // Handle zero and negative numbers
    if (quantity <= 0) {
        return '0';
    }

    // Separate whole number and decimal parts
    const wholeNumber = Math.floor(quantity);
    const decimal = quantity - wholeNumber;

    // Check if the decimal part matches any common fraction
    let fractionString = '';
    for (const [decimalValue, fraction] of Object.entries(COMMON_FRACTIONS)) {
        if (Math.abs(decimal - parseFloat(decimalValue)) < TOLERANCE) {
            fractionString = fraction;
            break;
        }
    }

    // Build the result string
    if (wholeNumber === 0 && fractionString) {
        // Just a fraction (e.g., "1/2")
        return fractionString;
    } else if (wholeNumber > 0 && fractionString) {
        // Whole number + fraction (e.g., "2 1/4")
        return `${wholeNumber} ${fractionString}`;
    } else if (wholeNumber > 0 && decimal === 0) {
        // Just a whole number (e.g., "3")
        return wholeNumber.toString();
    } else {
        // No matching fraction, use decimal (rounded to 2 decimal places)
        return quantity.toFixed(2).replace(/\.?0+$/, '');
    }
}

/**
 * Parse a fraction string back to a decimal number
 * Handles formats like "1/2", "2 1/4", "0.5", "2.25"
 * @param input - The string to parse
 * @returns The decimal equivalent
 */
export function parseFractionToDecimal(input: string): number {
    const trimmed = input.trim();

    // Handle empty or invalid input
    if (!trimmed) return 0;

    // Check if it's a simple decimal number
    if (/^\d+\.?\d*$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    // Handle mixed numbers (e.g., "2 1/4")
    const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedMatch) {
        const whole = parseInt(mixedMatch[1]);
        const numerator = parseInt(mixedMatch[2]);
        const denominator = parseInt(mixedMatch[3]);
        return whole + (numerator / denominator);
    }

    // Handle simple fractions (e.g., "3/4")
    const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
    if (fractionMatch) {
        const numerator = parseInt(fractionMatch[1]);
        const denominator = parseInt(fractionMatch[2]);
        return numerator / denominator;
    }

    // Fallback to parseFloat for other formats
    return parseFloat(trimmed) || 0;
}

/**
 * Check if a unit typically uses fractions in cooking
 * @param unit - The unit to check
 * @returns True if fractions are commonly used with this unit
 */
export function shouldUseFractions(unit: string): boolean {
    const fractionUnits = ['cup', 'cups', 'tsp', 'tbsp', 'teaspoon', 'tablespoon', 'teaspoons', 'tablespoons'];
    return fractionUnits.includes(unit.toLowerCase());
}

/**
 * Format quantity with context-aware fraction display
 * Uses fractions for cup/tsp/tbsp measurements, decimals for others
 * @param quantity - The quantity to format
 * @param unit - The unit of measurement
 * @returns Formatted quantity string
 */
export function formatQuantity(quantity: number, unit?: string): string {
    if (unit && shouldUseFractions(unit)) {
        return formatQuantityWithFractions(quantity);
    } else {
        // For non-fraction units, use regular decimal formatting
        return quantity.toFixed(2).replace(/\.?0+$/, '');
    }
}