// API service for recipe management
// Use /api prefix to leverage Vite proxy and avoid CORS issues

import type {
  RecipeData,
  Instruction,
  RecipeIngredient,
  Ingredient,
  Category,
  IngredientComposition,
  UnitConversion,
  ConversionMatrix,
  UnitsUsedInRecipes,
  IngredientUnitsUsed,
  Task,
  SubTask,
  Event,
  WeeklyRecipe,
  PlannedMeal,
  MealPlan,
  KeyValueEntry,
  Article,
  ArticleBlock
} from './type';

const USE_STATIC_MODE = import.meta.env.VITE_USE_STATIC_MODE === 'true';
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
// Sub-path prefix for hosting on a GitHub Pages project page (e.g. "/recipes").
// Only needed for absolute asset URLs (images) that are not handled by Vite's base.
const SITE_BASE = (import.meta.env.VITE_BASE_PATH || '').replace(/\/$/, '');

console.log(USE_STATIC_MODE, API_BASE_URL)

// Check if we're in static mode (no backend server)
const isStaticMode = () => {
  // Check if we're in production and using static JSON files
  // This works for both local static builds (/api) and GitHub Pages (/recipes/api)
  return USE_STATIC_MODE && API_BASE_URL.endsWith('/api');
};


export function imagePath(image: string): string {
  // Images stored in the DB use paths like "/uploads/…" without the /api/ prefix.
  // The Vite proxy only forwards /api/* to Flask, so we need to add it.
  // Paths already starting with /api/uploads/ are left untouched.
  const path = image.startsWith('/uploads/') ? '/api' + image : image;
  // On GitHub Pages (SITE_BASE="/recipes"), prepend the sub-path so the
  // absolute URL resolves correctly from the domain root.
  return SITE_BASE + path;
}

export { isStaticMode };

class RecipeAPI {
  private async requestStatic<T>(endpoint: string): Promise<T> {
    // Convert endpoint to static JSON file path
    let jsonPath = endpoint;
    let cleanEndpoint = endpoint.split('?')[0];

    if (endpoint === '/') {
      jsonPath = `${API_BASE_URL}/index.json`;
    } else if (endpoint.startsWith('/')) {
      jsonPath = `${API_BASE_URL}${cleanEndpoint}.json`;
    }

    // Handle query parameters by removing them for static files
    const cleanPath = jsonPath;

    // Debug logging (only in development)
    if (import.meta.env.DEV) {
      console.log('Static API request:', { endpoint, jsonPath, cleanPath });
    }

    try {
      const response = await fetch(cleanPath);
      if (!response.ok) {
        throw new Error(`Static file not found: ${cleanPath}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Static API request failed:', error);
      throw new Error(`Failed to load static data from ${cleanPath}`);
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Debug logging (only in development)
    if (import.meta.env.DEV) {
      console.log('API Request:', {
        endpoint,
        isStatic: isStaticMode(),
        apiBaseUrl: API_BASE_URL,
        isProd: import.meta.env.PROD
      });
    }

    // In static mode, only GET requests are supported
    if (isStaticMode()) {
      if (options.method && options.method !== 'GET') {
        throw new Error('Modifications not supported in static mode');
      }
      return this.requestStatic<T>(endpoint);
    }

    // Development mode - make actual API calls
    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Recipe methods
  async getRecipes(): Promise<RecipeData[]> {
    return this.request<RecipeData[]>('/recipes');
  }

  async getRecipe(id: number): Promise<RecipeData> {
    return this.request<RecipeData>(`/recipes/${id}`);
  }

  async getRecipeByName(name: string): Promise<RecipeData> {
    // Convert name to URL-friendly format (replace spaces with hyphens)
    const urlName = name.toLowerCase().replace(/\s+/g, '-');
    return this.request<RecipeData>(`/recipes/${urlName}`);
  }

  async createRecipe(recipe: Omit<RecipeData, 'id'>): Promise<RecipeData> {
    if (isStaticMode()) {
      throw new Error('Creating recipes is not supported in static mode');
    }
    return this.request<RecipeData>('/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe),
    });
  }

  async updateRecipe(id: number, recipe: Partial<RecipeData>): Promise<RecipeData> {
    if (isStaticMode()) {
      throw new Error('Updating recipes is not supported in static mode');
    }
    return this.request<RecipeData>(`/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(recipe),
    });
  }

  async deleteRecipe(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting recipes is not supported in static mode');
    }
    return this.request<{ message: string }>(`/recipes/${id}`, {
      method: 'DELETE',
    });
  }

