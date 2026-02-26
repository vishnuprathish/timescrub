/**
 * Operation Recipes — named, persisted sets of cleaning operations.
 * Stored in localStorage under STORAGE_KEY as a JSON array.
 *
 * Each recipe: { id, name, createdAt, ops: [{op, params, description}] }
 */

const STORAGE_KEY = 'timescrub-recipes';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(recipes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    // localStorage full or blocked — silently ignore
  }
}

/** Return all saved recipes. */
export function getRecipes() {
  return load();
}

/**
 * Save the current operationLog as a named recipe.
 * @param {string} name
 * @param {object[]} operationLog
 * @returns {object} the new recipe
 */
export function saveRecipe(name, operationLog) {
  const recipes = load();
  const recipe = {
    id: `recipe_${Date.now()}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    ops: operationLog.map(({ op, params, description }) => ({ op, params, description })),
  };
  recipes.push(recipe);
  save(recipes);
  return recipe;
}

/**
 * Delete a recipe by id.
 * @param {string} id
 */
export function deleteRecipe(id) {
  const recipes = load().filter((r) => r.id !== id);
  save(recipes);
}
