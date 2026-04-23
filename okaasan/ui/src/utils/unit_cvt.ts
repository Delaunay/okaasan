import { recipeAPI } from '../services/api';
import type { UnitConversion, Ingredient } from '../services/type';

// Constants matching the Python logic
const DEFAULT_VOLUME_UNIT = 'ml';
const DEFAULT_MASS_UNIT = 'g';

// Cache for API calls to avoid repeated requests
const unitCache = new Map<string, UnitConversion | null>();
const ingredientCache = new Map<number, Ingredient>();
const conversionFactorCache = new Map<string, UnitConversion | null>();

// Helper function to get unit definition
async function getUnit(unit: string): Promise<UnitConversion | null> {
    if (unitCache.has(unit)) {
        return unitCache.get(unit) || null;
    }

    const result = await recipeAPI.getUnit(unit);
    unitCache.set(unit, result);
    return result;
}

// Helper function to get ingredient
async function getIngredient(ingredientId: number): Promise<Ingredient> {
    if (ingredientCache.has(ingredientId)) {
        return ingredientCache.get(ingredientId)!;
    }

    const result = await recipeAPI.getIngredientById(ingredientId);
    ingredientCache.set(ingredientId, result);
    return result;
}

// Helper function to get conversion factor
async function getConversionFactor(fromUnit: string, toUnit: string): Promise<UnitConversion | null> {
    const key = `${fromUnit}->${toUnit}`;
    if (conversionFactorCache.has(key)) {
        return conversionFactorCache.get(key) || null;
    }

    const result = await recipeAPI.getConversionFactor(fromUnit, toUnit);
    conversionFactorCache.set(key, result);
    return result;
}

// Main conversion function - JavaScript implementation of the Python convert function
export async function convert(
    qty: number,
    fromUnit: string,
    toUnit: string,
    ingredientId?: number
): Promise<number> {
    // If units are the same, no conversion needed
    if (fromUnit === toUnit) {
        return qty;
    }

    const fromDef = await getUnit(fromUnit);
    const toDef = await getUnit(toUnit);

    if (!fromDef || !toDef) {
        throw new Error(`Unit definition not found for ${fromUnit} or ${toUnit}`);
    }

    const fromDefault = fromDef.is_volume ? DEFAULT_VOLUME_UNIT : DEFAULT_MASS_UNIT;
    const toDefault = toDef.is_volume ? DEFAULT_VOLUME_UNIT : DEFAULT_MASS_UNIT;

    // Convert to standard unit (ml or g)
    const stdQty = await convertToStandard(qty, fromUnit, fromDefault);
    console.log(`${qty} ${fromUnit} => ${stdQty} ${fromDefault}`)

    // Shortcut if target unit is already the standard unit
    if (fromDefault === toUnit) {
        return stdQty;
    }

    // If we need density-based conversion between volume and mass
    if (fromDefault !== toDefault) {
        if (!ingredientId) {
            throw new Error("Density-based conversion requires ingredient_id");
        }

        const ingredient = await getIngredient(ingredientId);
        const density = ingredient.density || 1.0;

        if (fromDefault === DEFAULT_VOLUME_UNIT && toDefault === DEFAULT_MASS_UNIT) {
            // Volume to mass: multiply by density
            const massInGrams = stdQty * density;
            return await convertFromStandard(massInGrams, DEFAULT_MASS_UNIT, toUnit);
        } else if (fromDefault === DEFAULT_MASS_UNIT && toDefault === DEFAULT_VOLUME_UNIT) {
            // Mass to volume: divide by density
            const volumeInMl = stdQty / density;
            return await convertFromStandard(volumeInMl, DEFAULT_VOLUME_UNIT, toUnit);
        }
    }

    // Same category conversion (volume to volume or mass to mass)
    return await convertFromStandard(stdQty, fromDefault, toUnit);
}

// Helper function to convert to standard unit (ml or g)
async function convertToStandard(qty: number, fromUnit: string, standardUnit: string): Promise<number> {
    if (fromUnit === standardUnit) {
        return qty;
    }

    const conversionFactor = await getConversionFactor(fromUnit, standardUnit);
    if (!conversionFactor) {
        throw new Error(`No conversion factor found from ${fromUnit} to ${standardUnit}`);
    }

    return qty * conversionFactor.conversion_factor;
}

// Helper function to convert from standard unit to target unit
async function convertFromStandard(qty: number, standardUnit: string, toUnit: string): Promise<number> {
    if (standardUnit === toUnit) {
        return qty;
    }

    const conversionFactor = await getConversionFactor(standardUnit, toUnit);
    if (!conversionFactor) {
        throw new Error(`No conversion factor found from ${standardUnit} to ${toUnit}`);
    }

    return qty * conversionFactor.conversion_factor;
}

// Get available units based on unit type and ingredient density
export async function getAvailableUnits(unit: string, ingredientId?: number): Promise<string[]> {
    try {
        const unitDef = await getUnit(unit);

        if (!unitDef || Object.keys(unitDef).length === 0) {
            return [];
        }

        // If we have an ingredient ID, check if it has density
        if (ingredientId) {
            const ingredient = await getIngredient(ingredientId);

            // If ingredient has density, it can convert between volume and mass
            if (ingredient.density && ingredient.density > 0) {
                return await recipeAPI.getAllAvailableUnits();
            }
        }

        // If no density or no ingredient, only return units of the same type
        if (unitDef.is_volume) {
            return await recipeAPI.getVolumeUnits();
        } else {
            return await recipeAPI.getMassUnits();
        }
    } catch (error) {
        console.error('Error getting available units:', error);
        // Fallback to all units on error
        return await recipeAPI.getAllAvailableUnits();
    }
}

// Clear cache function for testing or when data changes
export function clearConversionCache(): void {
    unitCache.clear();
    ingredientCache.clear();
    conversionFactorCache.clear();
}
