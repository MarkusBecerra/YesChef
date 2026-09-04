import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PhotoStorage } from "./types";

export const LOCAL_UPLOADS_ROUTE = "/api/v1/uploads";

/** Dev/self-hosted storage: files under data/uploads, served by the uploads route handler. */
export function createLocalStorage(dir = path.join(process.cwd(), "data", "uploads")): PhotoStorage {
  return {
    async put({ bytes, extension }) {
      await mkdir(dir, { recursive: true });
      const name = `${crypto.randomUUID()}.${extension}`;
      await writeFile(path.join(dir, name), bytes);
      return { url: `${LOCAL_UPLOADS_ROUTE}/${name}` };
    },
    async delete(url) {
      const name = localFileName(url);
      if (!name) return;
      await rm(path.join(dir, name), { force: true });
    },
  };
}

/** The bare file name for a local upload URL, or null when it isn't one (or looks unsafe). */
export function localFileName(url: string): string | null {
  const prefix = `${LOCAL_UPLOADS_ROUTE}/`;
  if (!url.startsWith(prefix)) return null;
  const name = url.slice(prefix.length);
  return /^[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(name) ? name : null;
}