  // Ingredient methods
  async getIngredients(): Promise<Ingredient[]> {
    return this.request<Ingredient[]>('/ingredients');
  }

  async getIngredient(id: number): Promise<Ingredient> {
    return this.request<Ingredient>(`/ingredients/${id}`);
  }

  async getIngredientByName(name: string): Promise<Ingredient> {
    // Convert name to URL-friendly format (replace spaces with hyphens)
    const urlName = name.toLowerCase().replace(/\s+/g, '-');
    return this.request<Ingredient>(`/ingredients/${urlName}`);
  }

  async createIngredient(ingredient: Omit<Ingredient, 'id'>): Promise<Ingredient> {
    if (isStaticMode()) {
      throw new Error('Creating ingredients is not supported in static mode');
    }
    return this.request<Ingredient>('/ingredients', {
      method: 'POST',
      body: JSON.stringify(ingredient),
    });
  }

  async updateIngredient(id: number, ingredient: Partial<Ingredient>): Promise<Ingredient> {
    if (isStaticMode()) {
      throw new Error('Updating ingredients is not supported in static mode');
    }
    return this.request<Ingredient>(`/ingredients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(ingredient),
    });
  }

  async deleteIngredient(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting ingredients is not supported in static mode');
    }
    return this.request<{ message: string }>(`/ingredients/${id}`, {
      method: 'DELETE',
    });
  }

  async getIngredientConversionMatrix(id: number): Promise<ConversionMatrix> {
    return this.request<ConversionMatrix>(`/ingredients/${id}/conversion-matrix`);
  }

  async getUnitsUsedInRecipes(): Promise<UnitsUsedInRecipes> {
    return this.request<UnitsUsedInRecipes>('/units/used-in-recipes');
  }

  async getIngredientUnitsUsed(ingredientId: number): Promise<IngredientUnitsUsed> {
    return this.request<IngredientUnitsUsed>(`/ingredients/${ingredientId}/units-used`);
  }

  // Ingredient Composition methods
  async getIngredientCompositions(ingredientId: number, source?: string): Promise<IngredientComposition[]> {
    const url = source
      ? `/ingredients/${ingredientId}/compositions/${encodeURIComponent(source)}`
      : `/ingredients/${ingredientId}/compositions`;
    return this.request<IngredientComposition[]>(url);
  }

  async getIngredientCompositionSources(ingredientId: number): Promise<string[]> {
    return this.request<string[]>(`/ingredients/${ingredientId}/compositions/source`);
  }

  async createIngredientComposition(ingredientId: number, composition: Omit<IngredientComposition, 'id' | 'ingredient_id'>): Promise<IngredientComposition> {
    if (isStaticMode()) {
      throw new Error('Creating compositions is not supported in static mode');
    }
    return this.request<IngredientComposition>(`/ingredients/${ingredientId}/compositions`, {
      method: 'POST',
      body: JSON.stringify(composition),
    });
  }

  async updateIngredientComposition(compositionId: number, composition: Partial<IngredientComposition>): Promise<IngredientComposition> {
    if (isStaticMode()) {
      throw new Error('Updating compositions is not supported in static mode');
    }
    return this.request<IngredientComposition>(`/ingredients/compositions/${compositionId}`, {
      method: 'PUT',
      body: JSON.stringify(composition),
    });
  }

  async deleteIngredientComposition(compositionId: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting compositions is not supported in static mode');
    }
    return this.request<{ message: string }>(`/ingredients/compositions/${compositionId}`, {
      method: 'DELETE',
    });
  }

  // Category methods
  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>('/categories');
  }

  async createCategory(category: Omit<Category, 'id'>): Promise<Category> {
    if (isStaticMode()) {
      throw new Error('Creating categories is not supported in static mode');
    }
    return this.request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  // Unit conversion methods (using new JavaScript implementation)

  // Unit conversion CRUD methods
  async getUnitConversions(): Promise<UnitConversion[]> {
    return this.request<UnitConversion[]>('/unit/conversions');
  }

  async getUnitConversion(id: number): Promise<UnitConversion> {
    return this.request<UnitConversion>(`/unit/conversions/${id}`);
  }

  async createUnitConversion(conversion: Omit<UnitConversion, 'id'>): Promise<UnitConversion> {
    if (isStaticMode()) {
      throw new Error('Creating unit conversions is not supported in static mode');
    }
    return this.request<UnitConversion>('/unit/conversions', {
      method: 'POST',
      body: JSON.stringify(conversion),
    });
  }

  async updateUnitConversion(id: number, conversion: Partial<UnitConversion>): Promise<UnitConversion> {
    if (isStaticMode()) {
      throw new Error('Updating unit conversions is not supported in static mode');
    }
    return this.request<UnitConversion>(`/unit/conversions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(conversion),
    });
  }

  async deleteUnitConversion(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting unit conversions is not supported in static mode');
    }
    return this.request<{ message: string }>(`/unit/conversions/${id}`, {
      method: 'DELETE',
    });
  }

  // Image upload
  async uploadImage(file: File, namespace?: string): Promise<{ url: string; filename: string; folder: string }> {
    if (isStaticMode()) {
      throw new Error('Image upload is not supported in static mode');
    }

    const formData = new FormData();
    formData.append('file', file);

    // Add namespace if provided
    if (namespace) {
      formData.append('namespace', namespace);
    }

    const url = `${API_BASE_URL}/upload`;
    const config: RequestInit = {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header, let browser set it with boundary for multipart/form-data
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Image upload failed:', error);
      throw error;
    }
  }

  async downloadImage(file: File, articlePath: string): Promise<{ url: string; filename: string }> {
    if (isStaticMode()) {
      throw new Error('Image download is not supported in static mode');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', articlePath);

    const url = `${API_BASE_URL}/download-image`;
    const config: RequestInit = {
      method: 'POST',
      body: formData,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Image download failed:', error);
      throw error;
    }
  }

  isStaticMode(): boolean {
    return isStaticMode();
  }

  imagePath(image: string): string {
    return imagePath(image);
  }

  // Task methods
  async getTasks(): Promise<Task[]> {
    return this.request<Task[]>('/tasks');
  }

  async getTask(id: number): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`);
  }

  async createTask(task: Omit<Task, 'id'>): Promise<Task> {
    if (isStaticMode()) {
      throw new Error('Creating tasks is not supported in static mode');
    }
    return this.request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(id: number, task: Partial<Task>): Promise<void> {
    if (isStaticMode()) {
      throw new Error('Updating tasks is not supported in static mode');
    }
    console.log('API updateTask - sending to server:', task);
    console.log('API updateTask - JSON stringified:', JSON.stringify(task));
    await this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    });
  }

  async deleteTask(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting tasks is not supported in static mode');
    }
    return this.request<{ message: string }>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  // SubTask methods
  // DEPRECATED: These methods are no longer used. Tasks now use hierarchical parent_id/root_id structure.
  // Child tasks are included in the parent task's 'children' array.
  // To create a subtask, use createTask() with parent_id and root_id fields.
  async getSubtasks(): Promise<SubTask[]> {
    console.warn('getSubtasks() is deprecated. Tasks now use hierarchical structure with children field.');
    return this.request<SubTask[]>('/subtasks');
  }

  async createSubtask(subtask: Omit<SubTask, 'id'>): Promise<SubTask> {
    console.warn('createSubtask() is deprecated. Use createTask() with parent_id instead.');
    if (isStaticMode()) {
      throw new Error('Creating subtasks is not supported in static mode');
    }
    return this.request<SubTask>('/subtasks', {
      method: 'POST',
      body: JSON.stringify(subtask),
    });
  }

  // Event methods
  async getEvents(startDate?: string, endDate?: string): Promise<Event[]> {
    let endpoint = '/events';
    if (startDate && endDate) {
      endpoint += `?start=${startDate}&end=${endDate}`;
    }
    return this.request<Event[]>(endpoint);
  }

  async getEvent(id: number): Promise<Event> {
    return this.request<Event>(`/events/${id}`);
  }

  async getRoutineEvents(owner: string, name: string): Promise<Event[]> {
    return this.request<Event[]>(`/routine/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  }

  async createEvent(event: Omit<Event, 'id'>): Promise<Event> {
    if (isStaticMode()) {
      throw new Error('Creating events is not supported in static mode');
    }
    return this.request<Event>('/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  async updateEvent(id: number, event: Partial<Event>): Promise<Event> {
    if (isStaticMode()) {
      throw new Error('Updating events is not supported in static mode');
    }
    return this.request<Event>(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(event),
    });
  }

  async deleteEvent(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting events is not supported in static mode');
    }
    return this.request<{ message: string }>(`/events/${id}`, {
      method: 'DELETE',
    });
  }

  // Planning methods
  async sendChecklist(checklistData: any[]): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Sending checklists is not supported in static mode');
    }
    return this.request<{ message: string }>('/planning/telegram/checklist', {
      method: 'POST',
      body: JSON.stringify(checklistData),
    });
  }

  // Key Value Store methods
  async getTopics(): Promise<string[]> {
    return this.request<string[]>('/kv');
  }

  async getKeysForTopic(topic: string): Promise<string[]> {
    return this.request<string[]>(`/kv/${encodeURIComponent(topic)}`);
  }

  async getKeyValue(topic: string, key: string): Promise<KeyValueEntry> {
    return this.request<KeyValueEntry>(`/kv/${encodeURIComponent(topic)}/${encodeURIComponent(key)}`);
  }

  async setKeyValue(topic: string, key: string, value: any): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Setting key-value pairs is not supported in static mode');
    }
    return this.request<{ message: string }>(`/kv/${encodeURIComponent(topic)}/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  }

  // Meal Plan specific methods
  async saveMealPlan(name: string, mealPlan: MealPlan): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Saving meal plans is not supported in static mode');
    }
    // Convert Date objects to ISO strings for storage
    const mealPlanForStorage = {
      ...mealPlan,
      weekStart: mealPlan.weekStart.toISOString(),
    };
    return this.setKeyValue('MEALPLAN', name, mealPlanForStorage);
  }

  async loadMealPlan(name: string): Promise<MealPlan> {
    const response = await this.getKeyValue('MEALPLAN', name);
    const mealPlanData = response.value;
    // Convert ISO string back to Date object
    return {
      ...mealPlanData,
      weekStart: new Date(mealPlanData.weekStart),
    };
  }

  async getMealPlanNames(): Promise<string[]> {
    try {
      return await this.getKeysForTopic('MEALPLAN');
    } catch (error) {
      // If topic doesn't exist yet, return empty array
      return [];
    }
  }

  // Unit conversion queries
  async getUnit(unit: string): Promise<UnitConversion | null> {
    try {
      return this.request<UnitConversion>(`/unit/definition/${encodeURIComponent(unit)}`);
    } catch (error) {
      return null;
    }
  }

  async getIngredientById(ingredientId: number): Promise<Ingredient> {
    return this.request<Ingredient>(`/ingredients/${ingredientId}`);
  }

  async getConversionFactor(fromUnit: string, toUnit: string): Promise<UnitConversion | null> {
    try {
      return this.request<UnitConversion>(`/unit/convert/${encodeURIComponent(fromUnit)}/${encodeURIComponent(toUnit)}`);
    } catch (error) {
      return null;
    }
  }

  async getAllAvailableUnits(): Promise<string[]> {
    return this.request<string[]>('/units/available');
  }

  async getVolumeUnits(): Promise<string[]> {
    return this.request<string[]>('/units/available/volume');
  }

  async getMassUnits(): Promise<string[]> {
    return this.request<string[]>('/units/available/mass');
  }

  async getUnitSuggestions(ingredientId?: number): Promise<string[]> {
    if (ingredientId) {
      return this.request<string[]>(`/units/suggestion/${ingredientId}`);
    } else {
      return this.request<string[]>('/units/suggestion');
    }
  }

  // Search for ingredients and recipes by name
  async searchIngredients(name: string): Promise<Array<{ id: number, name: string, type: 'ingredient' | 'recipe' }>> {
    return this.request<Array<{ id: number, name: string, type: 'ingredient' | 'recipe' }>>(`/ingredient/search/${encodeURIComponent(name)}`);
  }

  // USDA Food API methods
  async searchUsdaFoods(name: string): Promise<Array<{ fdc_id: number, description: string, data_type: string, publication_date?: string }>> {
    return this.request<Array<{ fdc_id: number, description: string, data_type: string, publication_date?: string }>>(`/api/usda/search/${encodeURIComponent(name)}`);
  }

  async getUsdaFood(fdcId: number): Promise<any> {
    return this.request<any>(`/api/usda/food/${fdcId}`);
  }

  async analyzeUsdaFood(fdcId: number): Promise<any> {
    return this.request<any>(`/api/usda/analyze/${fdcId}`);
  }

  async getNutrientGroup(nutrientName: string): Promise<{ group: string, name: string }> {
    return this.request<{ group: string, name: string }>(`/api/usda/nutrient/group/${encodeURIComponent(nutrientName)}`);
  }

  async updateRecipeIngredient(recipeIngredientId: number, data: { fdc_id?: number, quantity?: number, unit?: string }): Promise<RecipeIngredient> {
    return this.request<RecipeIngredient>(`/api/recipes/ingredients/${recipeIngredientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Article methods
  async getArticles(): Promise<Article[]> {
    const endpoint = isStaticMode() ? '/articles/public' : '/articles';
    return this.request<Article[]>(endpoint);
  }

  async getLastAccessedArticles(): Promise<Article[]> {
    return this.request<Article[]>('/articles/last-accessed');
  }

  async getArticle(id: number): Promise<Article> {
    return this.request<Article>(`/articles/${id}`);
  }

  async createArticle(article: Omit<Article, 'id'>): Promise<Article> {
    if (isStaticMode()) {
      throw new Error('Creating articles is not supported in static mode');
    }
    return this.request<Article>('/articles', {
      method: 'POST',
      body: JSON.stringify(article),
    });
  }

  async updateArticle(id: number, article: Partial<Article>): Promise<Article> {
    if (isStaticMode()) {
      throw new Error('Updating articles is not supported in static mode');
    }
    return this.request<Article>(`/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(article),
    });
  }

  async deleteArticle(id: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting articles is not supported in static mode');
    }
    return this.request<{ message: string }>(`/articles/${id}`, {
      method: 'DELETE',
    });
  }

  async searchArticles(name: string): Promise<Article[]> {
    return this.request<Article[]>(`/article/search/${encodeURIComponent(name)}`);
  }

  async moveArticle(articleId: number, newParentId: number): Promise<Article> {
    if (isStaticMode()) {
      throw new Error('Moving articles is not supported in static mode');
    }
    return this.request<Article>(`/article/move/${articleId}/${newParentId}`, {
      method: 'POST',
    });
  }

  async createChildArticle(parentId: number, article: Omit<Article, 'id'>): Promise<Article> {
    if (isStaticMode()) {
      throw new Error('Creating child articles is not supported in static mode');
    }
    return this.request<Article>(`/articles/${parentId}/children`, {
      method: 'POST',
      body: JSON.stringify(article),
    });
  }

  async getChildArticles(parentId: number): Promise<Article[]> {
    return this.request<Article[]>(`/articles/${parentId}/children`);
  }

  async createArticleBlock(articleId: number, block: Omit<ArticleBlock, 'id'>): Promise<ArticleBlock> {
    if (isStaticMode()) {
      throw new Error('Creating blocks is not supported in static mode');
    }
    return this.request<ArticleBlock>(`/articles/${articleId}/blocks`, {
      method: 'POST',
      body: JSON.stringify(block),
    });
  }

  async updateBlock(blockId: number, block: Partial<ArticleBlock>): Promise<ArticleBlock> {
    if (isStaticMode()) {
      throw new Error('Updating blocks is not supported in static mode');
    }
    return this.request<ArticleBlock>(`/blocks/${blockId}`, {
      method: 'PUT',
      body: JSON.stringify(block),
    });
  }

  /**
   * Batch update multiple blocks at once to minimize requests.
   * This is the preferred method for updating blocks - frontend can group
   * all changes over a 5-second period and send them in one request.
   * Accepts an array of actions: {op: "delete"|"update"|"reorder"|"insert", ...}
   */
  async updateBlocksBatch(actions: any[]): Promise<{ message: string; blocks: ArticleBlock[] }> {
    if (isStaticMode()) {
      throw new Error('Updating blocks is not supported in static mode');
    }
    return this.request<{ message: string; blocks: ArticleBlock[] }>('/blocks/batch', {
      method: 'PUT',
      body: JSON.stringify(actions),
    });
  }

  async deleteBlock(blockId: number): Promise<{ message: string }> {
    if (isStaticMode()) {
      throw new Error('Deleting blocks is not supported in static mode');
    }
    return this.request<{ message: string }>(`/blocks/${blockId}`, {
      method: 'DELETE',
    });
  }

  async exportArticle(articleId: number): Promise<Article> {
    return this.request<Article>(`/articles/${articleId}/export`);
  }

  // Code Conversion methods
  async textToGraph(code: string): Promise<any> {
    if (isStaticMode()) {
      throw new Error('Code conversion is not supported in static mode');
    }
    return this.request<any>('/kiwi/conversion/t2g', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async textToBlock(code: string): Promise<any> {
    if (isStaticMode()) {
      throw new Error('Code conversion is not supported in static mode');
    }
    return this.request<any>('/kiwi/conversion/t2b', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async blockToText(blockData: any): Promise<{ code: string }> {
    if (isStaticMode()) {
      throw new Error('Code conversion is not supported in static mode');
    }
    return this.request<{ code: string }>('/kiwi/conversion/b2t', {
      method: 'POST',
      body: JSON.stringify(blockData),
    });
  }

  async graphToText(graphData: any): Promise<{ code: string }> {
    if (isStaticMode()) {
      throw new Error('Code conversion is not supported in static mode');
    }
    return this.request<{ code: string }>('/kiwi/conversion/g2t', {
      method: 'POST',
      body: JSON.stringify(graphData),
    });
  }

  // Blockly methods
  async getBlocklyDefinitions(): Promise<any[]> {
    return this.request<any[]>('/kiwi/blockly/definitions');
  }

  async getBlocklyToolbox(): Promise<any> {
    return this.request<any>('/kiwi/blockly/toolbox');
  }
}

// Export a singleton instance
export const recipeAPI = new RecipeAPI();