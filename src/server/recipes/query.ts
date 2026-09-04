import { RECIPE_SORTS, type RecipeListQuery, type RecipeSort } from "./types";
import { DIFFICULTIES, type Difficulty } from "@/server/db/schema";

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function first(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Turn URL search params into a list query, ignoring anything malformed. */
export function parseListQuery(params: RawParams): Required<Omit<RecipeListQuery, "difficulty">> & { difficulty?: Difficulty } {
  const q = first(params, "q")?.trim().slice(0, 200) ?? "";
  const tag = first(params, "tag")?.trim().slice(0, 40) ?? "";
  const category = first(params, "category")?.trim().slice(0, 60) ?? "";
  const difficultyRaw = first(params, "difficulty");
  const difficulty = (DIFFICULTIES as readonly string[]).includes(difficultyRaw ?? "") ? (difficultyRaw as Difficulty) : undefined;
  const favorite = ["1", "true", "yes"].includes(first(params, "favorite") ?? "");
  const sortRaw = first(params, "sort");
  const sort: RecipeSort = (RECIPE_SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as RecipeSort) : "updated";
  return { q, tag, category, difficulty, favorite, sort };
}
