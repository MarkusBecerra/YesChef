/** Small helpers for JSON route handlers. */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string, details?: unknown): Response {
  return Response.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status });
}

/** Wrap a handler so thrown HttpErrors (and unexpected errors) become JSON responses. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.status, err.message, err.details);
      console.error(err);
      return jsonError(500, "Something went wrong");
    }
  };
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}
