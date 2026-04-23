// TypeScript type definitions for all models
// This file contains all interface definitions that match the Python models in server/models/

// ============================================================================
// Recipe Models
// ============================================================================

export interface RecipeData {
    id?: number;
    title: string;
    description?: string;
    images?: string[];
    instructions: Array<Instruction>;
    prep_time?: number;
    cook_time?: number;
    servings?: number;
    ingredients?: Array<RecipeIngredient>;
    categories?: Array<Category>;
    author_id?: number;
    component?: boolean;
    extension?: any;
    created_at?: string;
    updated_at?: string;
}

export interface Instruction {
    step: string;
    description: string;
    duration?: string;
    image?: string;
}

export interface RecipeIngredient {
    id?: number; // RecipeIngredient ID
    ingredient_id?: number;
    recipe_id?: number; // Add recipe_id for when a recipe is selected as ingredient
    ingredient_recipe_id?: number; // Reference to another recipe used as ingredient (from backend)
    name: string;
    description?: string;
    calories?: number;
    density?: number;
    quantity?: number;
    unit?: string;
    fdc_id?: number; // USDA FDC ID for nutritional data
    recipe?: any; // Full recipe object when ingredient_recipe_id is set
    product?: string; // Product usually used for this ingredient
}

export interface Ingredient {
    id?: number;
    name: string;
    description?: string;
    fdc_id?: number;
    price_high?: number;
    price_low?: number;
    price_medium?: number;
    calories?: number;
    density?: number;
    composition?: any;
    extension?: any;
    item_avg_weight?: number;
    unit?: {
        metric?: string;
        us_customary?: string;
        us_legal?: string;
        canada?: string;
        australia?: string;
        uk?: string;
    };
}

export interface Category {
    id?: number;
    name: string;
    description?: string;
    extension?: any;
}

export interface IngredientComposition {
    id?: number;
    ingredient_id?: number;
    recipe_id?: number;
    name?: string;
    kind?: string;
    quantity?: number;
    unit?: string;
    daily_value?: number;
    extension?: any;
    source?: string;
}

export interface IngredientSubstitution {
    id?: number;
    reason?: string; // Reason of the replacement (nut allergy, lactose intolerance)
    original: string; // Original ingredient we want to replace
    replacement: string; // New ingredient replacing it
    ratio?: number; // Replacement ratio if not 1:1
}

export interface USDAFood {
    fdc_id: number;
    name: string;
}

// ============================================================================
// Unit Conversion Models
// ============================================================================

export interface UnitConversion {
    id?: number;
    from_unit: string;
    to_unit: string;
    conversion_factor: number;
    category: string;
    ingredient_id?: number;
    extension?: any;
    is_volume?: boolean;
}

export interface ConversionMatrix {
    ingredient: Ingredient;
    volume_units: string[];
    weight_units: string[];
    conversions: {
        [volumeUnit: string]: {
            [weightUnit: string]: number | null;
        };
    };
}

export interface UnitsUsedInRecipes {
    units_in_recipes: string[];
    unit_usage_count: { [unit: string]: number };
    all_available_units: string[];
    total_recipe_ingredients: number;
}

export interface IngredientUnitsUsed {
    ingredient: Ingredient;
    units_used: string[];
    unit_usage_count: { [unit: string]: number };
    recipe_names: { [unit: string]: string[] };
    existing_conversions: { [unit: string]: string[] };
    all_available_units: string[];
    total_uses: number;
}

// ============================================================================
// Task Models
// ============================================================================

export interface Task {
    id?: number;
    root_id?: number;
    parent_id?: number;
    title: string;
    description?: string;
    datetime_deadline?: string;
    datetime_done?: string;
    done: boolean;
    priority?: number;
    price_budget?: number;
    price_real?: number;
    people_count?: number;
    template: boolean;
    recuring: boolean;
    active: boolean;
    extension?: any;
    children?: Task[];  // Hierarchical children structure from backend
}

export interface SubTask {
    id?: number;
    parent_id: number;
    child_id: number;
    parent?: Task;
    child?: Task;
}

// ============================================================================
// Calendar/Event Models
// ============================================================================

export interface Event {
    id?: number;
    title: string;
    description?: string;
    datetime_start: string;
    datetime_end: string;
    location?: string;
    color?: string;
    kind?: number;
    done: boolean;
    price_budget?: number;
    price_real?: number;
    people_count?: number;
    template: boolean;
    recuring: boolean;
    active: boolean;
    extension?: any;
    guests?: any; // JSON list of guest names or IDs
    task?: number; // Task ID reference
    owner?: string;
    name?: string;
}

// ============================================================================
// Meal Planning Models
// ============================================================================

