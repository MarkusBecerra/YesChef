import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { cleanTags, extractJsonLdRecipe, parseIsoDuration } from "./jsonld";

const graphPage = `<!doctype html><html><head>
<script type="application/ld+json">{ not json }</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"Blog"},
  {"@type":"Recipe","name":"Best &amp; Easiest Shakshuka","description":"<p>Eggs in tomato.</p>",
   "image":{"@type":"ImageObject","url":"https://img.example/shak.jpg"},
   "author":{"@type":"Person","name":"Jo Cook"},
   "prepTime":"PT10M","cookTime":"PT25M","totalTime":"PT35M","recipeYield":["4","4 servings"],
   "recipeIngredient":["4 eggs","1 can crushed tomatoes"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Sauce","itemListElement":[{"@type":"HowToStep","text":"Soften onion."},{"@type":"HowToStep","text":"Add tomatoes."}]},
     {"@type":"HowToStep","text":"Crack in eggs."}
   ],
   "keywords":"Breakfast, Vegetarian","recipeCuisine":"Middle Eastern","recipeCategory":["Breakfast","Brunch"]}
]}
</script></head><body></body></html>`;

describe("JSON-LD recipe import", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT45M")).toBe(45);
    expect(parseIsoDuration("PT1H30M")).toBe(90);
    expect(parseIsoDuration("P0DT2H")).toBe(120);
    expect(parseIsoDuration("PT90S")).toBe(2);
    expect(parseIsoDuration("45 minutes")).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
  });

  it("maps a Recipe node inside @graph, skipping broken scripts", () => {
    const found = extractJsonLdRecipe(cheerio.load(graphPage));
    expect(found).not.toBeNull();
    const { draft, imageUrl, author } = found!;
    expect(draft.title).toBe("Best & Easiest Shakshuka");
    expect(draft.description).toBe("Eggs in tomato.");
    expect(draft.ingredients).toEqual(["4 eggs", "1 can crushed tomatoes"]);
    expect(draft.steps).toEqual(["Soften onion.", "Add tomatoes.", "Crack in eggs."]);
    expect(draft.prepMinutes).toBe(10);
    expect(draft.cookMinutes).toBe(25);
    expect(draft.totalMinutes).toBe(35);
    expect(draft.servings).toBe(4);
    expect(draft.yieldText).toBeNull();
    expect(draft.category).toBe("Breakfast");
    expect(draft.tags).toEqual(["middle eastern", "breakfast", "vegetarian"]);
    expect(imageUrl).toBe("https://img.example/shak.jpg");
    expect(author).toBe("Jo Cook");
  });

  it("handles string instructions, non-serving yields, and image arrays", () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Muffins",
      "recipeIngredient":"2 cups flour, 1 egg","recipeInstructions":"Mix.\\nBake.",
      "recipeYield":"12 muffins","image":["https://img.example/a.jpg","https://img.example/b.jpg"]}</script>`;
    const { draft, imageUrl } = extractJsonLdRecipe(cheerio.load(html))!;
    expect(draft.ingredients).toEqual(["2 cups flour", "1 egg"]);
    expect(draft.steps).toEqual(["Mix.", "Bake."]);
    expect(draft.servings).toBe(12);
    expect(draft.yieldText).toBe("12 muffins");
    expect(imageUrl).toBe("https://img.example/a.jpg");
  });

  it("returns null when there is no Recipe node", () => {
    expect(extractJsonLdRecipe(cheerio.load('<script type="application/ld+json">{"@type":"Article","name":"x"}</script>'))).toBeNull();
    expect(extractJsonLdRecipe(cheerio.load("<p>nothing</p>"))).toBeNull();
  });

  it("keeps only short tag-like keywords", () => {
    expect(cleanTags(["Cassie Best", "how to make pancakes", "Pancake Day", "flip", "FLIP", "crêpes", "make ahead", "quick", "easy", "cheap"])).toEqual([
      "cassie best",
      "pancake day",
      "flip",
      "crêpes",
      "make ahead",
      "quick",
    ]);
    expect(cleanTags([]).length).toBe(0);
  });

  it("takes the first category from a comma-joined string", () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"P","recipeIngredient":["a"],"recipeCategory":"Breakfast, Brunch, Main course"}</script>`;
    expect(extractJsonLdRecipe(cheerio.load(html))!.draft.category).toBe("Breakfast");
  });
});
