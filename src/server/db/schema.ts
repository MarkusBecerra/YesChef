import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The core object everything else hangs off of. */
export const recipes = sqliteTable(
  "recipes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /**
     * Owner of the recipe. Nullable only for rows written before accounts existed: the
     * first account created claims them (see claimUnownedRecipes), and everything the app
     * reads is filtered by this column, so an unclaimed row is invisible to every user.
     */
    userId: integer("user_id").references(() => users.id),
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
  (t) => [
    index("recipes_title_idx").on(t.title),
    index("recipes_updated_idx").on(t.updatedAt),
    index("recipes_user_idx").on(t.userId, t.updatedAt),
  ],
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

/**
 * A person with an account. The app is deliberately tiny - the owner plus a handful of
 * friends - so the user table is capped in the service layer rather than by a plan.
 */
export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Stored lower-cased; the unique index is what enforces "one account per address". */
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>` - see server/auth/password.ts. */
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  /**
   * Bumped to invalidate every session token already issued to this user (password change,
   * "sign out everywhere"). Sessions are stateless, so this is the only revocation handle.
   */
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Sign-ups are invite-only: one row per code the owner hands out, spent on first use.
 * The code is stored as typed, not hashed, because the owner has to be able to read it
 * back weeks later to re-send it - it is a single-use, capped, low-value secret living in
 * the owner's own database, and an unreadable list would just move it into a notes app.
 */
export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Upper-case, dash-grouped, e.g. "YESCHEF-7K2Q-9F4M". Compared case-insensitively. */
    code: text("code").notNull().unique(),
    /** Who it's for, as a reminder to the owner: "Sam", "cousin from Denver". */
    label: text("label"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    /** Set when spent; a code with a user on it can never be used again. */
    usedByUserId: integer("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("invite_codes_created_idx").on(t.createdAt)],
);
