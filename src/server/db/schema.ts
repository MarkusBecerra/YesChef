import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The core object everything else hangs off of. */
export const recipes = sqliteTable(
  "recipes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    /** Short blurb shown on cards. */
    description: text("description"),
    /** Longer free-form notes (tips, substitutions, history). */
    notes: text("notes"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    /** Explicit total; when null the UI shows prep + cook. */
    totalMinutes: integer("total_minutes"),
    servings: integer("servings"),
    /** Free-text yield, e.g. "12 muffins". */
    yieldText: text("yield_text"),
    difficulty: text("difficulty", { enum: DIFFICULTIES }),
    category: text("category"),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    photoUrl: text("photo_url"),
    /** 1–4, rendered as $ to $$$$. */
    costRating: integer("cost_rating"),
    /** Amount spent on the last shop for this recipe. */
    costAmount: real("cost_amount"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    /** Denormalised on write so lists can sort/filter by it cheaply. */
    ingredientCount: integer("ingredient_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("recipes_title_idx").on(t.title), index("recipes_updated_idx").on(t.updatedAt)],
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** One ingredient line as written, e.g. "2 cups all-purpose flour". */
    text: text("text").notNull(),
  },
  (t) => [index("ingredients_recipe_idx").on(t.recipeId, t.position)],
);

export const steps = sqliteTable(
  "steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("steps_recipe_idx").on(t.recipeId, t.position)],
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Normalised: trimmed, lower-case, single spaces. */
  name: text("name").notNull().unique(),
});

export const recipeTags = sqliteTable(
  "recipe_tags",
  {
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] }), index("recipe_tags_tag_idx").on(t.tagId)],
);

/** One row per time a recipe was cooked. "Mastery" is just the visible trail of these. */
export const cookLogs = sqliteTable(
  "cook_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    /** Calendar date it was cooked, YYYY-MM-DD. */
    cookedOn: text("cooked_on").notNull(),
    /** 1–5, optional. */
    rating: integer("rating"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("cook_logs_recipe_idx").on(t.recipeId, t.cookedOn)],
);