export interface WeeklyRecipe {
    id: string;
    recipeId: string;
    recipeName: string;
    totalPortions: number;
    portionsUsed: number;
    portionsRemaining: number;
}

export interface PlannedMeal {
    id: string;
    recipeId: string;
    recipeName: string;
    portions: number;
    day: string;
    mealType: 'breakfast' | 'lunch' | 'dinner';
}

export interface MealPlan {
    weekStart: Date;
    people: number;
    mealsPerDay: number;
    weeklyRecipes: WeeklyRecipe[];
    plannedMeals: PlannedMeal[];
}

// ============================================================================
// Key-Value Store Models
// ============================================================================

export interface KeyValueEntry {
    topic: string;
    key: string;
    value: any;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// User Models
// ============================================================================

export interface User {
    id?: number;
    username: string;
    email: string;
    password_hash?: string; // Usually not exposed to frontend
    created_at?: string;
}

// ============================================================================
// Pantry/Product Models
// ============================================================================

export interface Product {
    id?: number;
    name: string;
    brand?: string;
    quantity?: number; // Quantity in the package
    unit?: string; // Unit of quantity
    price?: number; // Unitary price
    count?: number; // Number of items purchased
    organic?: boolean;
    created_at?: string; // Date of purchase
    ingredient?: string; // Ingredient this is usually used for
    fdc_id?: number;
}

export interface ProductInventory {
    id?: number;
    name: string;
    quantity?: number; // Current amount in inventory
}

export interface IngredientProduct {
    id?: number;
    product_id: number;
    ingredient_id: number;
}

// ============================================================================
// Article/Blog Models
// ============================================================================

export interface Article {
    id?: number;
    title?: string;
    namespace?: string;
    tags?: any; // JSON
    extension?: any;
    parent_id?: number; // Reference to parent article
    root_id?: number; // Reference to root article in hierarchy
    public?: boolean;
    article_kind?: string;
    blocks?: ArticleBlock[]; // Root blocks of the article
    children?: Article[]; // Child articles (sub-pages)
}

export interface ArticleBlock {
    id?: number;
    page_id?: number; // Reference to Article
    parent_id?: number; // Reference to parent ArticleBlock
    kind?: string; // Type of block (text, image, code, layout, heading, paragraph, etc.)
    data?: any; // JSON content of the block
    extension?: any; // Additional metadata
    sequence?: number
    children?: ArticleBlock[]; // Nested child blocks
}

// Block type constants for reference
export type ArticleBlockKind =
    | 'markdown'
    | 'text'
    | 'heading'
    | 'paragraph'
    | 'image'
    | 'code'
    | 'codespan'
    | 'br'
    | 'hr'
    | 'html'
    | 'checkbox'
    | 'blockquote'
    | 'tablecell'
    | 'tablerow'
    | 'video'
    | 'audio'
    | 'layout'
    | 'list'
    | 'spreadsheet'
    | 'plot'
    | 'latex'
    | 'timeline'
    | 'mermaid'
    | 'widget'
    | 'reference'
    | 'footnote'
    | 'attachment'
    | 'toc'
    | 'accordion'
    | 'alert'
    | 'bibliography'
    | 'footnotes'
    | 'table'
    | 'definition'
    | 'glossary'
    | 'theorem'
    | 'citation'
    | 'button'
    | 'toggle'
    | 'diff'
    | 'embed'
    | 'gallery'
    | 'quiz'
    | 'form'
    | 'cli'
    | 'filetree'
    | 'iframe'
    | 'slideshow'
    | 'animation'
    | 'datastructure'
    | 'sandbox'
    | 'model3d'
    | 'trace'
    | 'workflow'
    | 'constraint'
    | 'ast'
    | 'bnf'
    | 'graph'
    | 'blockly'
    | 'electrical'
    | 'drawing';

// ============================================================================
// Budget/Finance Models (incomplete in Python, included for completeness)
// ============================================================================

export interface Receipt {
    id?: number;
    // Add fields as they are defined in the Python model
}

export interface ReceiptItem {
    id?: number;
    // Add fields as they are defined in the Python model
}

export interface Expense {
    id?: number;
    // Add fields as they are defined in the Python model
}

// ============================================================================
// Facts/Data Models (incomplete in Python, included for completeness)
// ============================================================================

export interface Facts {
    kind?: string;
    start?: string; // DateTime
    end?: string; // DateTime
    name?: string;
    source?: string;
    operator?: string;
}

export interface Data {
    id?: number;
    name?: string;
    source?: string;
    value?: any; // JSON
    unit?: any; // JSON
    value_start?: string; // DateTime
    value_end?: string; // DateTime
    published_time?: string; // DateTime
}

