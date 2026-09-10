import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { addCookLog, deleteCookLog, updateCookLog } from "@/server/cooks/service";
import { listTags } from "@/server/tags/service";
import { createTestUser, migrateTestDb, resetTestDb } from "@/test/db";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, patchRecipe, setRecipePhoto, updateRecipe } from "./service";
import { RECIPE_BODY_REQUIRED_MESSAGE, recipeInputSchema, type RecipeSort } from "./types";

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
  let userId: number;

  beforeAll(migrateTestDb);
  beforeEach(async () => {
    await resetTestDb();
    userId = await createTestUser();
  });

  it("creates and reads back a full recipe", async () => {
    const created = await createRecipe(userId, base());
    expect(created.id).toBeGreaterThan(0);
    expect(created.ingredientCount).toBe(3);
    expect(created.totalMinutes).toBe(30);
    expect(created.explicitTotalMinutes).toBeNull();
    expect(created.tags).toEqual(["breakfast", "vegetarian"]);
    expect(created.cookCount).toBe(0);
    expect(created.lastCookedOn).toBeNull();

    const fetched = await getRecipe(userId, created.id);
    expect(fetched).toEqual(created);
    expect(await getRecipe(userId, 9999)).toBeNull();
  });

  it("validates input", () => {
    expect(() => recipeInputSchema.parse({ title: "  ", ingredients: ["x"] })).toThrow();
    expect(() => recipeInputSchema.parse({ title: "x", ingredients: ["x"], sourceUrl: "not a url" })).toThrow();
    const parsed = recipeInputSchema.parse({ title: "x", ingredients: ["x"], sourceUrl: "", servings: "", difficulty: "" });
    expect(parsed.sourceUrl).toBeNull();
    expect(parsed.servings).toBeNull();
    expect(parsed.difficulty).toBeNull();
  });

  // Both POST and PUT parse this schema, so an edit cannot empty a recipe out either.
  it("rejects a recipe that is nothing but a title", () => {
    const result = recipeInputSchema.safeParse({ title: "Shakshuka", description: "Eggs in tomato", notes: "From mom" });
    expect(result.success).toBe(false);
    // Both list fields carry the message so the form highlights wherever the cook starts typing.
    expect(result.error && z.flattenError(result.error).fieldErrors).toMatchObject({
      ingredients: [RECIPE_BODY_REQUIRED_MESSAGE],
      steps: [RECIPE_BODY_REQUIRED_MESSAGE],
    });

    // Blank-ish lists do not count, but either list alone is enough.
    expect(recipeInputSchema.safeParse({ title: "x", ingredients: [], steps: [] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ title: "x", ingredients: ["4 eggs"] }).success).toBe(true);
    expect(recipeInputSchema.safeParse({ title: "x", steps: ["Bake."] }).success).toBe(true);
  });

  it("replaces children on update and bumps updatedAt", async () => {
    const created = await createRecipe(userId, base());
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateRecipe(userId, created.id, base({ title: "Shakshuka v2", ingredients: ["6 eggs"], tags: ["brunch"], totalMinutes: 45 }));
    expect(updated?.title).toBe("Shakshuka v2");
    expect(updated?.ingredients).toEqual(["6 eggs"]);
    expect(updated?.ingredientCount).toBe(1);
    expect(updated?.tags).toEqual(["brunch"]);
    expect(updated?.totalMinutes).toBe(45);
    expect(updated!.updatedAt > created.updatedAt).toBe(true);
    expect(await updateRecipe(userId, 9999, base())).toBeNull();
    // the orphaned tags disappear from the tag list
    expect((await listTags(userId)).map((t) => t.name)).toEqual(["brunch"]);
  });

  it("deletes a recipe and everything attached to it", async () => {
    const created = await createRecipe(userId, base());
    await addCookLog(userId, created.id, { rating: 5 });
    expect(await deleteRecipe(userId, created.id)).toEqual({ photoUrl: null });
    expect(await getRecipe(userId, created.id)).toBeNull();
    expect(await deleteRecipe(userId, created.id)).toBeNull();
    expect(await listRecipes(userId)).toEqual([]);
  });

  it("toggles favourite without touching updatedAt, and sets photos", async () => {
    const created = await createRecipe(userId, base());
    const fav = await patchRecipe(userId, created.id, { isFavorite: true });
    expect(fav?.isFavorite).toBe(true);
    expect(fav?.updatedAt).toBe(created.updatedAt);
    const withPhoto = await setRecipePhoto(userId, created.id, "https://example.com/p.jpg");
    expect(withPhoto?.photoUrl).toBe("https://example.com/p.jpg");
    expect(await patchRecipe(userId, 9999, { isFavorite: true })).toBeNull();
  });

  it("searches by title, ingredient, and tag", async () => {
    await createRecipe(userId, base());
    await createRecipe(userId, base({ title: "Pad Thai", ingredients: ["rice noodles", "tamarind"], tags: ["dinner", "thai"] }));
    await createRecipe(userId, base({ title: "Granola", ingredients: ["oats", "honey"], tags: ["breakfast"] }));

    const titles = async (q: string) => (await listRecipes(userId, { q })).map((r) => r.title).sort();
    expect(await titles("shak")).toEqual(["Shakshuka"]);
    expect(await titles("TAMARIND")).toEqual(["Pad Thai"]);
    expect(await titles("breakfast")).toEqual(["Granola", "Shakshuka"]);
    expect(await titles("100%")).toEqual([]);
    expect((await listRecipes(userId, { tag: "Thai" })).map((r) => r.title)).toEqual(["Pad Thai"]);
    expect((await listRecipes(userId, { difficulty: "hard" })).length).toBe(0);
  });

  it("filters favourites and sorts", async () => {
    const a = await createRecipe(userId, base({ title: "Alpha", ingredients: ["x", "y", "z"], prepMinutes: 5, cookMinutes: 5 }));
    const b = await createRecipe(userId, base({ title: "beta", ingredients: ["x"], prepMinutes: null, cookMinutes: null }));
    const c = await createRecipe(userId, base({ title: "Gamma", ingredients: ["x", "y"], prepMinutes: 60, cookMinutes: 0 }));
    await patchRecipe(userId, b.id, { isFavorite: true });
    await addCookLog(userId, a.id, { cookedOn: "2026-01-10" });
    await addCookLog(userId, a.id, { cookedOn: "2026-03-01" });
    await addCookLog(userId, c.id, { cookedOn: "2026-02-01" });

    const names = async (sort: RecipeSort, extra = {}) =>
      (await listRecipes(userId, { sort, ...extra })).map((r) => r.title);

    expect(await names("title")).toEqual(["Alpha", "beta", "Gamma"]);
    expect(await names("ingredientCount")).toEqual(["beta", "Gamma", "Alpha"]);
    expect(await names("cookCount")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("lastCooked")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("totalTime")).toEqual(["Alpha", "Gamma", "beta"]);
    expect(await names("updated", { favorite: true })).toEqual(["beta"]);

    const alpha = (await listRecipes(userId)).find((r) => r.id === a.id)!;
    expect(alpha.cookCount).toBe(2);
    expect(alpha.lastCookedOn).toBe("2026-03-01");
  });

  it("logs and removes cooks", async () => {
    const created = await createRecipe(userId, base());
    const log = await addCookLog(userId, created.id, { rating: 4, notes: "too much salt" });
    expect(log?.cookedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(log?.rating).toBe(4);
    const detail = await getRecipe(userId, created.id);
    expect(detail?.cookLogs).toHaveLength(1);
    expect(detail?.cookCount).toBe(1);
    expect(await addCookLog(userId, 9999, {})).toBeNull();
    expect(await deleteCookLog(userId, log!.id)).toBe(true);
    expect(await deleteCookLog(userId, log!.id)).toBe(false);
  });

  it("lists tags with usage counts", async () => {
    await createRecipe(userId, base({ tags: ["a", "b"] }));
    await createRecipe(userId, base({ tags: ["b"] }));
    expect(await listTags(userId)).toEqual([
      { id: expect.any(Number), name: "b", recipeCount: 2 },
      { id: expect.any(Number), name: "a", recipeCount: 1 },
    ]);
  });

  it("keeps one cook's shelf out of another's", async () => {
    const other = await createTestUser({ role: "member" });
    await createRecipe(userId, base({ title: "Mine" }));
    const theirs = await createRecipe(other, base({ title: "Theirs", tags: ["their secret"] }));

    expect((await listRecipes(userId)).map((r) => r.title)).toEqual(["Mine"]);
    expect(await getRecipe(userId, theirs.id)).toBeNull();
    expect(await updateRecipe(userId, theirs.id, base({ title: "Hijacked" }))).toBeNull();
    expect(await patchRecipe(userId, theirs.id, { isFavorite: true })).toBeNull();
    expect(await setRecipePhoto(userId, theirs.id, "https://example.com/p.jpg")).toBeNull();
    expect(await addCookLog(userId, theirs.id, {})).toBeNull();
    expect(await deleteRecipe(userId, theirs.id)).toBeNull();

    const theirLog = await addCookLog(other, theirs.id, { rating: 5 });
    expect(await updateCookLog(userId, theirLog!.id, { rating: 1 })).toBeNull();
    expect(await deleteCookLog(userId, theirLog!.id)).toBe(false);

    expect((await listTags(userId)).map((t) => t.name)).not.toContain("their secret");
    // and none of that touched the other cook's copy
    expect(await getRecipe(other, theirs.id)).toMatchObject({ title: "Theirs", isFavorite: false, cookCount: 1 });
  });
});
