/** Where recipe photos live. Implemented by local disk (dev) and Vercel Blob (prod). */
export interface PhotoStorage {
  /** Store bytes and return a URL the browser can load. */
  put(input: { bytes: Uint8Array; contentType: string; extension: string }): Promise<{ url: string }>;
  /** Remove a previously stored photo by its URL. Never throws for unknown URLs. */
  delete(url: string): Promise<void>;
}

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function extensionFor(contentType: string): string | null {
  return EXTENSIONS[contentType.toLowerCase().split(";")[0].trim()] ?? null;
}

export function contentTypeFor(extension: string): string | null {
  const ext = extension.toLowerCase();
  return Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? null;
}
