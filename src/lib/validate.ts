import { z } from "zod";
import { HttpError, readJson } from "./http";

export type ValidationDetails = { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> };

/** Read and validate a JSON body; 400 with field errors when it doesn't match. */
export async function parseBody<T extends z.ZodType>(schema: T, request: Request): Promise<z.output<T>> {
  const body = await readJson(request);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "Please fix the highlighted fields", z.flattenError(result.error) satisfies ValidationDetails);
  }
  return result.data;
}
