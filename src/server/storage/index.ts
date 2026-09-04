import { createLocalStorage } from "./local";
import type { PhotoStorage } from "./types";
import { createVercelBlobStorage } from "./vercel-blob";

export type { PhotoStorage } from "./types";
export { MAX_PHOTO_BYTES, extensionFor } from "./types";

let cached: PhotoStorage | undefined;

/** Vercel Blob when a token is configured, otherwise the local data/uploads folder. */
export function getPhotoStorage(): PhotoStorage {
  if (!cached) {
    cached = process.env.BLOB_READ_WRITE_TOKEN ? createVercelBlobStorage() : createLocalStorage();
  }
  return cached;
}
