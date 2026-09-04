import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addCookLog, deleteCookLog } from "@/server/cooks/service";
import { listTags } from "@/server/tags/service";
import { migrateTestDb, resetTestDb } from "@/test/db";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, patchRecipe, setRecipePhoto, updateRecipe } from "./service";
import { recipeInputSchema, type RecipeSort } from "./types";

const base = (overrides: Record<string, unknown> = {}) =>
  recipeInputSchema.parse({
    title: "Shakshuka",
    ingredients: ["4 eggs", "1 can crushed tomatoes", "1 onion"],
    steps: ["Soften the onion.", "Add tomatoes, simmer.", "Crack in eggs, cover."],
    tags: ["Breakfast", "vegetarian "],
    prepMinutes: 10,
    cookMinutes: 20,
    difficulty: "easy",
    ...overrides,
  });

describe("recipe service", () => {
  beforeAll(migrateTestDb);
  beforeEach(resetTestDb);

  it("creates and reads back a full recipe", async () => {
    const created = await createRecipe(base());
    expect(created.id).toBeGreaterThan(0);
    expect(created.ingredientCount).toBe(3);
    expect(created.totalMinutes).toBe(30);
    expect(created.explicitTotalMinutes).toBeNull();
    expect(created.tags).toEqual(["breakfast", "vegetarian"]);
    expect(created.cookCount).toBe(0);
    expect(created.lastCookedOn).toBeNull();

    const fetched = await getRecipe(created.id);
    expect(fetched).toEqual(created);
    expect(await getRecipe(9999)).toBeNull();
  });

  it("validates input", () => {
    expect(() => recipeInputSchema.parse({ title: "  " })).toThrow();
    expect(() => recipeInputSchema.parse({ title: "x", sourceUrl: "not a url" })).toThrow();
    const parsed = recipeInputSchema.parse({ title: "x", sourceUrl: "", servings: "", difficulty: "" });
    expect(parsed.sourceUrl).toBeNull();
    expect(parsed.servings).toBeNull();
    expect(parsed.difficulty).toBeNull();
  });

  it("replaces children on update and bumps updatedAt", async () => {
    const created = await createRecipe(base());
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateRecipe(created.id, base({ title: "Shakshuka v2", ingredients: ["6 eggs"], tags: ["brunch"], totalMinutes: 45 }));
    expect(updated?.title).toBe("Shakshuka v2");
    expect(updated?.ingredients).toEqual(["6 eggs"]);
    expect(updated?.ingredientCount).toBe(1);
    expect(updated?.tags).toEqual(["brunch"]);
    expect(updated?.totalMinutes).toBe(45);
    expect(updated!.updatedAt > created.updatedAt).toBe(true);
    expect(await updateRecipe(9999, base())).toBeNull();
    // the orphaned tags disappear from the tag list
    expect((await listTags()).map((t) => t.name)).toEqual(["brunch"]);
  });

  it("deletes a recipe and everything attached to it", async () => {
    const created = await createRecipe(base());
    await addCookLog(created.id, { rating: 5 });
    expect(await deleteRecipe(created.id)).toEqual({ photoUrl: null });
    expect(await getRecipe(created.id)).toBeNull();
    expect(await deleteRecipe(created.id)).toBeNull();
    expect(await listRecipes()).toEqual([]);
  });

  it("toggles favourite without touching updatedAt, and sets photos", async () => {
    const created = await createRecipe(base());
    const fav = await patchRecipe(created.id, { isFavorite: true });
    expect(fav?.isFavorite).toBe(true);
    expect(fav?.updatedAt).toBe(created.updatedAt);
    const withPhoto = await setRecipePhoto(created.id, "https://example.com/p.jpg");
    expect(withPhoto?.photoUrl).toBe("https://example.com/p.jpg");
    expect(await patchRecipe(9999, { isFavorite: true })).toBeNull();
  });

  it("searches by title, ingredient, and tag", async () => {
    await createRecipe(base());
    await createRecipe(base({ title: "Pad Thai", ingredients: ["rice noodles", "tamarind"], tags: ["dinner", "thai"] }));
    await createRecipe(base({ title: "Granola", ingredients: ["oats", "honey"], tags: ["breakfast"] }));

    const titles = async (q: string) => (await listRecipes({ q })).map((r) => r.title).sort();
    expect(await titles("shak")).toEqual(["Shakshuka"]);
    expect(await titles("TAMARIND")).toEqual(["Pad Thai"]);
    expect(await titles("breakfast")).toEqual(["Granola", "Shakshuka"]);
    expect(await titles("100%")).toEqual([]);
    expect((await listRecipes({ tag: "Thai" })).map((r) => r.title)).toEqual(["Pad Thai"]);
    expect((await listRecipes({ difficulty: "hard" })).length).toBe(0);
  });

  it("filters favourites and sorts", async () => {
    const a = await createRecipe(base({ title: "Alpha", ingredients: ["x", "y", "z"], prepMinutes: 5, cookMinutes: 5 }));
    const b = await createRecipe(base({ title: "beta", ingredients: ["x"], prepMinutes: null, cookMinutes: null }));
    const c = await createRecipe(base({ title: "Gamma", ingredients: ["x", "y"], prepMinutes: 60, cookMinutes: 0 }));
    await patchRecipe(b.id, { isFavorite: true });
    await addCookLog(a.id, { cookedOn: "2026-01-10" });
    await addCookLog(a.id, { cookedOn: "2026-03-01" });
    await addCookLog(c.id, { cookedOn: "2026-02-01" });

    const names = async (sort: RecipeSort, extra = {}) =>
      (await listRecipes({ sort, ...extra })).map((r) => r.title);

    expect(await names("title")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(await names("ingredientCount")).toEqual(["beta", "Gamma", "Alpha"]);
    expect(await names("cookCount")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("lastCooked")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("totalTime")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("updated", { favorite: true })).toEqual(["beta"]);

    const alpha = (await listRecipes()).find((r) => r.id === a.id)!;
    expect(alpha.cookCount).toBe(2);
    expect(alpha.lastCookedOn).toBe("2026-03-01");
  });

  it("logs and removes cooks", async () => {
    const created = await createRecipe(base());
    const log = await addCookLog(created.id, { rating: 4, notes: "too much salt" });
    expect(log?.cookedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log?.rating).toBe(4);
    const detail = await getRecipe(created.id);
    expect(detail?.cookLogs).toHaveLength(1);
    expect(detail?.cookCount).toBe(1);
    expect(await addCookLog(9999, {})).toBeNull();
    expect(await deleteCookLog(log!.id)).toBe(true);
    expect(await deleteCookLog(log!.id)).toBe(false);
  });

  it("lists tags with usage counts", async () => {
    await createRecipe(base({ tags: ["a", "b"] }));
    await createRecipe(base({ tags: ["b"] }));
    expect(await listTags()).toEqual([
      { id: expect.any(Number), name: "b", recipeCount: 2 },
      { id: expect.any(Number), name: "a", recipeCount: 1 },
    ]);
  });
});
